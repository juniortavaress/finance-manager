import datetime as dt
from calendar import monthrange
from decimal import Decimal

from flask import Blueprint, g, request

from app.extensions import db
from app.auth_decorator import login_required
from app.models import Account, Bank, Category, CreditCard, CreditCardInvoice, Transaction
from app.services.finance_service import add_months

dashboard_bp = Blueprint("dashboard", __name__)


def _month_bounds(year: int, month: int):
    start = dt.date(year, month, 1)
    end = dt.date(year, month, monthrange(year, month)[1])
    return start, end


@dashboard_bp.get("/summary")
@login_required
def summary():
    today = dt.date.today()
    year = int(request.args.get("year", today.year))
    month = int(request.args.get("month", today.month))
    start, end = _month_bounds(year, month)
    prev_year, prev_month0 = divmod(year * 12 + (month - 1) - 1, 12)
    prev_start, prev_end = _month_bounds(prev_year, prev_month0 + 1)

    accounts = Account.query.filter_by(user_id=g.current_user.id, archived=False).all()
    saldo_total = sum((a.balance for a in accounts if a.type == "checking"), Decimal("0"))

    def period_totals(d_start, d_end):
        rows = (
            db.session.query(Transaction.type, db.func.coalesce(db.func.sum(Transaction.amount), 0))
            .filter(
                Transaction.user_id == g.current_user.id,
                Transaction.date >= d_start,
                Transaction.date <= d_end,
                Transaction.status == "confirmed",
            )
            .group_by(Transaction.type)
            .all()
        )
        totals = {"income": Decimal("0"), "expense": Decimal("0")}
        for t, v in rows:
            totals[t] = v
        return totals

    current = period_totals(start, end)
    previous = period_totals(prev_start, prev_end)

    income_count = (
        Transaction.query.filter(
            Transaction.user_id == g.current_user.id,
            Transaction.type == "income",
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.status == "confirmed",
        ).count()
    )

    cards = (
        CreditCard.query.join(Account, Account.id == CreditCard.account_id)
        .filter(Account.user_id == g.current_user.id, Account.archived.is_(False))
        .all()
    )
    open_invoices = (
        CreditCardInvoice.query.filter(
            CreditCardInvoice.credit_card_id.in_([c.id for c in cards]), CreditCardInvoice.status == "open"
        ).all()
        if cards
        else []
    )
    outstanding_invoices = [i for i in open_invoices if (i.total_amount - i.paid_amount) > 0]
    faturas_abertas_total = sum((i.total_amount - i.paid_amount for i in outstanding_invoices), Decimal("0"))

    def pct_change(curr, prev):
        if prev == 0:
            return None
        return float((curr - prev) / prev * 100)

    return {
        "saldo_total": float(saldo_total),
        "receitas_mes": float(current["income"]),
        "receitas_mes_qtd": income_count,
        "despesas_mes": float(current["expense"]),
        "despesas_variacao_pct": pct_change(current["expense"], previous["expense"]),
        "saldo_variacao_pct": None,
        "faturas_abertas_total": float(faturas_abertas_total),
        "faturas_abertas_qtd": len(outstanding_invoices),
    }


