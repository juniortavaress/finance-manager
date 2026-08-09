import datetime as dt

from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import Account, Bank, Category, CreditCard, CreditCardInvoice, Transaction
from app.services.finance_service import recalc_account_balance, recalc_credit_card_used_amount

credit_cards_bp = Blueprint("credit_cards", __name__)

PAYMENT_CATEGORY_NAME = "Pagamento de fatura"


def _get_or_create_payment_category(user_id):
    category = Category.query.filter_by(user_id=user_id, name=PAYMENT_CATEGORY_NAME, archived=True).first()
    if category is None:
        category = Category(
            user_id=user_id,
            name=PAYMENT_CATEGORY_NAME,
            icon="\U0001F4B3",
            color_hex="#8B9A97",
            kind="expense",
            archived=True,
        )
        db.session.add(category)
        db.session.flush()
    return category


def _get_owned_card(card_id):
    return (
        CreditCard.query.join(Account, Account.id == CreditCard.account_id)
        .join(Bank, Bank.id == Account.bank_id)
        .filter(CreditCard.id == card_id, Account.user_id == g.current_user.id, Bank.archived.is_(False))
        .first()
    )


@credit_cards_bp.get("/")
@login_required
def list_credit_cards():
    cards = (
        CreditCard.query.join(Account, Account.id == CreditCard.account_id)
        .join(Bank, Bank.id == Account.bank_id)
        .filter(Account.user_id == g.current_user.id, Account.archived.is_(False), Bank.archived.is_(False))
        .all()
    )
    result = []
    for card in cards:
        data = card.to_dict()
        data["account"] = card.account.to_dict()
        result.append(data)
    return {"credit_cards": result}


@credit_cards_bp.get("/<uuid:card_id>/invoices")
@login_required
def list_invoices(card_id):
    card = _get_owned_card(card_id)
    if card is None:
        raise ApiError("Cartao nao encontrado", 404)

    query = CreditCardInvoice.query.filter_by(credit_card_id=card.id).order_by(
        CreditCardInvoice.reference_month.desc()
    )
    limit = request.args.get("limit")
    if limit:
        query = query.limit(int(limit))
    invoices = query.all()
    return {"invoices": [i.to_dict() for i in invoices]}


@credit_cards_bp.get("/<uuid:card_id>/invoices/<uuid:invoice_id>")
@login_required
def get_invoice(card_id, invoice_id):
    card = _get_owned_card(card_id)
    if card is None:
        raise ApiError("Cartao nao encontrado", 404)

    invoice = CreditCardInvoice.query.filter_by(id=invoice_id, credit_card_id=card.id).first()
    if invoice is None:
        raise ApiError("Fatura nao encontrada", 404)

    data = invoice.to_dict()
    data["transactions"] = [t.to_dict() for t in invoice.transactions]
    return {"invoice": data}


@credit_cards_bp.post("/<uuid:card_id>/invoices/<uuid:invoice_id>/pay")
@login_required
def pay_invoice(card_id, invoice_id):
    card = _get_owned_card(card_id)
    if card is None:
        raise ApiError("Cartao nao encontrado", 404)

    invoice = CreditCardInvoice.query.filter_by(id=invoice_id, credit_card_id=card.id).first()
    if invoice is None:
        raise ApiError("Fatura nao encontrada", 404)

    data = request.get_json(silent=True) or {}
    account_id = data.get("account_id")

    account = Account.query.filter_by(
        id=account_id, user_id=g.current_user.id, type="checking", archived=False
    ).first()
    if account is None:
        raise ApiError("Conta corrente nao encontrada", 404)
    category = _get_or_create_payment_category(g.current_user.id)

    outstanding = invoice.total_amount - invoice.paid_amount
    if outstanding <= 0:
        raise ApiError("Fatura ja esta quitada", 400)

    bank_name = card.account.bank.name if card.account and card.account.bank else "cartao"
    tx = Transaction(
        user_id=g.current_user.id,
        account_id=account.id,
        category_id=category.id,
        description=f"Pagamento fatura {bank_name} {invoice.reference_month.strftime('%m/%Y')}",
        amount=outstanding,
        type="expense",
        date=dt.date.today(),
        payment_method="debit",
        status="confirmed",
    )
    db.session.add(tx)
    db.session.flush()

    invoice.paid_amount = invoice.total_amount
    invoice.status = "paid"
    invoice.paid_at = dt.datetime.now(dt.timezone.utc)

    recalc_account_balance(account)
    recalc_credit_card_used_amount(card)

    db.session.commit()
    return {"invoice": invoice.to_dict(), "transaction": tx.to_dict()}
