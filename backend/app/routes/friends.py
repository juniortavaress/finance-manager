import datetime as dt

from flask import Blueprint, g, request
from sqlalchemy import or_

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import Friendship, SharedExpense, Settlement, User
from app.services.split_service import compute_friend_total_balance

friends_bp = Blueprint("friends", __name__)


def find_friendship_between(user_a_id, user_b_id):
    return Friendship.query.filter(
        or_(
            db.and_(Friendship.requester_id == user_a_id, Friendship.addressee_id == user_b_id),
            db.and_(Friendship.requester_id == user_b_id, Friendship.addressee_id == user_a_id),
        )
    ).first()


def are_friends(user_a_id, user_b_id):
    friendship = find_friendship_between(user_a_id, user_b_id)
    return friendship is not None and friendship.status == "accepted"


def _friend_pair(user_a_id, user_b_id):
    return sorted([user_a_id, user_b_id], key=str)


@friends_bp.get("/search")
@login_required
def search_users():
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return {"users": []}

    existing = Friendship.query.filter(
        or_(Friendship.requester_id == g.current_user.id, Friendship.addressee_id == g.current_user.id)
    ).all()
    excluded_ids = {g.current_user.id}
    for f in existing:
        if f.status in ("pending", "accepted"):
            excluded_ids.add(f.requester_id)
            excluded_ids.add(f.addressee_id)

    users = (
        User.query.filter(
            User.deleted_at.is_(None),
            User.id.notin_(excluded_ids),
            or_(User.name.ilike(f"%{q}%"), User.email.ilike(f"%{q}%")),
        )
        .limit(20)
        .all()
    )
    return {"users": [u.to_dict() for u in users]}


@friends_bp.get("/")
@login_required
def list_friends():
    accepted = Friendship.query.filter(
        Friendship.status == "accepted",
        or_(Friendship.requester_id == g.current_user.id, Friendship.addressee_id == g.current_user.id),
    ).all()

    result = []
    for f in accepted:
        friend = f.addressee if f.requester_id == g.current_user.id else f.requester
        data = friend.to_dict()
        balance_info = compute_friend_total_balance(g.current_user.id, friend.id)
        data["balance"] = balance_info["total"]
        data["balance_breakdown"] = balance_info["breakdown"]
        data["friendship_id"] = str(f.id)
        result.append(data)
    return {"friends": result}


@friends_bp.get("/requests")
@login_required
def list_requests():
    sent = Friendship.query.filter_by(requester_id=g.current_user.id, status="pending").all()
    received = Friendship.query.filter_by(addressee_id=g.current_user.id, status="pending").all()
    return {
        "sent": [{**f.to_dict(), "addressee": f.addressee.to_dict()} for f in sent],
        "received": [{**f.to_dict(), "requester": f.requester.to_dict()} for f in received],
    }


@friends_bp.post("/requests")
@login_required
def send_request():
    data = request.get_json(silent=True) or {}
    addressee_id = data.get("addressee_id")
    if not addressee_id:
        raise ApiError("Informe o usuario a adicionar", 400)
    if str(addressee_id) == str(g.current_user.id):
        raise ApiError("Voce nao pode adicionar a si mesmo", 400)

    addressee = User.query.filter_by(id=addressee_id).first()
    if addressee is None or addressee.deleted_at is not None:
        raise ApiError("Usuario nao encontrado", 404)

    existing = find_friendship_between(g.current_user.id, addressee_id)
    if existing is not None:
        if existing.status == "accepted":
            raise ApiError("Voce ja e amigo dessa pessoa", 400)
        if existing.status == "pending":
            raise ApiError("Ja existe uma solicitacao pendente", 400)

    friendship = Friendship(requester_id=g.current_user.id, addressee_id=addressee_id, status="pending")
    db.session.add(friendship)
    db.session.commit()
    return {"friendship": friendship.to_dict()}, 201


@friends_bp.post("/requests/<uuid:request_id>/accept")
@login_required
def accept_request(request_id):
    friendship = Friendship.query.filter_by(id=request_id, addressee_id=g.current_user.id, status="pending").first()
    if friendship is None:
        raise ApiError("Solicitacao nao encontrada", 404)

    friendship.status = "accepted"
    friendship.responded_at = dt.datetime.now(dt.timezone.utc)
    db.session.commit()
    return {"friendship": friendship.to_dict()}


@friends_bp.post("/requests/<uuid:request_id>/reject")
@login_required
def reject_request(request_id):
    friendship = Friendship.query.filter_by(id=request_id, addressee_id=g.current_user.id, status="pending").first()
    if friendship is None:
        raise ApiError("Solicitacao nao encontrada", 404)

    friendship.status = "rejected"
    friendship.responded_at = dt.datetime.now(dt.timezone.utc)
    db.session.commit()
    return {"friendship": friendship.to_dict()}


def _shared_group_ids(user_a_id, user_b_id):
    from app.models import GroupMember

    a_ids = {gm.group_id for gm in GroupMember.query.filter_by(user_id=user_a_id).all()}
    b_ids = {gm.group_id for gm in GroupMember.query.filter_by(user_id=user_b_id).all()}
    return a_ids & b_ids


