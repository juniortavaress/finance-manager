import datetime as dt

from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import (
    Account,
    Asset,
    AssetTransaction,
    Bank,
    CreditCard,
    Dividend,
    DividendSchedule,
    InvestmentAccount,
    RecurringTransaction,
    Settlement,
    SharedExpense,
    Transaction,
)

accounts_bp = Blueprint("accounts", __name__)


def _account_usage_counts(user_id, account_id):
    counts = {
        "transactions": Transaction.query.filter_by(user_id=user_id, account_id=account_id).count(),
        "recurring_transactions": RecurringTransaction.query.filter_by(
            user_id=user_id, account_id=account_id
        ).count(),
    }
    investment_account = InvestmentAccount.query.filter_by(account_id=account_id).first()
    if investment_account is not None:
        counts["assets"] = Asset.query.filter_by(investment_account_id=investment_account.id).count()
    return counts


def _delete_account_cascade(account):
    account_tx_ids = db.session.query(Transaction.id).filter(Transaction.account_id == account.id)

    # A contraparte de uma transferencia (em outra conta) aponta para a
    # transacao que vai sumir: so' desfaz o vinculo, o lancamento dela fica.
    Transaction.query.filter(
        Transaction.transfer_pair_id.in_(account_tx_ids), Transaction.account_id != account.id
    ).update({"transfer_pair_id": None}, synchronize_session=False)

    # Compras/vendas e proventos guardam FK para as transacoes da conta de
    # investimento: precisam sair antes (senao o banco recusa a exclusao).
    if account.investment_account is not None:
        asset_ids = db.session.query(Asset.id).filter(Asset.investment_account_id == account.investment_account.id)
        Dividend.query.filter(Dividend.asset_id.in_(asset_ids)).delete(synchronize_session=False)
        DividendSchedule.query.filter(DividendSchedule.asset_id.in_(asset_ids)).delete(synchronize_session=False)
        AssetTransaction.query.filter(AssetTransaction.asset_id.in_(asset_ids)).delete(synchronize_session=False)

    # Despesas/acertos entre amigos so' guardam a conta usada para pagar/receber:
    # o acerto em si continua valendo, so' perde essa referencia.
    SharedExpense.query.filter(SharedExpense.payer_account_id == account.id).update(
        {"payer_account_id": None}, synchronize_session=False
    )
    Settlement.query.filter(Settlement.payer_account_id == account.id).update(
        {"payer_account_id": None}, synchronize_session=False
    )
    Settlement.query.filter(Settlement.receiver_account_id == account.id).update(
        {"receiver_account_id": None}, synchronize_session=False
    )

    Transaction.query.filter_by(user_id=account.user_id, account_id=account.id).delete(synchronize_session=False)
    RecurringTransaction.query.filter_by(user_id=account.user_id, account_id=account.id).delete(
        synchronize_session=False
    )
    db.session.expire_all()
    db.session.delete(account)


def _validate_card_days(card):
    try:
        closing_day, due_day = int(card.get("closing_day")), int(card.get("due_day"))
    except (TypeError, ValueError):
        raise ApiError("Informe dia de fechamento e vencimento do cartão", 400)
    if not (1 <= closing_day <= 31 and 1 <= due_day <= 31):
        raise ApiError("Os dias de fechamento e vencimento devem ficar entre 1 e 31", 400)
    if closing_day == due_day:
        raise ApiError("Dia de fechamento e vencimento devem ser diferentes", 400)


@accounts_bp.get("/")
@login_required
def list_accounts():
    include_archived = request.args.get("include_archived") == "1"
    query = Account.query.join(Bank, Bank.id == Account.bank_id).filter(Account.user_id == g.current_user.id)
    if not include_archived:
        query = query.filter(Account.archived.is_(False), Bank.archived.is_(False))
    account_type = request.args.get("type")
    if account_type:
        query = query.filter(Account.type == account_type)
    accounts = query.order_by(Account.created_at.asc()).all()
    return {"accounts": [a.to_dict() for a in accounts]}


