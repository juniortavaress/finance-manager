import datetime as dt
from decimal import Decimal, ROUND_HALF_UP

from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import Account, Category, InstallmentPlan, Transaction
from app.models.transaction import TRANSACTION_STATUSES
from app.services.finance_service import (
    add_months,
    apply_transaction_side_effects,
    get_or_create_invoice,
    invoice_month_for_date,
    recalc_account_balance,
    recalc_credit_card_used_amount,
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
        "transactions": [t.to_dict() for t in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


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
        raise ApiError("Descricao e obrigatoria", 400)
    if tx_type not in ("income", "expense"):
        raise ApiError("Tipo invalido", 400)
    if payment_method not in ("debit", "credit", "pix", "other"):
        raise ApiError("Forma de pagamento invalida", 400)
    if not amount or Decimal(str(amount)) <= 0:
        raise ApiError("Valor deve ser maior que zero", 400)
    if not date_raw:
        raise ApiError("Data e obrigatoria", 400)

    account = Account.query.filter_by(id=account_id, user_id=g.current_user.id).first()
    if account is None:
        raise ApiError("Conta nao encontrada", 404)
    category = Category.query.filter_by(id=category_id, user_id=g.current_user.id, archived=False).first()
    if category is None:
        raise ApiError("Categoria nao encontrada", 404)

    purchase_date = dt.date.fromisoformat(date_raw)
    amount = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if payment_method == "credit":
        if account.type != "credit_card" or not account.credit_card:
            raise ApiError("Conta selecionada nao e um cartao de credito", 400)

        credit_card = account.credit_card

        if installments_count > 1:
            if tx_type != "expense":
                raise ApiError("Parcelamento so se aplica a despesas", 400)

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
            for n in range(1, installments_count + 1):
                installment_date = purchase_date if n == 1 else add_months(purchase_date, n - 1)
                ref_month = invoice_month_for_date(credit_card, installment_date)
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
        raise ApiError("Transacao nao encontrada", 404)

    data = request.get_json(silent=True) or {}
    if "status" in data and data["status"] not in TRANSACTION_STATUSES:
        raise ApiError("Status invalido", 400)
    for field in ("description", "notes", "status"):
        if field in data:
            setattr(tx, field, data[field])
    if "amount" in data:
        tx.amount = Decimal(str(data["amount"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if "date" in data:
        tx.date = dt.date.fromisoformat(data["date"])
    if "category_id" in data:
        category = Category.query.filter_by(
            id=data["category_id"], user_id=g.current_user.id, archived=False
        ).first()
        if category is None:
            raise ApiError("Categoria nao encontrada", 404)
        tx.category_id = category.id

    db.session.flush()
    apply_transaction_side_effects(tx, tx.account)
    db.session.commit()
    return {"transaction": tx.to_dict()}


@transactions_bp.delete("/<uuid:transaction_id>")
@login_required
def delete_transaction(transaction_id):
    tx = Transaction.query.filter_by(id=transaction_id, user_id=g.current_user.id).first()
    if tx is None:
        raise ApiError("Transacao nao encontrada", 404)

    account = tx.account
    invoice = tx.credit_card_invoice
    db.session.delete(tx)
    db.session.flush()

    recalc_account_balance(account)
    if invoice:
        recalc_invoice_total(invoice)
        recalc_credit_card_used_amount(invoice.credit_card)

    db.session.commit()
    return {"ok": True}