@friends_bp.get("/<uuid:friend_user_id>/expenses")
@login_required
def friend_expenses(friend_user_id):
    if not are_friends(g.current_user.id, friend_user_id):
        raise ApiError("Voces nao sao amigos", 404)

    low, high = _friend_pair(g.current_user.id, friend_user_id)
    standalone = SharedExpense.query.filter_by(group_id=None, friend_user_low_id=low, friend_user_high_id=high).all()

    shared_group_ids = _shared_group_ids(g.current_user.id, friend_user_id)
    group_expenses = (
        SharedExpense.query.filter(SharedExpense.group_id.in_(shared_group_ids)).all() if shared_group_ids else []
    )

    expenses = sorted(standalone + group_expenses, key=lambda e: e.date, reverse=True)
    return {"shared_expenses": [e.to_dict() for e in expenses]}


@friends_bp.get("/<uuid:friend_user_id>/history")
@login_required
def friend_history(friend_user_id):
    """Despesas e acertos entre voce e esse amigo (avulsos + de grupos em comum),
    unificados numa unica linha do tempo -- para que a soma da lista sempre bata
    com o saldo total mostrado (que tambem soma os acertos ja registrados)."""
    if not are_friends(g.current_user.id, friend_user_id):
        raise ApiError("Voces nao sao amigos", 404)

    low, high = _friend_pair(g.current_user.id, friend_user_id)
    shared_group_ids = _shared_group_ids(g.current_user.id, friend_user_id)

    standalone_expenses = SharedExpense.query.filter_by(
        group_id=None, friend_user_low_id=low, friend_user_high_id=high
    ).all()
    group_expenses = (
        SharedExpense.query.filter(SharedExpense.group_id.in_(shared_group_ids)).all() if shared_group_ids else []
    )

    standalone_settlements = Settlement.query.filter_by(
        group_id=None, friend_user_low_id=low, friend_user_high_id=high
    ).all()
    group_settlements = (
        Settlement.query.filter(Settlement.group_id.in_(shared_group_ids)).all() if shared_group_ids else []
    )

    items = [
        {"type": "expense", "date": e.date.isoformat(), "created_at": e.created_at, "data": e.to_dict()}
        for e in standalone_expenses + group_expenses
    ]
    items += [
        {"type": "settlement", "date": s.date.isoformat(), "created_at": s.created_at, "data": s.to_dict()}
        for s in standalone_settlements + group_settlements
    ]
    items.sort(key=lambda x: x["created_at"], reverse=True)
    for item in items:
        del item["created_at"]
    return {"history": items}


@friends_bp.get("/<uuid:friend_user_id>/balance")
@login_required
def friend_balance(friend_user_id):
    if not are_friends(g.current_user.id, friend_user_id):
        raise ApiError("Voces nao sao amigos", 404)

    return compute_friend_total_balance(g.current_user.id, friend_user_id)


@friends_bp.get("/<uuid:friend_user_id>/accounts")
@login_required
def friend_accounts(friend_user_id):
    """Contas do amigo disponiveis para ele escolher em acertos/vinculos que ELE mesmo
    confirma (o front usa isso apenas para exibir; a escrita real sempre exige que o
    usuario logado seja o dono da conta)."""
    if not are_friends(g.current_user.id, friend_user_id):
        raise ApiError("Voces nao sao amigos", 404)

    from app.models import Account

    accounts = Account.query.filter_by(user_id=friend_user_id, type="checking", archived=False).all()
    return {"accounts": [a.to_dict() for a in accounts]}


@friends_bp.get("/activity")
@login_required
def activity_feed():
    from app.models import GroupMember

    my_group_ids = [
        gm.group_id for gm in GroupMember.query.filter_by(user_id=g.current_user.id).all()
    ]

    group_expenses = (
        SharedExpense.query.filter(SharedExpense.group_id.in_(my_group_ids)).all() if my_group_ids else []
    )
    pair_expenses = SharedExpense.query.filter(
        SharedExpense.group_id.is_(None),
        or_(
            SharedExpense.friend_user_low_id == g.current_user.id,
            SharedExpense.friend_user_high_id == g.current_user.id,
        ),
    ).all()

    group_settlements = (
        Settlement.query.filter(Settlement.group_id.in_(my_group_ids)).all() if my_group_ids else []
    )
    pair_settlements = Settlement.query.filter(
        Settlement.group_id.is_(None),
        or_(
            Settlement.friend_user_low_id == g.current_user.id,
            Settlement.friend_user_high_id == g.current_user.id,
        ),
    ).all()

    items = []
    for e in group_expenses + pair_expenses:
        items.append({"type": "expense", "created_at": e.created_at.isoformat(), "data": e.to_dict()})
    for s in group_settlements + pair_settlements:
        items.append({"type": "settlement", "created_at": s.created_at.isoformat(), "data": s.to_dict()})

    items.sort(key=lambda x: x["created_at"], reverse=True)
    limit = int(request.args.get("limit", 20))
    return {"activity": items[:limit]}