@accounts_bp.post("/")
@login_required
def create_account():
    data = request.get_json(silent=True) or {}
    bank_id = data.get("bank_id")
    acc_type = data.get("type")
    name = (data.get("name") or "").strip()

    if acc_type not in ("checking", "credit_card", "investment"):
        raise ApiError("Tipo de conta inválido", 400)

    bank = Bank.query.filter_by(id=bank_id, user_id=g.current_user.id).first()
    if bank is None:
        raise ApiError("Banco não encontrado", 404)

    if not name:
        raise ApiError("Nome da conta é obrigatório", 400)

    if Account.query.filter_by(bank_id=bank.id, type=acc_type).first() is not None:
        raise ApiError("Este banco já tem uma conta deste tipo", 409)

    if acc_type == "credit_card":
        _validate_card_days(data.get("credit_card") or {})

    opening_balance = data.get("opening_balance", 0) or 0
    opening_date_raw = data.get("opening_balance_date")
    opening_date = dt.date.fromisoformat(opening_date_raw) if opening_date_raw else dt.date.today()

    account = Account(
        user_id=g.current_user.id,
        bank_id=bank.id,
        type=acc_type,
        name=name,
        currency=data.get("currency") or "BRL",
        balance=opening_balance,
        opening_balance=opening_balance,
        opening_balance_date=opening_date,
    )
    db.session.add(account)
    db.session.flush()

    if acc_type == "credit_card":
        cc = data.get("credit_card") or {}
        credit_card = CreditCard(
            account_id=account.id,
            credit_limit=cc.get("credit_limit", 0) or 0,
            used_amount=0,
            closing_day=cc["closing_day"],
            due_day=cc["due_day"],
        )
        db.session.add(credit_card)
    elif acc_type == "investment":
        inv = data.get("investment_account") or {}
        investment_account = InvestmentAccount(account_id=account.id, broker_name=inv.get("broker_name"))
        db.session.add(investment_account)

    db.session.commit()
    db.session.refresh(account)
    return {"account": account.to_dict()}, 201


@accounts_bp.patch("/<uuid:account_id>")
@login_required
def update_account(account_id):
    account = Account.query.filter_by(id=account_id, user_id=g.current_user.id).first()
    if account is None:
        raise ApiError("Conta não encontrada", 404)

    data = request.get_json(silent=True) or {}
    for field in ("name", "currency", "archived"):
        if field in data:
            setattr(account, field, data[field])

    if account.type == "credit_card" and "credit_card" in data and account.credit_card:
        cc = data["credit_card"]
        _validate_card_days(
            {
                "closing_day": cc.get("closing_day", account.credit_card.closing_day),
                "due_day": cc.get("due_day", account.credit_card.due_day),
            }
        )
        for field in ("credit_limit", "closing_day", "due_day"):
            if field in cc:
                setattr(account.credit_card, field, cc[field])

    db.session.commit()
    db.session.refresh(account)
    return {"account": account.to_dict()}


@accounts_bp.get("/<uuid:account_id>/usage")
@login_required
def account_usage(account_id):
    account = Account.query.filter_by(id=account_id, user_id=g.current_user.id).first()
    if account is None:
        raise ApiError("Conta não encontrada", 404)

    counts = _account_usage_counts(g.current_user.id, account_id)
    return {"total": sum(counts.values()), "counts": counts}


@accounts_bp.delete("/<uuid:account_id>")
@login_required
def delete_account(account_id):
    account = Account.query.filter_by(id=account_id, user_id=g.current_user.id).first()
    if account is None:
        raise ApiError("Conta não encontrada", 404)

    if sum(_account_usage_counts(g.current_user.id, account.id).values()) > 0:
        raise ApiError("Esta conta tem movimentações e não pode ser removida", 409)

    _delete_account_cascade(account)
    db.session.commit()
    return {"ok": True}
