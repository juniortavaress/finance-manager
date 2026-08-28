import datetime as dt
from calendar import monthrange
from decimal import Decimal

from flask import Blueprint, g, request

from app.extensions import db
from app.auth_decorator import login_required
from app.models import Account, Bank, Category, CreditCard, CreditCardInvoice, Transaction
from app.services.finance_service import add_months

INVESTMENT_ACCOUNT_TYPE = "investment"

dashboard_bp = Blueprint("dashboard", __name__)


def _month_bounds(year: int, month: int):
    start = dt.date(year, month, 1)
    end = dt.date(year, month, monthrange(year, month)[1])
    return start, end


def _outstanding_invoices(user_id, year, month):
    cards = (
        CreditCard.query.join(Account, Account.id == CreditCard.account_id)
        .filter(Account.user_id == user_id, Account.archived.is_(False))
        .all()
    )
    if not cards:
        return [], {}
    current_month_start = dt.date(year, month, 1)
    unpaid_invoices = CreditCardInvoice.query.filter(
        CreditCardInvoice.credit_card_id.in_([c.id for c in cards]),
        CreditCardInvoice.status.in_(("open", "closed")),
        CreditCardInvoice.reference_month <= current_month_start,
        CreditCardInvoice.total_amount > CreditCardInvoice.paid_amount,
    ).all()
    card_by_id = {c.id: c for c in cards}
    return unpaid_invoices, card_by_id


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
            .join(Account, Account.id == Transaction.account_id)
            .filter(
                Transaction.user_id == g.current_user.id,
                Transaction.date >= d_start,
                Transaction.date <= d_end,
                Transaction.status == "confirmed",
                Transaction.is_invoice_payment.is_(False),
                Transaction.is_transfer.is_(False),
                Account.type == "checking",
                Transaction.payment_method != "credit",
            )
            .group_by(Transaction.type)
            .all()
        )
        totals = {"income": Decimal("0"), "expense": Decimal("0")}
        for t, v in rows:
            totals[t] = v

        credit_expense = (
            db.session.query(db.func.coalesce(db.func.sum(Transaction.amount), 0))
            .join(CreditCardInvoice, CreditCardInvoice.id == Transaction.credit_card_invoice_id)
            .filter(
                Transaction.user_id == g.current_user.id,
                Transaction.type == "expense",
                Transaction.status == "confirmed",
                Transaction.payment_method == "credit",
                CreditCardInvoice.closing_date >= d_start,
                CreditCardInvoice.closing_date <= d_end,
            )
            .scalar()
        ) or Decimal("0")
        totals["expense"] += credit_expense
        return totals

    current = period_totals(start, end)
    previous = period_totals(prev_start, prev_end)

    income_count = (
        Transaction.query.join(Account, Account.id == Transaction.account_id).filter(
            Transaction.user_id == g.current_user.id,
            Transaction.type == "income",
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.status == "confirmed",
            Transaction.is_invoice_payment.is_(False),
            Transaction.is_transfer.is_(False),
            Account.type == "checking",
        ).count()
    )

    outstanding_invoices, _ = _outstanding_invoices(g.current_user.id, today.year, today.month)
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
            Transaction.is_invoice_payment.is_(False),
            Transaction.is_transfer.is_(False),
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


@dashboard_bp.get("/expense-breakdown")
@login_required
def expense_breakdown():
    """Transacoes que compoem 'Despesas do mes': debito/pix no periodo + faturas de credito que fecham no periodo."""
    today = dt.date.today()
    year = int(request.args.get("year", today.year))
    month = int(request.args.get("month", today.month))
    start, end = _month_bounds(year, month)

    debit_txs = (
        Transaction.query.join(Account, Account.id == Transaction.account_id)
        .filter(
            Transaction.user_id == g.current_user.id,
            Transaction.type == "expense",
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.status == "confirmed",
            Transaction.is_invoice_payment.is_(False),
            Transaction.is_transfer.is_(False),
            Account.type == "checking",
            Transaction.payment_method != "credit",
        )
        .all()
    )

    credit_txs = (
        Transaction.query.join(CreditCardInvoice, CreditCardInvoice.id == Transaction.credit_card_invoice_id)
        .filter(
            Transaction.user_id == g.current_user.id,
            Transaction.type == "expense",
            Transaction.status == "confirmed",
            Transaction.payment_method == "credit",
            CreditCardInvoice.closing_date >= start,
            CreditCardInvoice.closing_date <= end,
        )
        .all()
    )

    txs = sorted(debit_txs + credit_txs, key=lambda t: t.date, reverse=True)
    return {"transactions": [t.to_dict() for t in txs]}


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