@dashboard_bp.get("/spending-by-category")
@login_required
def spending_by_category():
    today = dt.date.today()
    year = int(request.args.get("year", today.year))
    month = int(request.args.get("month", today.month))
    start, end = _month_bounds(year, month)

    rows = (
        db.session.query(Category, db.func.coalesce(db.func.sum(Transaction.amount), 0))
        .join(Transaction, Transaction.category_id == Category.id)
        .filter(
            Transaction.user_id == g.current_user.id,
            Transaction.type == "expense",
            Transaction.status == "confirmed",
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .group_by(Category.id)
        .order_by(db.func.sum(Transaction.amount).desc())
        .all()
    )
    return {
        "categories": [
            {**cat.to_dict(), "total": float(total)} for cat, total in rows
        ]
    }


@dashboard_bp.get("/balance-by-bank")
@login_required
def balance_by_bank():
    banks = Bank.query.filter_by(user_id=g.current_user.id, archived=False).all()
    result = []
    for bank in banks:
        checking_accounts = [a for a in bank.accounts if a.type == "checking" and not a.archived]
        total = sum((a.balance for a in checking_accounts), Decimal("0"))
        if checking_accounts:
            result.append({"bank": bank.to_dict(), "balance": float(total)})
    return {"banks": result}


@dashboard_bp.get("/income-vs-expense")
@login_required
def income_vs_expense():
    months = int(request.args.get("months", 6))
    today = dt.date.today()
    result = []
    cursor = dt.date(today.year, today.month, 1)
    periods = []
    for i in range(months - 1, -1, -1):
        periods.append(add_months(cursor, -i))

    for period in periods:
        start, end = _month_bounds(period.year, period.month)
        rows = (
            db.session.query(Transaction.type, db.func.coalesce(db.func.sum(Transaction.amount), 0))
            .filter(
                Transaction.user_id == g.current_user.id,
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.status == "confirmed",
            )
            .group_by(Transaction.type)
            .all()
        )
        totals = {"income": Decimal("0"), "expense": Decimal("0")}
        for t, v in rows:
            totals[t] = v
        result.append(
            {
                "year": period.year,
                "month": period.month,
                "income": float(totals["income"]),
                "expense": float(totals["expense"]),
            }
        )
    return {"months": result}


@dashboard_bp.get("/balance-evolution")
@login_required
def balance_evolution():
    months = int(request.args.get("months", 6))
    today = dt.date.today()
    accounts = Account.query.filter_by(user_id=g.current_user.id, type="checking").all()

    cursor = dt.date(today.year, today.month, 1)
    periods = [add_months(cursor, -i) for i in range(months - 1, -1, -1)]

    result = []
    for period in periods:
        _, end = _month_bounds(period.year, period.month)
        total = Decimal("0")
        for account in accounts:
            rows = (
                db.session.query(Transaction.type, db.func.coalesce(db.func.sum(Transaction.amount), 0))
                .filter(
                    Transaction.account_id == account.id,
                    Transaction.payment_method == "debit",
                    Transaction.status == "confirmed",
                    Transaction.date >= account.opening_balance_date,
                    Transaction.date <= end,
                )
                .group_by(Transaction.type)
                .all()
            )
            totals = {"income": Decimal("0"), "expense": Decimal("0")}
            for t, v in rows:
                totals[t] = v
            total += account.opening_balance + totals["income"] - totals["expense"]
        result.append({"year": period.year, "month": period.month, "balance": float(total)})
    return {"months": result}


@dashboard_bp.get("/upcoming-invoices")
@login_required
def upcoming_invoices():
    cards = (
        CreditCard.query.join(Account, Account.id == CreditCard.account_id)
        .join(Bank, Bank.id == Account.bank_id)
        .filter(Account.user_id == g.current_user.id, Account.archived.is_(False), Bank.archived.is_(False))
        .all()
    )
    invoices = []
    for card in cards:
        open_invoice = (
            CreditCardInvoice.query.filter_by(credit_card_id=card.id, status="open")
            .order_by(CreditCardInvoice.reference_month.desc())
            .first()
        )
        if open_invoice and open_invoice.total_amount > 0:
            data = open_invoice.to_dict()
            data["bank_name"] = card.account.bank.name
            data["bank_color"] = card.account.bank.color_hex
            invoices.append(data)
    return {"invoices": invoices}


@dashboard_bp.get("/recent-transactions")
@login_required
def recent_transactions():
    limit = int(request.args.get("limit", 5))
    txs = (
        Transaction.query.filter_by(user_id=g.current_user.id, status="confirmed")
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .limit(limit)
        .all()
    )
    return {"transactions": [t.to_dict() for t in txs]}
