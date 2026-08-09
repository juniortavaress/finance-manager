import datetime as dt
from decimal import Decimal, ROUND_HALF_UP

from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import Account, Category, CreditCardInvoice, RecurringTransaction, Transaction
from app.services.finance_service import (
    add_months,
    get_or_create_invoice,
    invoice_month_for_date,
    recalc_account_balance,
    recalc_credit_card_used_amount,
    recalc_invoice_total,
)

recurring_bp = Blueprint("recurring", __name__)


def _generate_occurrences(recurring: RecurringTransaction) -> list[dt.date]:
    """Gera as datas de ocorrencia entre start_date e o menor entre end_date e hoje.
    Nunca gera ocorrencia no futuro - cada mes so passa a existir quando chega."""
    today = dt.date.today()
    start = recurring.start_date
    end = min(recurring.end_date, today) if recurring.end_date else today
    if end < start:
        return []

    dates = []
    current = start
    if recurring.frequency == "monthly":
        while current <= end:
            dates.append(current)
            current = add_months(current, 1)
    elif recurring.frequency == "weekly":
        while current <= end:
            dates.append(current)
            current = current + dt.timedelta(days=7)
    elif recurring.frequency == "yearly":
        while current <= end:
            dates.append(current)
            current = add_months(current, 12)
    return dates


def _materialize_transactions(recurring: RecurringTransaction):
    """Cria as transacoes que ainda nao existem para as ocorrencias ate hoje do recorrente.
    Idempotente: pode ser chamada de novo sem duplicar o que ja foi gerado.
    Se for cobranca no cartao, resolve/cria a fatura de cada ocorrencia e recalcula os totais."""
    occurrences = _generate_occurrences(recurring)

    existing_dates = {
        row[0]
        for row in db.session.query(Transaction.date)
        .filter(Transaction.recurring_transaction_id == recurring.id)
        .all()
    }

    is_credit = recurring.payment_method == "credit"
    credit_card = recurring.account.credit_card if is_credit else None
    touched_invoices = {}

    created_any = False
    for occurrence_date in occurrences:
        if occurrence_date in existing_dates:
            continue

        tx_kwargs = dict(
            user_id=recurring.user_id,
            account_id=recurring.account_id,
            category_id=recurring.category_id,
            description=recurring.description,
            amount=recurring.amount,
            type=recurring.type,
            date=occurrence_date,
            payment_method=recurring.payment_method,
            recurring_transaction_id=recurring.id,
        )

        if is_credit and credit_card:
            ref_month = invoice_month_for_date(credit_card, occurrence_date)
            invoice = get_or_create_invoice(credit_card, ref_month)
            touched_invoices[invoice.id] = invoice
            tx_kwargs["status"] = "confirmed"
            tx_kwargs["credit_card_invoice_id"] = invoice.id
        else:
            tx_kwargs["status"] = "confirmed" if recurring.auto_confirm else "scheduled"

        tx = Transaction(**tx_kwargs)
        db.session.add(tx)
        created_any = True

    if occurrences and created_any:
        recurring.next_run_date = occurrences[-1]

    if touched_invoices:
        db.session.flush()
        for invoice in touched_invoices.values():
            recalc_invoice_total(invoice)
        recalc_credit_card_used_amount(credit_card)


def _materialize_all_active(user_id):
    active = RecurringTransaction.query.filter_by(user_id=user_id, active=True).all()
    for recurring in active:
        _materialize_transactions(recurring)


@recurring_bp.get("/")
@login_required
def list_recurring():
    active_only = request.args.get("active_only") == "1"

    _materialize_all_active(g.current_user.id)
    db.session.commit()

    query = RecurringTransaction.query.filter_by(user_id=g.current_user.id)
    if active_only:
        query = query.filter_by(active=True)
    items = query.order_by(RecurringTransaction.created_at.desc()).all()
    return {"recurring_transactions": [r.to_dict() for r in items]}


