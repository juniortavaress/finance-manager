import datetime as dt
from calendar import monthrange
from decimal import Decimal

from app.extensions import db
from app.models import Account, CreditCardInvoice, InstallmentPlan, Transaction


def safe_day(year: int, month: int, day: int) -> int:
    last_day = monthrange(year, month)[1]
    return min(day, last_day)


def add_months(base: dt.date, months: int) -> dt.date:
    total = base.month - 1 + months
    year = base.year + total // 12
    month = total % 12 + 1
    day = safe_day(year, month, base.day)
    return dt.date(year, month, day)


def day_after_closing(credit_card, reference_month: dt.date) -> dt.date:
    """Primeiro dia apos o fechamento da fatura do mes de referencia."""
    ref = reference_month.replace(day=1)
    closing_date = dt.date(ref.year, ref.month, safe_day(ref.year, ref.month, credit_card.closing_day))
    return closing_date + dt.timedelta(days=1)


def recalc_installment_plan_total(plan: InstallmentPlan):
    total = (
        db.session.query(db.func.coalesce(db.func.sum(Transaction.amount), 0))
        .filter(Transaction.installment_plan_id == plan.id)
        .scalar()
    ) or Decimal("0")
    plan.total_amount = total


def recalc_account_balance(account: Account):
    total = (
        db.session.query(db.func.coalesce(db.func.sum(Transaction.amount), 0))
        .filter(
            Transaction.account_id == account.id,
            Transaction.payment_method == "debit",
            Transaction.status == "confirmed",
            Transaction.type == "income",
        )
        .scalar()
    ) or Decimal("0")

    total_out = (
        db.session.query(db.func.coalesce(db.func.sum(Transaction.amount), 0))
        .filter(
            Transaction.account_id == account.id,
            Transaction.payment_method == "debit",
            Transaction.status == "confirmed",
            Transaction.type == "expense",
        )
        .scalar()
    ) or Decimal("0")

    account.balance = account.opening_balance + total - total_out


def get_or_create_invoice(credit_card, reference_month: dt.date) -> CreditCardInvoice:
    ref = reference_month.replace(day=1)
    invoice = CreditCardInvoice.query.filter_by(credit_card_id=credit_card.id, reference_month=ref).first()
    if invoice:
        return invoice

    closing_date = dt.date(ref.year, ref.month, safe_day(ref.year, ref.month, credit_card.closing_day))
    due_month = ref if credit_card.due_day > credit_card.closing_day else add_months(ref, 1)
    due_date = dt.date(due_month.year, due_month.month, safe_day(due_month.year, due_month.month, credit_card.due_day))

    invoice = CreditCardInvoice(
        credit_card_id=credit_card.id,
        reference_month=ref,
        closing_date=closing_date,
        due_date=due_date,
        total_amount=0,
        status="open",
    )
    db.session.add(invoice)
    db.session.flush()
    return invoice


def invoice_month_for_date(credit_card, purchase_date: dt.date) -> dt.date:
    """Fatura em que uma compra cai: se a data e apos o fechamento, vai pra fatura do mes seguinte."""
    if purchase_date.day > credit_card.closing_day:
        return add_months(purchase_date.replace(day=1), 1)
    return purchase_date.replace(day=1)


def recalc_invoice_total(invoice: CreditCardInvoice):
    total = (
        db.session.query(db.func.coalesce(db.func.sum(Transaction.amount), 0))
        .filter(Transaction.credit_card_invoice_id == invoice.id, Transaction.type == "expense")
        .scalar()
    ) or Decimal("0")
    invoice.total_amount = total
    if invoice.status == "paid" and invoice.paid_amount < invoice.total_amount:
        invoice.status = "closed" if dt.date.today() > invoice.closing_date else "open"
        invoice.paid_at = None
    if invoice.status == "open" and dt.date.today() > invoice.closing_date:
        invoice.status = "closed"


def recalc_invoice_paid_amount(invoice: CreditCardInvoice):
    paid = (
        db.session.query(db.func.coalesce(db.func.sum(Transaction.amount), 0))
        .filter(
            Transaction.invoice_payment_for_id == invoice.id,
            Transaction.is_invoice_payment.is_(True),
            Transaction.status == "confirmed",
        )
        .scalar()
    ) or Decimal("0")

    invoice.paid_amount = paid
    if paid >= invoice.total_amount and invoice.total_amount > 0:
        if invoice.status != "paid":
            invoice.status = "paid"
        if invoice.paid_at is None:
            invoice.paid_at = dt.datetime.now(dt.timezone.utc)
    else:
        invoice.status = "closed" if dt.date.today() > invoice.closing_date else "open"
        invoice.paid_at = None


def recalc_credit_card_used_amount(credit_card):
    open_invoices_total = (
        db.session.query(
            db.func.coalesce(db.func.sum(CreditCardInvoice.total_amount - CreditCardInvoice.paid_amount), 0)
        )
        .filter(
            CreditCardInvoice.credit_card_id == credit_card.id,
            CreditCardInvoice.status.in_(("open", "closed")),
            CreditCardInvoice.total_amount > CreditCardInvoice.paid_amount,
        )
        .scalar()
    ) or Decimal("0")

    future_installments_total = Decimal("0")
    plans = InstallmentPlan.query.filter_by(credit_card_id=credit_card.id, status="active").all()
    for plan in plans:
        last_invoiced = (
            db.session.query(db.func.max(Transaction.installment_number))
            .filter(Transaction.installment_plan_id == plan.id)
            .scalar()
        ) or 0
        remaining = max(plan.installments_count - last_invoiced, 0)
        future_installments_total += plan.installment_amount * remaining

    credit_card.used_amount = open_invoices_total + future_installments_total


def apply_transaction_side_effects(transaction: Transaction, account: Account):
    """Recalcula saldo da conta e, se for cartao, fatura + limite usado."""
    recalc_account_balance(account)

    if transaction.payment_method == "credit" and transaction.credit_card_invoice_id:
        invoice = CreditCardInvoice.query.get(transaction.credit_card_invoice_id)
        if invoice:
            recalc_invoice_total(invoice)
            recalc_credit_card_used_amount(invoice.credit_card)

    if transaction.is_invoice_payment and transaction.invoice_payment_for_id:
        invoice = CreditCardInvoice.query.get(transaction.invoice_payment_for_id)
        if invoice:
            recalc_invoice_paid_amount(invoice)
            recalc_credit_card_used_amount(invoice.credit_card)
