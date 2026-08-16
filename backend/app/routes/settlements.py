import datetime as dt
from decimal import Decimal, ROUND_HALF_UP

from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import Account, Category, GroupMember, Settlement
from app.models.transaction import Transaction
from app.routes.friends import are_friends
from app.services.finance_service import (
    apply_transaction_side_effects,
    get_or_create_invoice,
    invoice_month_for_date,
    recalc_account_balance,
    recalc_credit_card_used_amount,
    recalc_invoice_total,
)

settlements_bp = Blueprint("settlements", __name__)


def _friend_pair(user_a_id, user_b_id):
    return sorted([user_a_id, user_b_id], key=str)


def _resolve_category(category_id, kind):
    """Categoria escolhida pelo usuario pra transacao do acerto -- obrigatoria
    sempre que uma conta e informada (ou seja, uma transacao vai ser criada de
    fato); a categoria automatica de sistema nao aparece como opcao."""
    if not category_id:
        raise ApiError("Selecione a categoria", 400)
    category = Category.query.filter_by(id=category_id, user_id=g.current_user.id, archived=False).first()
    if category is None or category.kind not in (kind, "both"):
        raise ApiError("Categoria inválida", 400)
    return category


def _resolve_scope(data):
    group_id = data.get("group_id")
    friend_user_id = data.get("friend_user_id")

    if group_id and friend_user_id:
        raise ApiError("Informe apenas grupo ou amigo, não os dois", 400)

    if group_id:
        membership = GroupMember.query.filter_by(group_id=group_id, user_id=g.current_user.id).first()
        if membership is None:
            raise ApiError("Grupo não encontrado", 404)
        member_ids = {str(m.user_id) for m in GroupMember.query.filter_by(group_id=group_id).all()}
        return group_id, None, None, member_ids

    if friend_user_id:
        if not are_friends(g.current_user.id, friend_user_id):
            raise ApiError("Vocês não são amigos", 404)
        low, high = _friend_pair(g.current_user.id, friend_user_id)
        return None, low, high, {str(g.current_user.id), str(friend_user_id)}

    raise ApiError("Informe o grupo ou o amigo desse acerto", 400)


@settlements_bp.post("/")
@login_required
def create_settlement():
    data = request.get_json(silent=True) or {}

    payer_id = data.get("payer_id") or str(g.current_user.id)
    receiver_id = data.get("receiver_id")
    amount = data.get("amount")
    date_raw = data.get("date")
    payer_account_id = data.get("payer_account_id")
    category_id = data.get("category_id")

    if str(payer_id) != str(g.current_user.id):
        raise ApiError("Só é possível registrar um acerto em que você é quem pagou", 400)
    if not receiver_id:
        raise ApiError("Informe quem recebeu o pagamento", 400)
    if str(receiver_id) == str(payer_id):
        raise ApiError("Pagador e recebedor precisam ser pessoas diferentes", 400)
    if not amount or Decimal(str(amount)) <= 0:
        raise ApiError("Valor deve ser maior que zero", 400)
    if not date_raw:
        raise ApiError("Data é obrigatória", 400)

    amount = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    group_id, friend_low, friend_high, allowed_ids = _resolve_scope(data)

    if str(receiver_id) not in allowed_ids:
        raise ApiError("Quem recebeu precisa fazer parte do grupo ou da amizade", 400)

    settlement = Settlement(
        group_id=group_id,
        friend_user_low_id=friend_low,
        friend_user_high_id=friend_high,
        payer_id=payer_id,
        receiver_id=receiver_id,
        amount=amount,
        date=dt.date.fromisoformat(date_raw),
    )
    db.session.add(settlement)
    db.session.flush()

    if payer_account_id:
        account = Account.query.filter_by(id=payer_account_id, user_id=g.current_user.id, archived=False).first()
        if account is None:
            raise ApiError("Conta não encontrada", 404)

        category = _resolve_category(category_id, "expense")
        is_credit = account.type == "credit_card"
        if is_credit and not account.credit_card:
            raise ApiError("Conta selecionada não é um cartão de crédito", 400)

        tx = Transaction(
            user_id=g.current_user.id,
            account_id=account.id,
            category_id=category.id,
            description="Acerto de contas",
            amount=amount,
            type="expense",
            date=settlement.date,
            payment_method="credit" if is_credit else "debit",
            status="confirmed",
        )
        if is_credit:
            ref_month = invoice_month_for_date(account.credit_card, settlement.date)
            invoice = get_or_create_invoice(account.credit_card, ref_month)
            tx.credit_card_invoice_id = invoice.id

        db.session.add(tx)
        db.session.flush()
        apply_transaction_side_effects(tx, account)
        if is_credit:
            recalc_invoice_total(tx.credit_card_invoice)
            recalc_credit_card_used_amount(account.credit_card)

        settlement.payer_account_id = account.id
        settlement.payer_transaction_id = tx.id

    db.session.commit()
    return {"settlement": settlement.to_dict()}, 201


