import datetime as dt
from decimal import Decimal, ROUND_HALF_UP

from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import Account, Category, InstallmentPlan, SharedExpense, Settlement, Transaction
from app.models.transaction import TRANSACTION_STATUSES
from app.services.finance_service import (
    add_months,
    apply_transaction_side_effects,
    day_after_closing,
    get_or_create_invoice,
    invoice_month_for_date,
    recalc_account_balance,
    recalc_credit_card_used_amount,
    recalc_installment_plan_total,
    recalc_invoice_paid_amount,
    recalc_invoice_total,
)

transactions_bp = Blueprint("transactions", __name__)


def _parse_filters():
    filters = []
    account_id = request.args.get("account_id")
    category_id = request.args.get("category_id")
    tx_type = request.args.get("type")
    search = request.args.get("search")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    status = request.args.get("status")
    is_invoice_payment = request.args.get("is_invoice_payment")

    if account_id:
        filters.append(Transaction.account_id == account_id)
    if category_id:
        filters.append(Transaction.category_id == category_id)
    if tx_type in ("income", "expense"):
        filters.append(Transaction.type == tx_type)
    if status in ("confirmed", "scheduled"):
        filters.append(Transaction.status == status)
    if search:
        filters.append(Transaction.description.ilike(f"%{search}%"))
    if date_from:
        filters.append(Transaction.date >= dt.date.fromisoformat(date_from))
    if date_to:
        filters.append(Transaction.date <= dt.date.fromisoformat(date_to))
    if is_invoice_payment is not None:
        filters.append(Transaction.is_invoice_payment.is_(is_invoice_payment.lower() == "true"))
    return filters


@transactions_bp.get("/")
@login_required
def list_transactions():
    filters = _parse_filters()
    query = Transaction.query.filter(Transaction.user_id == g.current_user.id, *filters)
    query = query.order_by(Transaction.date.desc(), Transaction.created_at.desc())

    page = int(request.args.get("page", 1))
    page_size = min(int(request.args.get("page_size", 50)), 200)
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "transactions": _transactions_with_group([t for t in items]),
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def _transactions_with_group(items):
    """Quando a transacao veio de uma despesa dividida ou acerto de contas de
    grupo, anexa o icone/cor do grupo -- pra tela de Transacoes mostrar o
    visual do grupo especifico em vez do icone generico da categoria
    'Despesas compartilhadas'/'Recebimento de amigos'. Busca tudo em lote (2
    queries) em vez de uma query por transacao."""
    tx_ids = [t.id for t in items]
    if not tx_ids:
        return []

    group_by_tx_id = {}

    expenses = (
        SharedExpense.query.filter(SharedExpense.transaction_id.in_(tx_ids), SharedExpense.group_id.isnot(None))
        .all()
    )
    for e in expenses:
        if e.group:
            group_by_tx_id[e.transaction_id] = e.group

    settlements = (
        Settlement.query.filter(
            db.or_(
                Settlement.payer_transaction_id.in_(tx_ids),
                Settlement.receiver_transaction_id.in_(tx_ids),
            ),
            Settlement.group_id.isnot(None),
        )
        .all()
    )
    for s in settlements:
        if s.group:
            if s.payer_transaction_id in tx_ids:
                group_by_tx_id[s.payer_transaction_id] = s.group
            if s.receiver_transaction_id in tx_ids:
                group_by_tx_id[s.receiver_transaction_id] = s.group

    result = []
    for t in items:
        data = t.to_dict()
        group = group_by_tx_id.get(t.id)
        if group:
            data["group_icon"] = group.icon
            data["group_color_hex"] = group.color_hex
        result.append(data)
    return result


