from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import Group, GroupMember, SharedExpense, Settlement, User
from app.routes.friends import are_friends
from app.services.split_service import (
    compute_group_debt_pairs,
    compute_group_net_balances,
    simplify_group_debts,
)

groups_bp = Blueprint("groups", __name__)


def _get_member(group_id, user_id):
    return GroupMember.query.filter_by(group_id=group_id, user_id=user_id).first()


def _require_membership(group_id):
    membership = _get_member(group_id, g.current_user.id)
    if membership is None:
        raise ApiError("Grupo nao encontrado", 404)
    return membership


@groups_bp.get("/")
@login_required
def list_groups():
    memberships = GroupMember.query.filter_by(user_id=g.current_user.id).all()
    result = []
    for m in memberships:
        group = m.group
        if group.archived:
            continue
        net = compute_group_net_balances(group.id)
        data = group.to_dict()
        data["member_count"] = len(group.members)
        data["my_balance"] = float(net.get(g.current_user.id, 0))
        result.append(data)
    return {"groups": result}


@groups_bp.post("/")
@login_required
def create_group():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    member_ids = data.get("member_ids") or []

    if not name:
        raise ApiError("Nome do grupo e obrigatorio", 400)

    for member_id in member_ids:
        if not are_friends(g.current_user.id, member_id):
            raise ApiError("So e possivel adicionar amigos aceitos ao grupo", 400)

    group = Group(name=name, created_by=g.current_user.id)
    db.session.add(group)
    db.session.flush()

    db.session.add(GroupMember(group_id=group.id, user_id=g.current_user.id))
    for member_id in set(member_ids):
        if str(member_id) == str(g.current_user.id):
            continue
        db.session.add(GroupMember(group_id=group.id, user_id=member_id))

    db.session.commit()
    return {"group": group.to_dict()}, 201


@groups_bp.get("/<uuid:group_id>")
@login_required
def get_group(group_id):
    _require_membership(group_id)
    group = Group.query.get(group_id)
    if group is None:
        raise ApiError("Grupo nao encontrado", 404)

    net = compute_group_net_balances(group.id)
    members = [{**m.to_dict(), "balance": float(net.get(m.user_id, 0))} for m in group.members]

    expenses = SharedExpense.query.filter_by(group_id=group.id).order_by(SharedExpense.date.desc()).all()
    settlements = Settlement.query.filter_by(group_id=group.id).order_by(Settlement.date.desc()).all()

    data = group.to_dict()
    data["members"] = members
    data["shared_expenses"] = [e.to_dict() for e in expenses]
    data["settlements"] = [s.to_dict() for s in settlements]
    data["original_debts"] = compute_group_debt_pairs(group.id)
    return {"group": data}


@groups_bp.patch("/<uuid:group_id>")
@login_required
def update_group(group_id):
    _require_membership(group_id)
    group = Group.query.get(group_id)
    if group is None:
        raise ApiError("Grupo nao encontrado", 404)

    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise ApiError("Nome do grupo e obrigatorio", 400)
        group.name = name
    if "simplify_debts" in data:
        group.simplify_debts = bool(data["simplify_debts"])

    db.session.commit()
    return {"group": group.to_dict()}


@groups_bp.post("/<uuid:group_id>/members")
@login_required
def add_member(group_id):
    _require_membership(group_id)
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    if not user_id:
        raise ApiError("Informe o usuario a adicionar", 400)

    if not are_friends(g.current_user.id, user_id):
        raise ApiError("So e possivel adicionar amigos aceitos ao grupo", 400)

    if _get_member(group_id, user_id) is not None:
        raise ApiError("Essa pessoa ja e membro do grupo", 400)

    user = User.query.filter_by(id=user_id).first()
    if user is None or user.deleted_at is not None:
        raise ApiError("Usuario nao encontrado", 404)

    member = GroupMember(group_id=group_id, user_id=user_id)
    db.session.add(member)
    db.session.commit()
    return {"member": member.to_dict()}, 201


@groups_bp.delete("/<uuid:group_id>/members/<uuid:user_id>")
@login_required
def remove_member(group_id, user_id):
    _require_membership(group_id)
    member = _get_member(group_id, user_id)
    if member is None:
        raise ApiError("Membro nao encontrado", 404)

    net = compute_group_net_balances(group_id)
    balance = net.get(user_id, 0)
    if balance != 0:
        raise ApiError("Quite o saldo do grupo antes de sair ou remover esse membro", 400)

    db.session.delete(member)
    db.session.commit()
    return {"ok": True}


@groups_bp.delete("/<uuid:group_id>")
@login_required
def delete_group(group_id):
    _require_membership(group_id)
    group = Group.query.get(group_id)
    if group is None:
        raise ApiError("Grupo nao encontrado", 404)

    net = compute_group_net_balances(group_id)
    if any(balance != 0 for balance in net.values()):
        raise ApiError("Quite todos os saldos do grupo antes de exclui-lo", 400)

    expense_ids = [e.id for e in SharedExpense.query.filter_by(group_id=group_id).all()]
    if expense_ids:
        from app.models import ExpenseParticipant

        ExpenseParticipant.query.filter(ExpenseParticipant.shared_expense_id.in_(expense_ids)).delete(
            synchronize_session=False
        )
        SharedExpense.query.filter(SharedExpense.id.in_(expense_ids)).delete(synchronize_session=False)

    Settlement.query.filter_by(group_id=group_id).delete(synchronize_session=False)
    GroupMember.query.filter_by(group_id=group_id).delete(synchronize_session=False)
    db.session.delete(group)
    db.session.commit()
    return {"ok": True}


@groups_bp.get("/<uuid:group_id>/simplify")
@login_required
def simplify_debts(group_id):
    _require_membership(group_id)
    transfers = simplify_group_debts(group_id)
    return {"transfers": transfers}
