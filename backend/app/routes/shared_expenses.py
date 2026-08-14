import datetime as dt
from decimal import Decimal, ROUND_HALF_UP

from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import Account, ExpenseParticipant, Group, GroupMember, SharedExpense
from app.routes.friends import are_friends
from app.services.finance_service import apply_transaction_side_effects, recalc_account_balance
from app.services.split_service import (
    get_or_create_shared_expense_category,
    split_by_percentage,
    split_equal,
    validate_value_split,
)
from app.models.transaction import Transaction

shared_expenses_bp = Blueprint("shared_expenses", __name__)


def _friend_pair(user_a_id, user_b_id):
    return sorted([user_a_id, user_b_id], key=str)


def _resolve_scope(data):
    """Retorna (group_id, friend_low, friend_high, allowed_member_ids) a partir do payload."""
    group_id = data.get("group_id")
    friend_user_id = data.get("friend_user_id")

    if group_id and friend_user_id:
        raise ApiError("Informe apenas grupo ou amigo, nao os dois", 400)

    if group_id:
        membership = GroupMember.query.filter_by(group_id=group_id, user_id=g.current_user.id).first()
        if membership is None:
            raise ApiError("Grupo nao encontrado", 404)
        member_ids = {m.user_id for m in GroupMember.query.filter_by(group_id=group_id).all()}
        return group_id, None, None, member_ids

    if friend_user_id:
        if not are_friends(g.current_user.id, friend_user_id):
            raise ApiError("Voces nao sao amigos", 404)
        low, high = _friend_pair(g.current_user.id, friend_user_id)
        return None, low, high, {g.current_user.id, friend_user_id}

    raise ApiError("Informe o grupo ou o amigo dessa despesa", 400)


def _resolve_shares(total_amount, split_mode, participants):
    if not participants:
        raise ApiError("Selecione ao menos um participante", 400)

    participant_ids = [p["user_id"] for p in participants]
    if len(set(str(p) for p in participant_ids)) != len(participant_ids):
        raise ApiError("Participante duplicado na lista", 400)

    try:
        if split_mode == "equal":
            shares = split_equal(total_amount, participant_ids)
            if any(v <= 0 for v in shares.values()):
                raise ApiError(
                    "O valor e pequeno demais para ser dividido entre todos os participantes "
                    "(algum participante ficaria com R$ 0,00). Reduza o numero de participantes "
                    "ou aumente o valor.",
                    400,
                )
        elif split_mode == "value":
            shares = {p["user_id"]: Decimal(str(p["value"])).quantize(Decimal("0.01")) for p in participants}
            validate_value_split(total_amount, shares)
            # Participante com valor 0 nao deve nada dessa despesa -- so estava
            # na lista (ex.: adiantou o dinheiro mas nao consumiu nada).
            shares = {uid: v for uid, v in shares.items() if v > 0}
        elif split_mode == "percentage":
            percentages = {p["user_id"]: Decimal(str(p["percentage"])) for p in participants}
            shares = split_by_percentage(total_amount, percentages)
            shares = {uid: v for uid, v in shares.items() if v > 0}
        else:
            raise ApiError("Modo de divisao invalido", 400)
    except ValueError as exc:
        raise ApiError(str(exc), 400)

    if not shares:
        raise ApiError("Selecione ao menos um participante com valor maior que zero", 400)

    return shares


