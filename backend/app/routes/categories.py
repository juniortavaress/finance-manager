from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import Budget, Category, InstallmentPlan, RecurringTransaction, Transaction

categories_bp = Blueprint("categories", __name__)


def _usage_counts(user_id, category_id):
    counts = {
        "transactions": Transaction.query.filter_by(user_id=user_id, category_id=category_id).count(),
        "recurring_transactions": RecurringTransaction.query.filter_by(
            user_id=user_id, category_id=category_id
        ).count(),
        "budgets": Budget.query.filter_by(user_id=user_id, category_id=category_id).count(),
        "installment_plans": InstallmentPlan.query.filter_by(user_id=user_id, category_id=category_id).count(),
    }
    return counts


@categories_bp.get("/")
@login_required
def list_categories():
    include_archived = request.args.get("include_archived") == "1"
    kind = request.args.get("kind")

    query = Category.query.filter_by(user_id=g.current_user.id)
    if not include_archived:
        query = query.filter_by(archived=False)
    if kind:
        query = query.filter(db.or_(Category.kind == kind, Category.kind == "both"))
    categories = query.order_by(Category.name.asc()).all()
    return {"categories": [c.to_dict() for c in categories]}


@categories_bp.post("/")
@login_required
def create_category():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    kind = data.get("kind")

    if not name:
        raise ApiError("Nome da categoria é obrigatório", 400)
    if kind not in ("expense", "income", "both"):
        raise ApiError("Tipo de categoria inválido", 400)

    budget_amount = data.get("budget_amount")
    if budget_amount is not None:
        try:
            budget_amount = float(budget_amount)
        except (TypeError, ValueError):
            raise ApiError("Valor meta inválido", 400)
        if budget_amount < 0:
            raise ApiError("Valor meta inválido", 400)

    category = Category(
        user_id=g.current_user.id,
        name=name,
        icon=data.get("icon") or "\U0001F4C1",
        color_hex=data.get("color_hex") or "#8B9A97",
        kind=kind,
        budget_amount=budget_amount,
    )
    db.session.add(category)
    db.session.commit()
    return {"category": category.to_dict()}, 201


@categories_bp.patch("/<uuid:category_id>")
@login_required
def update_category(category_id):
    category = Category.query.filter_by(id=category_id, user_id=g.current_user.id).first()
    if category is None:
        raise ApiError("Categoria não encontrada", 404)

    data = request.get_json(silent=True) or {}
    if "budget_amount" in data:
        budget_amount = data["budget_amount"]
        if budget_amount is not None:
            try:
                budget_amount = float(budget_amount)
            except (TypeError, ValueError):
                raise ApiError("Valor meta inválido", 400)
            if budget_amount < 0:
                raise ApiError("Valor meta inválido", 400)
        data["budget_amount"] = budget_amount

    for field in ("name", "icon", "color_hex", "kind", "archived", "budget_amount"):
        if field in data:
            setattr(category, field, data[field])
    db.session.commit()
    return {"category": category.to_dict()}


@categories_bp.get("/<uuid:category_id>/usage")
@login_required
def category_usage(category_id):
    category = Category.query.filter_by(id=category_id, user_id=g.current_user.id).first()
    if category is None:
        raise ApiError("Categoria não encontrada", 404)

    counts = _usage_counts(g.current_user.id, category_id)
    return {"total": sum(counts.values()), "counts": counts}


@categories_bp.delete("/<uuid:category_id>")
@login_required
def delete_category(category_id):
    category = Category.query.filter_by(id=category_id, user_id=g.current_user.id).first()
    if category is None:
        raise ApiError("Categoria não encontrada", 404)

    data = request.get_json(silent=True) or {}
    reassign_to = data.get("reassign_to")

    counts = _usage_counts(g.current_user.id, category_id)
    total = sum(counts.values())

    if total > 0:
        if not reassign_to:
            raise ApiError("Esta categoria está em uso. Informe reassign_to para migrar os registros.", 400)
        if str(reassign_to) == str(category_id):
            raise ApiError("Escolha uma categoria diferente para reatribuir.", 400)

        target = Category.query.filter_by(id=reassign_to, user_id=g.current_user.id, archived=False).first()
        if target is None:
            raise ApiError("Categoria de destino inválida", 400)

        Transaction.query.filter_by(user_id=g.current_user.id, category_id=category_id).update(
            {"category_id": reassign_to}
        )
        RecurringTransaction.query.filter_by(user_id=g.current_user.id, category_id=category_id).update(
            {"category_id": reassign_to}
        )
        Budget.query.filter_by(user_id=g.current_user.id, category_id=category_id).update(
            {"category_id": reassign_to}
        )
        InstallmentPlan.query.filter_by(user_id=g.current_user.id, category_id=category_id).update(
            {"category_id": reassign_to}
        )

    db.session.delete(category)
    db.session.commit()
    return {"ok": True, "reassigned": total}