@recurring_bp.post("/")
@login_required
def create_recurring():
    data = request.get_json(silent=True) or {}

    description = (data.get("description") or "").strip()
    amount = data.get("amount")
    tx_type = data.get("type")
    account_id = data.get("account_id")
    category_id = data.get("category_id")
    payment_method = data.get("payment_method") or "debit"
    frequency = data.get("frequency") or "monthly"
    start_date_raw = data.get("start_date")
    end_date_raw = data.get("end_date")

    if not description:
        raise ApiError("Descricao e obrigatoria", 400)
    if payment_method not in ("debit", "pix", "other", "credit"):
        raise ApiError("Forma de pagamento invalida", 400)
    if tx_type not in ("income", "expense"):
        raise ApiError("Tipo invalido", 400)
    if frequency not in ("monthly", "weekly", "yearly"):
        raise ApiError("Frequencia invalida", 400)
    if not amount or Decimal(str(amount)) <= 0:
        raise ApiError("Valor deve ser maior que zero", 400)
    if not start_date_raw:
        raise ApiError("Data de inicio e obrigatoria", 400)

    if payment_method == "credit":
        account = Account.query.filter_by(id=account_id, user_id=g.current_user.id, type="credit_card").first()
        if account is None or not account.credit_card:
            raise ApiError("Cartao de credito nao encontrado", 404)
    else:
        account = Account.query.filter_by(id=account_id, user_id=g.current_user.id, type="checking").first()
        if account is None:
            raise ApiError("Conta corrente nao encontrada", 404)

    category = Category.query.filter_by(id=category_id, user_id=g.current_user.id, archived=False).first()
    if category is None:
        raise ApiError("Categoria nao encontrada", 404)

    start_date = dt.date.fromisoformat(start_date_raw)
    end_date = dt.date.fromisoformat(end_date_raw) if end_date_raw else None
    if end_date and end_date < start_date:
        raise ApiError("Data final nao pode ser anterior a data de inicio", 400)

    recurring = RecurringTransaction(
        user_id=g.current_user.id,
        account_id=account.id,
        category_id=category.id,
        description=description,
        amount=Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        type=tx_type,
        payment_method=payment_method,
        frequency=frequency,
        day_of_month=data.get("day_of_month") or start_date.day,
        start_date=start_date,
        end_date=end_date,
        auto_confirm=bool(data.get("auto_confirm", True)),
        active=True,
    )
    db.session.add(recurring)
    db.session.flush()

    _materialize_transactions(recurring)
    db.session.flush()
    if payment_method != "credit":
        recalc_account_balance(account)
    db.session.commit()

    return {"recurring_transaction": recurring.to_dict()}, 201


def _move_current_occurrence(recurring, new_account, new_payment_method):
    """Move a transacao ja materializada da ocorrencia mais recente para a nova
    conta/cartao, recalculando saldo/fatura tanto da origem quanto do destino."""
    latest_tx = (
        Transaction.query.filter_by(recurring_transaction_id=recurring.id)
        .order_by(Transaction.date.desc())
        .first()
    )
    if latest_tx is None:
        return

    old_account = latest_tx.account
    old_invoice = (
        CreditCardInvoice.query.get(latest_tx.credit_card_invoice_id)
        if latest_tx.credit_card_invoice_id
        else None
    )

    latest_tx.account_id = new_account.id
    latest_tx.payment_method = new_payment_method

    if new_payment_method == "credit":
        credit_card = new_account.credit_card
        ref_month = invoice_month_for_date(credit_card, latest_tx.date)
        new_invoice = get_or_create_invoice(credit_card, ref_month)
        latest_tx.credit_card_invoice_id = new_invoice.id
        latest_tx.status = "confirmed"
    else:
        latest_tx.credit_card_invoice_id = None
        latest_tx.status = "confirmed" if recurring.auto_confirm else "scheduled"

    db.session.flush()

    if old_invoice:
        recalc_invoice_total(old_invoice)
        if old_invoice.credit_card:
            recalc_credit_card_used_amount(old_invoice.credit_card)
    elif old_account:
        recalc_account_balance(old_account)

    if new_payment_method == "credit":
        recalc_invoice_total(new_invoice)
        recalc_credit_card_used_amount(new_account.credit_card)
    else:
        recalc_account_balance(new_account)


