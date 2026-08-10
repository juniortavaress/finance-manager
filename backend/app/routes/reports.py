import datetime as dt
from calendar import monthrange
from decimal import Decimal

from flask import Blueprint, g, request

from app.extensions import db
from app.auth_decorator import login_required
from app.models import Transaction
from app.services.finance_service import add_months

reports_bp = Blueprint("reports", __name__)


@reports_bp.get("/monthly-comparison")
@login_required
def monthly_comparison():
    months = int(request.args.get("months", 6))
    today = dt.date.today()
    cursor = dt.date(today.year, today.month, 1)
    periods = [add_months(cursor, -i) for i in range(months - 1, -1, -1)]

    result = []
    for period in periods:
        start = period
        end = dt.date(period.year, period.month, monthrange(period.year, period.month)[1])
        rows = (
            db.session.query(Transaction.type, db.func.coalesce(db.func.sum(Transaction.amount), 0))
            .filter(
                Transaction.user_id == g.current_user.id,
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.status == "confirmed",
                Transaction.is_invoice_payment.is_(False),
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
                "balance": float(totals["income"] - totals["expense"]),
            }
        )
    return {"months": result}
