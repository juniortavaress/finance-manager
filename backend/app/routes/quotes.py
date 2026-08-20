from flask import Blueprint

from app.auth_decorator import login_required
from app.services.quotes_service import get_brl_rates

quotes_bp = Blueprint("quotes", __name__)

CURRENCY_LABELS = {
    "USD": "Dólar americano",
    "EUR": "Euro",
    "GBP": "Libra esterlina",
}


@quotes_bp.get("/")
@login_required
def list_quotes():
    rates, fetched_at = get_brl_rates()
    quotes = [
        {"currency": code, "label": CURRENCY_LABELS.get(code, code), "brl_rate": rate}
        for code, rate in (rates or {}).items()
    ]
    quotes.sort(key=lambda q: q["currency"])
    return {
        "quotes": quotes,
        "updated_at": fetched_at.isoformat() if fetched_at else None,
        "available": bool(rates),
    }