@transactions_bp.post("/")
@login_required
def create_transaction():
    data = request.get_json(silent=True) or {}

    description = (data.get("description") or "").strip()
    amount = data.get("amount")
    tx_type = data.get("type")
    account_id = data.get("account_id")
    category_id = data.get("category_id")
    payment_method = data.get("payment_method")
    date_raw = data.get("date")
    installments_count = int(data.get("installments_count") or 1)

    if not description:
        raise ApiError("Descrição é obrigatória", 400)
    if tx_type not in ("income", "expense"):
        raise ApiError("Tipo inválido", 400)
    if payment_method not in ("debit", "credit", "pix", "other"):
        raise ApiError("Forma de pagamento inválida", 400)
    if not amount or Decimal(str(amount)) <= 0:
        raise ApiError("Valor deve ser maior que zero", 400)
    if not date_raw:
        raise ApiError("Data é obrigatória", 400)

    account = Account.query.filter_by(id=account_id, user_id=g.current_user.id).first()
    if account is None:
        raise ApiError("Conta não encontrada", 404)
    category = Category.query.filter_by(id=category_id, user_id=g.current_user.id, archived=False).first()
    if category is None:
        raise ApiError("Categoria não encontrada", 404)

    purchase_date = dt.date.fromisoformat(date_raw)
    amount = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if payment_method == "credit":
        if account.type != "credit_card" or not account.credit_card:
            raise ApiError("Conta selecionada não é um cartão de crédito", 400)

        credit_card = account.credit_card

        if installments_count > 1:
            if tx_type != "expense":
                raise ApiError("Parcelamento só se aplica a despesas", 400)

            installment_amount = (amount / installments_count).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            plan = InstallmentPlan(
                user_id=g.current_user.id,
                credit_card_id=credit_card.id,
                category_id=category.id,
                description=description,
                total_amount=amount,
                installments_count=installments_count,
                installment_amount=installment_amount,
                first_installment_date=purchase_date,
                status="active",
            )
            db.session.add(plan)
            db.session.flush()

            created = []
            remaining = amount
            first_ref_month = invoice_month_for_date(credit_card, purchase_date)
            for n in range(1, installments_count + 1):
                ref_month = first_ref_month if n == 1 else add_months(first_ref_month, n - 1)
                installment_date = purchase_date if n == 1 else day_after_closing(credit_card, ref_month)
                invoice = get_or_create_invoice(credit_card, ref_month)

                value = installment_amount if n < installments_count else remaining
                remaining -= installment_amount

                tx = Transaction(
                    user_id=g.current_user.id,
                    account_id=account.id,
                    category_id=category.id,
                    description=f"{description} ({n}/{installments_count})",
                    amount=value,
                    type="expense",
                    date=installment_date,
                    payment_method="credit",
                    status="confirmed" if n == 1 else "scheduled",
                    credit_card_invoice_id=invoice.id,
                    installment_plan_id=plan.id,
                    installment_number=n,
                )
                db.session.add(tx)
                created.append(tx)

            db.session.flush()
            for tx in created:
                recalc_invoice_total(tx.credit_card_invoice)
            recalc_credit_card_used_amount(credit_card)
            db.session.commit()
            return {"transaction": created[0].to_dict(), "installment_plan": plan.to_dict()}, 201

        ref_month = invoice_month_for_date(credit_card, purchase_date)
        invoice = get_or_create_invoice(credit_card, ref_month)
        tx = Transaction(
            user_id=g.current_user.id,
            account_id=account.id,
            category_id=category.id,
            description=description,
            amount=amount,
            type=tx_type,
            date=purchase_date,
            payment_method="credit",
            status="confirmed",
            credit_card_invoice_id=invoice.id,
        )
        db.session.add(tx)
        db.session.flush()
        recalc_invoice_total(invoice)
        recalc_credit_card_used_amount(credit_card)
        db.session.commit()
        return {"transaction": tx.to_dict()}, 201

    tx = Transaction(
        user_id=g.current_user.id,
        account_id=account.id,
        category_id=category.id,
        description=description,
        amount=amount,
        type=tx_type,
        date=purchase_date,
        payment_method=payment_method,
        status="confirmed",
        notes=data.get("notes"),
    )
    db.session.add(tx)
    db.session.flush()
    recalc_account_balance(account)
    db.session.commit()
    return {"transaction": tx.to_dict()}, 201