@settlements_bp.post("/receive")
@login_required
def register_receipt_directly():
    """Voce e quem tem a receber e o amigo te pagou por fora (dinheiro, pix direto
    etc), sem passar pelo fluxo normal de acerto. Voce mesmo registra o recebimento
    escolhendo sua propria conta -- quita o saldo na hora, sem depender do amigo
    fazer nada no app (diferente do settlement normal, que exige o pagador confirmar
    o proprio lado)."""
    data = request.get_json(silent=True) or {}

    payer_id = data.get("payer_id")
    amount = data.get("amount")
    date_raw = data.get("date")
    receiver_account_id = data.get("receiver_account_id")
    category_id = data.get("category_id")

    if not payer_id:
        raise ApiError("Informe quem te pagou", 400)
    if str(payer_id) == str(g.current_user.id):
        raise ApiError("Pagador e recebedor precisam ser pessoas diferentes", 400)
    if not amount or Decimal(str(amount)) <= 0:
        raise ApiError("Valor deve ser maior que zero", 400)
    if not date_raw:
        raise ApiError("Data é obrigatória", 400)
    if not receiver_account_id:
        raise ApiError("Informe a conta de entrada", 400)

    category = _resolve_category(category_id, "income")

    amount = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    group_id, friend_low, friend_high, allowed_ids = _resolve_scope(data)

    if str(payer_id) not in allowed_ids:
        raise ApiError("Quem pagou precisa fazer parte do grupo ou da amizade", 400)

    account = Account.query.filter_by(id=receiver_account_id, user_id=g.current_user.id, archived=False).first()
    if account is None:
        raise ApiError("Conta não encontrada", 404)

    settlement = Settlement(
        group_id=group_id,
        friend_user_low_id=friend_low,
        friend_user_high_id=friend_high,
        payer_id=payer_id,
        receiver_id=g.current_user.id,
        amount=amount,
        date=dt.date.fromisoformat(date_raw),
    )
    db.session.add(settlement)
    db.session.flush()

    tx = Transaction(
        user_id=g.current_user.id,
        account_id=account.id,
        category_id=category.id,
        description="Acerto de contas",
        amount=amount,
        type="income",
        date=settlement.date,
        payment_method="debit",
        status="confirmed",
    )
    db.session.add(tx)
    db.session.flush()
    apply_transaction_side_effects(tx, account)

    settlement.receiver_account_id = account.id
    settlement.receiver_transaction_id = tx.id

    db.session.commit()
    return {"settlement": settlement.to_dict()}, 201


@settlements_bp.post("/<uuid:settlement_id>/record-receipt")
@login_required
def record_receipt(settlement_id):
    settlement = Settlement.query.filter_by(id=settlement_id, receiver_id=g.current_user.id).first()
    if settlement is None:
        raise ApiError("Acerto não encontrado", 404)
    if settlement.receiver_transaction_id is not None:
        raise ApiError("Esse recebimento já foi registrado", 400)

    data = request.get_json(silent=True) or {}
    account_id = data.get("account_id")
    category_id = data.get("category_id")
    if not account_id:
        raise ApiError("Informe a conta", 400)

    category = _resolve_category(category_id, "income")

    account = Account.query.filter_by(id=account_id, user_id=g.current_user.id, archived=False).first()
    if account is None:
        raise ApiError("Conta não encontrada", 404)

    tx = Transaction(
        user_id=g.current_user.id,
        account_id=account.id,
        category_id=category.id,
        description="Acerto de contas",
        amount=settlement.amount,
        type="income",
        date=dt.date.today(),
        payment_method="debit",
        status="confirmed",
    )
    db.session.add(tx)
    db.session.flush()
    apply_transaction_side_effects(tx, account)

    settlement.receiver_account_id = account.id
    settlement.receiver_transaction_id = tx.id

    db.session.commit()
    return {"settlement": settlement.to_dict()}


@settlements_bp.get("/")
@login_required
def list_settlements():
    group_id = request.args.get("group_id")
    friend_user_id = request.args.get("friend_user_id")

    query = Settlement.query
    if group_id:
        query = query.filter_by(group_id=group_id)
    elif friend_user_id:
        low, high = _friend_pair(g.current_user.id, friend_user_id)
        query = query.filter_by(group_id=None, friend_user_low_id=low, friend_user_high_id=high)
    else:
        raise ApiError("Informe group_id ou friend_user_id", 400)

    settlements = query.order_by(Settlement.date.desc()).all()
    return {"settlements": [s.to_dict() for s in settlements]}


@settlements_bp.get("/pending-receipts")
@login_required
def pending_receipts():
    settlements = Settlement.query.filter_by(receiver_id=g.current_user.id, receiver_transaction_id=None).all()
    return {"settlements": [s.to_dict() for s in settlements]}


@settlements_bp.delete("/<uuid:settlement_id>")
@login_required
def delete_settlement(settlement_id):
    settlement = Settlement.query.get(settlement_id)
    if settlement is None:
        raise ApiError("Acerto não encontrado", 404)

    me = str(g.current_user.id)
    if me not in (str(settlement.payer_id), str(settlement.receiver_id)):
        raise ApiError("Acerto não encontrado", 404)

    payer_tx = Transaction.query.get(settlement.payer_transaction_id) if settlement.payer_transaction_id else None
    receiver_tx = (
        Transaction.query.get(settlement.receiver_transaction_id) if settlement.receiver_transaction_id else None
    )
    payer_account = payer_tx.account if payer_tx else None
    receiver_account = receiver_tx.account if receiver_tx else None

    if payer_tx:
        db.session.delete(payer_tx)
    if receiver_tx:
        db.session.delete(receiver_tx)
    db.session.delete(settlement)
    db.session.flush()

    if payer_account:
        recalc_account_balance(payer_account)
    if receiver_account:
        recalc_account_balance(receiver_account)

    db.session.commit()
    return {"ok": True}
