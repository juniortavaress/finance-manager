import datetime as dt
from decimal import Decimal, ROUND_HALF_UP

from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import CreditCardInvoice, InstallmentPlan, Transaction
from app.services.finance_service import (
    recalc_credit_card_used_amount,
    recalc_installment_plan_total,
    recalc_invoice_total,
)

installments_bp = Blueprint("installments", __name__)


@installments_bp.get("/")
@login_required
def list_installments():
    status = request.args.get("status")
    query = InstallmentPlan.query.filter_by(user_id=g.current_user.id)
    if status in ("active", "completed"):
        query = query.filter_by(status=status)
    plans = query.order_by(InstallmentPlan.created_at.desc()).all()
    return {"installment_plans": [p.to_dict(include_transactions=True) for p in plans]}


@installments_bp.get("/<uuid:plan_id>")
@login_required
def get_installment(plan_id):
    plan = InstallmentPlan.query.filter_by(id=plan_id, user_id=g.current_user.id).first()
    if plan is None:
        raise ApiError("Parcelamento não encontrado", 404)
    return {"installment_plan": plan.to_dict(include_transactions=True)}


def _get_owned_plan(plan_id):
    return InstallmentPlan.query.filter_by(id=plan_id, user_id=g.current_user.id).first()


def _mark_completed_if_done(plan):
    remaining = Transaction.query.filter_by(installment_plan_id=plan.id, status="scheduled").count()
    if remaining == 0:
        plan.status = "completed"


@installments_bp.post("/<uuid:plan_id>/advance")
@login_required
def advance_installments(plan_id):
    plan = _get_owned_plan(plan_id)
    if plan is None:
        raise ApiError("Parcelamento não encontrado", 404)

    data = request.get_json(silent=True) or {}
    count = int(data.get("count") or 0)
    total_amount = data.get("total_amount")

    if count <= 0:
        raise ApiError("Informe quantas parcelas deseja adiantar", 400)
    if not total_amount or Decimal(str(total_amount)) <= 0:
        raise ApiError("Informe o valor total a pagar pelas parcelas adiantadas", 400)

    open_invoice = (
        CreditCardInvoice.query.filter_by(credit_card_id=plan.credit_card_id, status="open")
        .order_by(CreditCardInvoice.reference_month.asc())
        .first()
    )
    if open_invoice is None:
        raise ApiError("Não há fatura aberta para este cartão", 400)

    scheduled = (
        Transaction.query.filter_by(installment_plan_id=plan.id, status="scheduled")
        .order_by(Transaction.installment_number.desc())
        .all()
    )
    if len(scheduled) < count:
        raise ApiError("Não há parcelas suficientes para adiantar", 400)

    selected = scheduled[:count]
    total_amount = Decimal(str(total_amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    each = (total_amount / count).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    touched_invoices = {open_invoice.id: open_invoice}
    remaining = total_amount
    for idx, tx in enumerate(selected):
        if tx.credit_card_invoice_id and tx.credit_card_invoice_id not in touched_invoices:
            old_invoice = CreditCardInvoice.query.get(tx.credit_card_invoice_id)
            if old_invoice:
                touched_invoices[old_invoice.id] = old_invoice

        value = each if idx < count - 1 else remaining
        remaining -= each

        tx.amount = value
        tx.credit_card_invoice_id = open_invoice.id
        tx.status = "confirmed"
        tx.date = dt.date.today()

    db.session.flush()
    for invoice in touched_invoices.values():
        recalc_invoice_total(invoice)

    _mark_completed_if_done(plan)
    recalc_installment_plan_total(plan)
    db.session.flush()
    recalc_credit_card_used_amount(plan.credit_card)
    db.session.commit()

    return {"installment_plan": plan.to_dict(include_transactions=True)}


@installments_bp.delete("/<uuid:plan_id>/from/<int:installment_number>")
@login_required
def cancel_installments_from(plan_id, installment_number):
    plan = _get_owned_plan(plan_id)
    if plan is None:
        raise ApiError("Parcelamento não encontrado", 404)

    to_cancel = Transaction.query.filter(
        Transaction.installment_plan_id == plan.id, Transaction.installment_number >= installment_number
    ).all()
    if not to_cancel:
        raise ApiError("Nenhuma parcela encontrada a partir desse número", 404)
    if any(tx.status != "scheduled" for tx in to_cancel):
        raise ApiError("Não é possível cancelar parcelas já confirmadas/faturadas", 400)

    touched_invoice_ids = {tx.credit_card_invoice_id for tx in to_cancel if tx.credit_card_invoice_id}
    for tx in to_cancel:
        db.session.delete(tx)
    db.session.flush()

    for invoice_id in touched_invoice_ids:
        invoice = CreditCardInvoice.query.get(invoice_id)
        if invoice:
            recalc_invoice_total(invoice)

    _mark_completed_if_done(plan)
    recalc_installment_plan_total(plan)
    db.session.flush()
    recalc_credit_card_used_amount(plan.credit_card)
    db.session.commit()

    return {"installment_plan": plan.to_dict(include_transactions=True)}