def _first_transaction_date(user_id):
    return db.session.query(db.func.min(Transaction.date)).filter(Transaction.user_id == user_id).scalar()


def _empty_period_totals():
    return {"income": Decimal("0"), "expense": Decimal("0"), "investment": Decimal("0")}


@dashboard_bp.get("/income-vs-expense")
@login_required
def income_vs_expense():
    granularity = request.args.get("granularity", "monthly")
    if granularity not in ("monthly", "yearly"):
        granularity = "monthly"
    today = dt.date.today()
    earliest = _first_transaction_date(g.current_user.id)
    start_date = earliest or today

    rows = (
        db.session.query(
            db.func.extract("year", Transaction.date),
            db.func.extract("month", Transaction.date),
            Transaction.type,
            db.func.coalesce(db.func.sum(Transaction.amount), 0),
        )
        .join(Account, Account.id == Transaction.account_id)
        .filter(
            Transaction.user_id == g.current_user.id,
            Transaction.date >= start_date,
            Transaction.status == "confirmed",
            Transaction.is_invoice_payment.is_(False),
            Transaction.is_transfer.is_(False),
            Account.type == "checking",
            Transaction.payment_method != "credit",
        )
        .group_by(
            db.func.extract("year", Transaction.date),
            db.func.extract("month", Transaction.date),
            Transaction.type,
        )
        .all()
    )

    credit_rows = (
        db.session.query(
            db.func.extract("year", CreditCardInvoice.closing_date),
            db.func.extract("month", CreditCardInvoice.closing_date),
            db.func.coalesce(db.func.sum(Transaction.amount), 0),
        )
        .join(CreditCardInvoice, CreditCardInvoice.id == Transaction.credit_card_invoice_id)
        .filter(
            Transaction.user_id == g.current_user.id,
            Transaction.type == "expense",
            Transaction.status == "confirmed",
            Transaction.payment_method == "credit",
            CreditCardInvoice.closing_date >= start_date,
        )
        .group_by(
            db.func.extract("year", CreditCardInvoice.closing_date),
            db.func.extract("month", CreditCardInvoice.closing_date),
        )
        .all()
    )

    TransferPair = db.aliased(Transaction)
    investment_rows = (
        db.session.query(
            db.func.extract("year", Transaction.date),
            db.func.extract("month", Transaction.date),
            db.func.coalesce(db.func.sum(Transaction.amount), 0),
        )
        .join(TransferPair, TransferPair.id == Transaction.transfer_pair_id)
        .join(Account, Account.id == TransferPair.account_id)
        .filter(
            Transaction.user_id == g.current_user.id,
            Transaction.type == "expense",
            Transaction.is_transfer.is_(True),
            Transaction.status == "confirmed",
            Transaction.date >= start_date,
            Account.type == INVESTMENT_ACCOUNT_TYPE,
        )
        .group_by(
            db.func.extract("year", Transaction.date),
            db.func.extract("month", Transaction.date),
        )
        .all()
    )

    if granularity == "yearly":
        totals = {}
        for y, _m, t, v in rows:
            totals.setdefault(int(y), _empty_period_totals())[t] += v
        for y, _m, v in credit_rows:
            totals.setdefault(int(y), _empty_period_totals())["expense"] += v
        for y, _m, v in investment_rows:
            totals.setdefault(int(y), _empty_period_totals())["investment"] += v
        years = list(range(start_date.year, today.year + 1))
        result = [
            {
                "year": year,
                "income": float(totals.get(year, {}).get("income", Decimal("0"))),
                "expense": float(totals.get(year, {}).get("expense", Decimal("0"))),
                "investment": float(totals.get(year, {}).get("investment", Decimal("0"))),
            }
            for year in years
        ]
        return {"periods": result, "granularity": "yearly"}

    totals = {}
    for y, m, t, v in rows:
        totals.setdefault((int(y), int(m)), _empty_period_totals())[t] = v
    for y, m, v in credit_rows:
        totals.setdefault((int(y), int(m)), _empty_period_totals())["expense"] += v
    for y, m, v in investment_rows:
        totals.setdefault((int(y), int(m)), _empty_period_totals())["investment"] += v
    start_cursor = dt.date(start_date.year, start_date.month, 1)
    total_months = (today.year - start_cursor.year) * 12 + (today.month - start_cursor.month) + 1
    periods = [add_months(start_cursor, i) for i in range(total_months)]
    result = [
        {
            "year": period.year,
            "month": period.month,
            "income": float(totals.get((period.year, period.month), {}).get("income", Decimal("0"))),
            "expense": float(totals.get((period.year, period.month), {}).get("expense", Decimal("0"))),
            "investment": float(totals.get((period.year, period.month), {}).get("investment", Decimal("0"))),
        }
        for period in periods
    ]
    return {"periods": result, "granularity": "monthly"}


