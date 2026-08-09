import datetime as dt
from decimal import Decimal, ROUND_HALF_UP

from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import Account, BillReminder, Category, Transaction
from app.services.finance_service import (
    add_months,
    get_or_create_invoice,
    invoice_month_for_date,
    recalc_account_balance,
    recalc_credit_card_used_amount,
    recalc_invoice_total,
    safe_day,
)

reminders_bp = Blueprint("reminders", __name__)


def _due_date_for(day_of_month, reference=None):
    reference = reference or dt.date.today()
    return dt.date(reference.year, reference.month, safe_day(reference.year, reference.month, day_of_month))


def _advance_if_needed(reminder):
    """Se o periodo atual ja foi pago e a data de vencimento ja passou, abre o proximo periodo."""
    today = dt.date.today()
    if reminder.paid_at is not None and reminder.current_due_date < today:
        next_due = add_months(reminder.current_due_date, 1)
        reminder.current_due_date = _due_date_for(reminder.day_of_month, next_due)
        reminder.paid_at = None


@reminders_bp.get("/")
@login_required
def list_reminders():
    reminders = BillReminder.query.filter_by(user_id=g.current_user.id).all()
    for reminder in reminders:
        if reminder.active:
            _advance_if_needed(reminder)
    db.session.commit()

    reminders = sorted(reminders, key=lambda r: r.current_due_date)
    return {"bill_reminders": [r.to_dict() for r in reminders]}


@reminders_bp.post("/")
@login_required
def create_reminder():
    data = request.get_json(silent=True) or {}

    description = (data.get("description") or "").strip()
    amount = data.get("amount")
    account_id = data.get("account_id")
    category_id = data.get("category_id")
    day_of_month = data.get("day_of_month")

    if not description:
        raise ApiError("Descricao e obrigatoria", 400)
    if not amount or Decimal(str(amount)) <= 0:
        raise ApiError("Valor deve ser maior que zero", 400)
    if not day_of_month or not (1 <= int(day_of_month) <= 31):
        raise ApiError("Dia de vencimento invalido", 400)

    account = Account.query.filter_by(id=account_id, user_id=g.current_user.id).first()
    if account is None:
        raise ApiError("Conta nao encontrada", 404)
    category = Category.query.filter_by(id=category_id, user_id=g.current_user.id, archived=False).first()
    if category is None:
        raise ApiError("Categoria nao encontrada", 404)

    reminder = BillReminder(
        user_id=g.current_user.id,
        account_id=account.id,
        category_id=category.id,
        description=description,
        amount=Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        day_of_month=int(day_of_month),
        active=True,
        current_due_date=_due_date_for(int(day_of_month)),
        paid_at=None,
    )
    db.session.add(reminder)
    db.session.commit()

    return {"bill_reminder": reminder.to_dict()}, 201


@reminders_bp.patch("/<uuid:reminder_id>")
@login_required
def update_reminder(reminder_id):
    reminder = BillReminder.query.filter_by(id=reminder_id, user_id=g.current_user.id).first()
    if reminder is None:
        raise ApiError("Lembrete nao encontrado", 404)

    data = request.get_json(silent=True) or {}
    if "description" in data:
        description = (data["description"] or "").strip()
        if not description:
            raise ApiError("Descricao e obrigatoria", 400)
        reminder.description = description
    if "amount" in data:
        amount = data["amount"]
        if not amount or Decimal(str(amount)) <= 0:
            raise ApiError("Valor deve ser maior que zero", 400)
        reminder.amount = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if "category_id" in data:
        category = Category.query.filter_by(
            id=data["category_id"], user_id=g.current_user.id, archived=False
        ).first()
        if category is None:
            raise ApiError("Categoria nao encontrada", 404)
        reminder.category_id = category.id
    if "day_of_month" in data:
        day_of_month = data["day_of_month"]
        if not day_of_month or not (1 <= int(day_of_month) <= 31):
            raise ApiError("Dia de vencimento invalido", 400)
        reminder.day_of_month = int(day_of_month)
        if reminder.paid_at is None:
            reminder.current_due_date = _due_date_for(reminder.day_of_month, reminder.current_due_date)
    if "active" in data:
        reminder.active = bool(data["active"])

    db.session.commit()
    return {"bill_reminder": reminder.to_dict()}


@reminders_bp.delete("/<uuid:reminder_id>")
@login_required
def delete_reminder(reminder_id):
    reminder = BillReminder.query.filter_by(id=reminder_id, user_id=g.current_user.id).first()
    if reminder is None:
        raise ApiError("Lembrete nao encontrado", 404)

    db.session.delete(reminder)
    db.session.commit()
    return {"ok": True}


@reminders_bp.post("/<uuid:reminder_id>/mark-paid")
@login_required
def mark_paid(reminder_id):
    reminder = BillReminder.query.filter_by(id=reminder_id, user_id=g.current_user.id).first()
    if reminder is None:
        raise ApiError("Lembrete nao encontrado", 404)
    if reminder.paid_at is not None:
        raise ApiError("Este lembrete ja foi marcado como pago neste periodo", 400)

    today = dt.date.today()
    account = reminder.account
    is_credit = account.type == "credit_card" and account.credit_card

    tx_kwargs = dict(
        user_id=g.current_user.id,
        account_id=account.id,
        category_id=reminder.category_id,
        description=reminder.description,
        amount=reminder.amount,
        type="expense",
        date=today,
        status="confirmed",
    )

    if is_credit:
        credit_card = account.credit_card
        ref_month = invoice_month_for_date(credit_card, today)
        invoice = get_or_create_invoice(credit_card, ref_month)
        tx_kwargs["payment_method"] = "credit"
        tx_kwargs["credit_card_invoice_id"] = invoice.id
    else:
        tx_kwargs["payment_method"] = "debit"

    tx = Transaction(**tx_kwargs)
    db.session.add(tx)
    db.session.flush()

    if is_credit:
        recalc_invoice_total(invoice)
        recalc_credit_card_used_amount(account.credit_card)
    else:
        recalc_account_balance(account)

    reminder.paid_at = today
    reminder.last_transaction_id = tx.id

    db.session.commit()
    return {"bill_reminder": reminder.to_dict(), "transaction": tx.to_dict()}