@recurring_bp.patch("/<uuid:recurring_id>")
@login_required
def update_recurring(recurring_id):
    recurring = RecurringTransaction.query.filter_by(id=recurring_id, user_id=g.current_user.id).first()
    if recurring is None:
        raise ApiError("Debito automatico nao encontrado", 404)

    data = request.get_json(silent=True) or {}
    edit_scope = data.get("edit_scope", "future_only")
    if edit_scope not in ("current_and_future", "future_only"):
        raise ApiError("Escopo de edicao invalido", 400)

    editable_fields_changed = False
    if "description" in data:
        description = (data["description"] or "").strip()
        if not description:
            raise ApiError("Descricao e obrigatoria", 400)
        recurring.description = description
        editable_fields_changed = True
    if "amount" in data:
        amount = data["amount"]
        if not amount or Decimal(str(amount)) <= 0:
            raise ApiError("Valor deve ser maior que zero", 400)
        recurring.amount = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        editable_fields_changed = True
    if "category_id" in data:
        category = Category.query.filter_by(
            id=data["category_id"], user_id=g.current_user.id, archived=False
        ).first()
        if category is None:
            raise ApiError("Categoria nao encontrada", 404)
        recurring.category_id = category.id
        editable_fields_changed = True
    if "day_of_month" in data:
        recurring.day_of_month = data["day_of_month"]
        editable_fields_changed = True
    if "end_date" in data:
        end_date = dt.date.fromisoformat(data["end_date"]) if data["end_date"] else None
        if end_date and end_date < recurring.start_date:
            raise ApiError("Data final nao pode ser anterior a data de inicio", 400)
        recurring.end_date = end_date
        editable_fields_changed = True
    if "auto_confirm" in data:
        recurring.auto_confirm = bool(data["auto_confirm"])
        editable_fields_changed = True

    structural_fields_changed = False
    new_account = None
    if "account_id" in data or "payment_method" in data:
        payment_method = data.get("payment_method", recurring.payment_method)
        account_id = data.get("account_id", recurring.account_id)
        if payment_method == "credit":
            new_account = Account.query.filter_by(id=account_id, user_id=g.current_user.id, type="credit_card").first()
            if new_account is None or not new_account.credit_card:
                raise ApiError("Cartao de credito nao encontrado", 404)
        else:
            new_account = Account.query.filter_by(id=account_id, user_id=g.current_user.id, type="checking").first()
            if new_account is None:
                raise ApiError("Conta corrente nao encontrada", 404)

        if edit_scope == "current_and_future":
            _move_current_occurrence(recurring, new_account, payment_method)

        recurring.account_id = new_account.id
        recurring.payment_method = payment_method
        structural_fields_changed = True
    if "frequency" in data:
        if data["frequency"] not in ("monthly", "weekly", "yearly"):
            raise ApiError("Frequencia invalida", 400)
        recurring.frequency = data["frequency"]
        structural_fields_changed = True
    if "start_date" in data and edit_scope == "current_and_future":
        recurring.start_date = dt.date.fromisoformat(data["start_date"])
        structural_fields_changed = True

    if (editable_fields_changed or structural_fields_changed) and recurring.active:
        Transaction.query.filter_by(recurring_transaction_id=recurring.id, status="scheduled").delete(
            synchronize_session=False
        )
        _materialize_transactions(recurring)

    if "active" in data:
        was_active = recurring.active
        recurring.active = bool(data["active"])
        if not recurring.active and was_active:
            Transaction.query.filter_by(
                recurring_transaction_id=recurring.id, status="scheduled"
            ).delete(synchronize_session=False)
        elif recurring.active and not was_active:
            _materialize_transactions(recurring)

    if editable_fields_changed or structural_fields_changed or "active" in data:
        db.session.flush()
        if recurring.payment_method != "credit":
            recalc_account_balance(recurring.account)
        else:
            recalc_credit_card_used_amount(recurring.account.credit_card)

    db.session.commit()
    return {"recurring_transaction": recurring.to_dict()}


@recurring_bp.delete("/<uuid:recurring_id>")
@login_required
def delete_recurring(recurring_id):
    recurring = RecurringTransaction.query.filter_by(id=recurring_id, user_id=g.current_user.id).first()
    if recurring is None:
        raise ApiError("Debito automatico nao encontrado", 404)

    account = recurring.account
    is_credit = recurring.payment_method == "credit"
    touched_invoice_ids = set()
    if is_credit:
        touched_invoice_ids = {
            row[0]
            for row in db.session.query(Transaction.credit_card_invoice_id)
            .filter(
                Transaction.recurring_transaction_id == recurring.id,
                Transaction.status == "scheduled",
                Transaction.credit_card_invoice_id.isnot(None),
            )
            .all()
        }

    Transaction.query.filter_by(recurring_transaction_id=recurring.id, status="scheduled").delete(
        synchronize_session=False
    )
    db.session.delete(recurring)
    db.session.flush()

    if is_credit:
        for invoice_id in touched_invoice_ids:
            invoice = CreditCardInvoice.query.get(invoice_id)
            if invoice:
                recalc_invoice_total(invoice)
        if account.credit_card:
            recalc_credit_card_used_amount(account.credit_card)
    else:
        recalc_account_balance(account)

    db.session.commit()
    return {"ok": True}