@dashboard_bp.get("/balance-evolution")
@login_required
def balance_evolution():
    granularity = request.args.get("granularity", "monthly")
    if granularity not in ("monthly", "yearly"):
        granularity = "monthly"
    today = dt.date.today()
    accounts = Account.query.filter_by(user_id=g.current_user.id, type="checking").all()

    earliest_tx = _first_transaction_date(g.current_user.id)
    candidates = [a.opening_balance_date for a in accounts if a.opening_balance_date] + (
        [earliest_tx] if earliest_tx else []
    )
    start_date = min(candidates) if candidates else today

    if granularity == "yearly":
        period_ends = [dt.date(year, 12, 31) for year in range(start_date.year, today.year + 1)]
    else:
        start_cursor = dt.date(start_date.year, start_date.month, 1)
        total_months = (today.year - start_cursor.year) * 12 + (today.month - start_cursor.month) + 1
        month_periods = [add_months(start_cursor, i) for i in range(total_months)]
        period_ends = [_month_bounds(p.year, p.month)[1] for p in month_periods]

    balance_by_end = {end: Decimal("0") for end in period_ends}
    for account in accounts:
        txs = (
            Transaction.query.filter(
                Transaction.account_id == account.id,
                Transaction.payment_method == "debit",
                Transaction.status == "confirmed",
            )
            .order_by(Transaction.date.asc())
            .all()
        )
        running = account.opening_balance
        tx_idx = 0
        for end in period_ends:
            while tx_idx < len(txs) and txs[tx_idx].date <= end:
                tx = txs[tx_idx]
                running += tx.amount if tx.type == "income" else -tx.amount
                tx_idx += 1
            balance_by_end[end] += running

    if granularity == "yearly":
        result = [
            {"year": end.year, "balance": float(balance_by_end[end])} for end in period_ends
        ]
    else:
        result = [
            {"year": end.year, "month": end.month, "balance": float(balance_by_end[end])} for end in period_ends
        ]
    return {"periods": result, "granularity": granularity}


@dashboard_bp.get("/period-invoices")
@login_required
def period_invoices():
    today = dt.date.today()
    invoices, card_by_id = _outstanding_invoices(g.current_user.id, today.year, today.month)
    invoices = sorted(invoices, key=lambda i: i.due_date)
    result = []
    for invoice in invoices:
        card = card_by_id[invoice.credit_card_id]
        data = invoice.to_dict()
        data["bank_name"] = card.account.bank.name
        data["bank_color"] = card.account.bank.color_hex
        result.append(data)
    return {"invoices": result}


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
        pending = (
            CreditCardInvoice.query.filter(
                CreditCardInvoice.credit_card_id == card.id,
                CreditCardInvoice.status.in_(("open", "closed")),
                CreditCardInvoice.total_amount > CreditCardInvoice.paid_amount,
            )
            .order_by(CreditCardInvoice.due_date.asc())
            .limit(3)
            .all()
        )
        for invoice in pending:
            data = invoice.to_dict()
            data["bank_name"] = card.account.bank.name
            data["bank_color"] = card.account.bank.color_hex
            data["card_id"] = str(card.id)
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
