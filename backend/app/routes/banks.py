from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import Account, Bank, RecurringTransaction, Transaction

banks_bp = Blueprint("banks", __name__)


def _bank_usage_counts(user_id, bank_id):
    account_ids = [a.id for a in Account.query.filter_by(user_id=user_id, bank_id=bank_id).all()]
    if not account_ids:
        return {"transactions": 0, "recurring_transactions": 0}
    return {
        "transactions": Transaction.query.filter(
            Transaction.user_id == user_id, Transaction.account_id.in_(account_ids)
        ).count(),
        "recurring_transactions": RecurringTransaction.query.filter(
            RecurringTransaction.user_id == user_id, RecurringTransaction.account_id.in_(account_ids)
        ).count(),
    }


@banks_bp.get("/")
@login_required
def list_banks():
    include_archived = request.args.get("include_archived") == "1"
    query = Bank.query.filter_by(user_id=g.current_user.id)
    if not include_archived:
        query = query.filter_by(archived=False)
    banks = query.order_by(Bank.created_at.asc()).all()
    return {"banks": [b.to_dict() for b in banks]}


@banks_bp.post("/")
@login_required
def create_bank():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        raise ApiError("Nome do banco e obrigatorio", 400)

    bank = Bank(
        user_id=g.current_user.id,
        name=name,
        color_hex=data.get("color_hex") or "#0F5C5C",
        logo_url=data.get("logo_url"),
    )
    db.session.add(bank)
    db.session.commit()
    return {"bank": bank.to_dict()}, 201


@banks_bp.patch("/<uuid:bank_id>")
@login_required
def update_bank(bank_id):
    bank = Bank.query.filter_by(id=bank_id, user_id=g.current_user.id).first()
    if bank is None:
        raise ApiError("Banco nao encontrado", 404)

    data = request.get_json(silent=True) or {}
    for field in ("name", "color_hex", "logo_url", "archived"):
        if field in data:
            setattr(bank, field, data[field])
    db.session.commit()
    return {"bank": bank.to_dict()}


@banks_bp.get("/<uuid:bank_id>/usage")
@login_required
def bank_usage(bank_id):
    bank = Bank.query.filter_by(id=bank_id, user_id=g.current_user.id).first()
    if bank is None:
        raise ApiError("Banco nao encontrado", 404)

    counts = _bank_usage_counts(g.current_user.id, bank_id)
    return {"total": sum(counts.values()), "counts": counts}


@banks_bp.delete("/<uuid:bank_id>")
@login_required
def delete_bank(bank_id):
    from app.routes.accounts import _delete_account_cascade

    bank = Bank.query.filter_by(id=bank_id, user_id=g.current_user.id).first()
    if bank is None:
        raise ApiError("Banco nao encontrado", 404)

    accounts = Account.query.filter_by(user_id=g.current_user.id, bank_id=bank.id).all()
    for account in accounts:
        _delete_account_cascade(account)

    db.session.delete(bank)
    db.session.commit()
    return {"ok": True}