@transactions_bp.patch("/<uuid:transaction_id>")
@login_required
def update_transaction(transaction_id):
    tx = Transaction.query.filter_by(id=transaction_id, user_id=g.current_user.id).first()
    if tx is None:
        raise ApiError("Transação não encontrada", 404)

    data = request.get_json(silent=True) or {}
    if "status" in data and data["status"] not in TRANSACTION_STATUSES:
        raise ApiError("Status inválido", 400)
    for field in ("description", "notes", "status"):
        if field in data:
            setattr(tx, field, data[field])
    if "amount" in data:
        tx.amount = Decimal(str(data["amount"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    old_account = tx.account
    old_invoice = tx.credit_card_invoice
    account_changed = False

    if "account_id" in data and data["account_id"] != str(tx.account_id):
        if tx.installment_plan_id or tx.is_invoice_payment:
            raise ApiError("Não é possível trocar a conta desta transação", 400)
        new_account = Account.query.filter_by(
            id=data["account_id"], user_id=g.current_user.id, archived=False
        ).first()
        if new_account is None:
            raise ApiError("Conta não encontrada", 404)
        is_credit = new_account.type == "credit_card"
        if is_credit and not new_account.credit_card:
            raise ApiError("Conta selecionada não é um cartão de crédito", 400)
        if is_credit and tx.type == "income":
            raise ApiError("Receitas não podem ser vinculadas a cartão de crédito", 400)
        tx.account_id = new_account.id
        tx.payment_method = "credit" if is_credit else "debit"
        if not is_credit:
            tx.credit_card_invoice_id = None
        account_changed = True

    if "date" in data:
        tx.date = dt.date.fromisoformat(data["date"])
    if (account_changed or "date" in data) and tx.payment_method == "credit" and tx.account.credit_card:
        ref_month = invoice_month_for_date(tx.account.credit_card, tx.date)
        new_invoice = get_or_create_invoice(tx.account.credit_card, ref_month)
        tx.credit_card_invoice_id = new_invoice.id
    if "category_id" in data and not tx.is_invoice_payment:
        category = Category.query.filter_by(
            id=data["category_id"], user_id=g.current_user.id, archived=False
        ).first()
        if category is None:
            raise ApiError("Categoria não encontrada", 404)
        tx.category_id = category.id

    db.session.flush()
    apply_transaction_side_effects(tx, tx.account)
    if account_changed:
        recalc_account_balance(old_account)
    if old_invoice and old_invoice.id != tx.credit_card_invoice_id:
        recalc_invoice_total(old_invoice)
        recalc_credit_card_used_amount(old_invoice.credit_card)
    if "amount" in data and tx.installment_plan_id:
        recalc_installment_plan_total(tx.installment_plan)
    db.session.commit()
    return {"transaction": tx.to_dict()}


@transactions_bp.delete("/<uuid:transaction_id>")
@login_required
def delete_transaction(transaction_id):
    tx = Transaction.query.filter_by(id=transaction_id, user_id=g.current_user.id).first()
    if tx is None:
        raise ApiError("Transação não encontrada", 404)

    account = tx.account
    invoice = tx.credit_card_invoice
    payment_for_invoice = tx.invoice_payment_for if tx.is_invoice_payment else None
    db.session.delete(tx)
    db.session.flush()

    recalc_account_balance(account)
    if invoice:
        recalc_invoice_total(invoice)
        recalc_credit_card_used_amount(invoice.credit_card)
    if payment_for_invoice:
        recalc_invoice_paid_amount(payment_for_invoice)
        recalc_credit_card_used_amount(payment_for_invoice.credit_card)

    db.session.commit()
    return {"ok": True}