@shared_expenses_bp.post("/")
@login_required
def create_shared_expense():
    data = request.get_json(silent=True) or {}

    description = (data.get("description") or "").strip()
    total_amount = data.get("total_amount")
    date_raw = data.get("date")
    paid_by_id = data.get("paid_by_id") or str(g.current_user.id)
    split_mode = data.get("split_mode") or "equal"
    participants = data.get("participants") or []
    payer_account_id = data.get("payer_account_id")

    if not description:
        raise ApiError("Descricao e obrigatoria", 400)
    if not total_amount or Decimal(str(total_amount)) <= 0:
        raise ApiError("Valor deve ser maior que zero", 400)
    if not date_raw:
        raise ApiError("Data e obrigatoria", 400)
    if split_mode not in ("equal", "value", "percentage"):
        raise ApiError("Modo de divisao invalido", 400)

    total_amount = Decimal(str(total_amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    group_id, friend_low, friend_high, allowed_member_ids = _resolve_scope(data)

    if str(paid_by_id) not in {str(x) for x in allowed_member_ids}:
        raise ApiError("Quem pagou precisa fazer parte do grupo ou da amizade", 400)

    participant_ids = {str(p["user_id"]) for p in participants}
    if not participant_ids.issubset({str(x) for x in allowed_member_ids}):
        raise ApiError("Todos os participantes precisam fazer parte do grupo ou da amizade", 400)

    shares = _resolve_shares(total_amount, split_mode, participants)

    expense = SharedExpense(
        group_id=group_id,
        friend_user_low_id=friend_low,
        friend_user_high_id=friend_high,
        description=description,
        total_amount=total_amount,
        date=dt.date.fromisoformat(date_raw),
        paid_by_id=paid_by_id,
        split_mode=split_mode,
        created_by=g.current_user.id,
        notes=data.get("notes"),
    )
    db.session.add(expense)
    db.session.flush()

    for user_id, share_amount in shares.items():
        db.session.add(ExpenseParticipant(shared_expense_id=expense.id, user_id=user_id, share_amount=share_amount))

    if str(paid_by_id) == str(g.current_user.id) and payer_account_id:
        _link_payment(expense, payer_account_id)

    db.session.commit()
    return {"shared_expense": expense.to_dict()}, 201


def _link_payment(expense, account_id):
    account = Account.query.filter_by(id=account_id, user_id=g.current_user.id, archived=False).first()
    if account is None:
        raise ApiError("Conta nao encontrada", 404)

    category = get_or_create_shared_expense_category(g.current_user.id)
    tx = Transaction(
        user_id=g.current_user.id,
        account_id=account.id,
        category_id=category.id,
        description=expense.description,
        amount=expense.total_amount,
        type="expense",
        date=expense.date,
        payment_method="debit",
        status="confirmed",
    )
    db.session.add(tx)
    db.session.flush()
    apply_transaction_side_effects(tx, account)

    expense.payer_account_id = account.id
    expense.transaction_id = tx.id


@shared_expenses_bp.post("/<uuid:expense_id>/link-payment")
@login_required
def link_payment(expense_id):
    expense = SharedExpense.query.filter_by(id=expense_id, paid_by_id=g.current_user.id).first()
    if expense is None:
        raise ApiError("Despesa nao encontrada", 404)
    if expense.transaction_id is not None:
        raise ApiError("Essa despesa ja esta vinculada a uma conta", 400)

    data = request.get_json(silent=True) or {}
    account_id = data.get("account_id")
    if not account_id:
        raise ApiError("Informe a conta", 400)

    _link_payment(expense, account_id)
    db.session.commit()
    return {"shared_expense": expense.to_dict()}


def _require_scope_membership(expense):
    if expense.group_id:
        membership = GroupMember.query.filter_by(group_id=expense.group_id, user_id=g.current_user.id).first()
        if membership is None:
            raise ApiError("Despesa nao encontrada", 404)
    else:
        me = str(g.current_user.id)
        if me not in (str(expense.friend_user_low_id), str(expense.friend_user_high_id)):
            raise ApiError("Despesa nao encontrada", 404)


@shared_expenses_bp.patch("/<uuid:expense_id>")
@login_required
def update_shared_expense(expense_id):
    expense = SharedExpense.query.get(expense_id)
    if expense is None:
        raise ApiError("Despesa nao encontrada", 404)
    _require_scope_membership(expense)

    data = request.get_json(silent=True) or {}
    for field in ("description", "notes"):
        if field in data:
            setattr(expense, field, data[field])
    if "date" in data:
        expense.date = dt.date.fromisoformat(data["date"])

    if "total_amount" in data or "split_mode" in data or "participants" in data:
        total_amount = Decimal(str(data.get("total_amount", expense.total_amount))).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        split_mode = data.get("split_mode", expense.split_mode)
        participants = data.get("participants")
        if participants is None:
            participants = [{"user_id": p.user_id, "value": p.share_amount} for p in expense.participants]

        shares = _resolve_shares(total_amount, split_mode, participants)

        ExpenseParticipant.query.filter_by(shared_expense_id=expense.id).delete()
        db.session.flush()
        for user_id, share_amount in shares.items():
            db.session.add(
                ExpenseParticipant(shared_expense_id=expense.id, user_id=user_id, share_amount=share_amount)
            )

        expense.total_amount = total_amount
        expense.split_mode = split_mode

        if expense.transaction_id:
            tx = Transaction.query.get(expense.transaction_id)
            if tx:
                tx.amount = total_amount
                tx.description = expense.description
                tx.date = expense.date
                db.session.flush()
                apply_transaction_side_effects(tx, tx.account)

    db.session.commit()
    return {"shared_expense": expense.to_dict()}


@shared_expenses_bp.delete("/<uuid:expense_id>")
@login_required
def delete_shared_expense(expense_id):
    expense = SharedExpense.query.get(expense_id)
    if expense is None:
        raise ApiError("Despesa nao encontrada", 404)
    _require_scope_membership(expense)

    tx = Transaction.query.get(expense.transaction_id) if expense.transaction_id else None
    account = tx.account if tx else None

    ExpenseParticipant.query.filter_by(shared_expense_id=expense.id).delete()
    db.session.delete(expense)
    if tx:
        db.session.delete(tx)
    db.session.flush()

    if account:
        recalc_account_balance(account)

    db.session.commit()
    return {"ok": True}


@shared_expenses_bp.get("/pending-payments")
@login_required
def pending_payments():
    expenses = SharedExpense.query.filter_by(paid_by_id=g.current_user.id, transaction_id=None).all()
    return {"shared_expenses": [e.to_dict() for e in expenses]}
