import datetime as dt

from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import Account, Investment, InvestmentAccount, InvestmentSnapshot

investments_bp = Blueprint("investments", __name__)


def _owned_investment_accounts():
    return (
        InvestmentAccount.query.join(Account, Account.id == InvestmentAccount.account_id)
        .filter(Account.user_id == g.current_user.id)
        .all()
    )


@investments_bp.get("/")
@login_required
def list_investments():
    inv_account_ids = [ia.id for ia in _owned_investment_accounts()]
    investments = Investment.query.filter(Investment.investment_account_id.in_(inv_account_ids)).all() if inv_account_ids else []
    return {"investments": [i.to_dict() for i in investments]}


@investments_bp.post("/")
@login_required
def create_investment():
    data = request.get_json(silent=True) or {}
    investment_account_id = data.get("investment_account_id")
    name = (data.get("name") or "").strip()
    inv_type = data.get("type")

    if not name:
        raise ApiError("Nome do investimento é obrigatório", 400)
    if inv_type not in ("renda_fixa", "acoes", "fundos", "cripto", "outro"):
        raise ApiError("Tipo de investimento inválido", 400)

    ia = InvestmentAccount.query.join(Account, Account.id == InvestmentAccount.account_id).filter(
        InvestmentAccount.id == investment_account_id, Account.user_id == g.current_user.id
    ).first()
    if ia is None:
        raise ApiError("Conta de investimento não encontrada", 404)

    investment = Investment(
        investment_account_id=ia.id,
        type=inv_type,
        name=name,
        invested_amount=data.get("invested_amount", 0) or 0,
        current_amount=data.get("current_amount", data.get("invested_amount", 0)) or 0,
    )
    db.session.add(investment)
    db.session.flush()

    snapshot = InvestmentSnapshot(investment_id=investment.id, date=dt.date.today(), value=investment.current_amount)
    db.session.add(snapshot)
    db.session.commit()
    return {"investment": investment.to_dict()}, 201


@investments_bp.patch("/<uuid:investment_id>")
@login_required
def update_investment(investment_id):
    investment = (
        Investment.query.join(InvestmentAccount, InvestmentAccount.id == Investment.investment_account_id)
        .join(Account, Account.id == InvestmentAccount.account_id)
        .filter(Investment.id == investment_id, Account.user_id == g.current_user.id)
        .first()
    )
    if investment is None:
        raise ApiError("Investimento não encontrado", 404)

    data = request.get_json(silent=True) or {}
    for field in ("name", "invested_amount", "current_amount"):
        if field in data:
            setattr(investment, field, data[field])

    if "current_amount" in data:
        snapshot = InvestmentSnapshot(investment_id=investment.id, date=dt.date.today(), value=investment.current_amount)
        db.session.add(snapshot)

    db.session.commit()
    return {"investment": investment.to_dict()}
