import datetime as dt
from decimal import Decimal, ROUND_HALF_UP

from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import Account, Asset, Category, Dividend, DividendSchedule, InvestmentAccount, Transaction
from app.models.investment import DIVIDEND_CALC_MODES, DIVIDEND_FREQUENCIES, DIVIDEND_KINDS
from app.services.finance_service import add_months, recalc_account_balance, safe_day
from app.services.quotes_service import convert_to_brl, get_brl_rates
from app.routes.investments import _asset_position

dividends_bp = Blueprint("dividends", __name__)

DIVIDEND_CATEGORY_NAME = "Investimentos"

FREQUENCY_MONTHS = {
    "monthly": 1,
    "quarterly": 3,
    "semiannual": 6,
    "yearly": 12,
}


def _get_or_create_dividend_category(user_id):
    category = Category.query.filter_by(user_id=user_id, name=DIVIDEND_CATEGORY_NAME, archived=True).first()
    if category is None:
        category = Category(
            user_id=user_id,
            name=DIVIDEND_CATEGORY_NAME,
            icon="\U0001F4B0",
            color_hex="#C0912F",
            kind="income",
            archived=True,
        )
        db.session.add(category)
        db.session.flush()
    return category


def _owned_asset(asset_id):
    return (
        Asset.query.join(InvestmentAccount, InvestmentAccount.id == Asset.investment_account_id)
        .join(Account, Account.id == InvestmentAccount.account_id)
        .filter(Asset.id == asset_id, Account.user_id == g.current_user.id)
        .first()
    )


def _owned_schedule(schedule_id):
    return (
        DividendSchedule.query.join(Asset, Asset.id == DividendSchedule.asset_id)
        .join(InvestmentAccount, InvestmentAccount.id == Asset.investment_account_id)
        .join(Account, Account.id == InvestmentAccount.account_id)
        .filter(DividendSchedule.id == schedule_id, Account.user_id == g.current_user.id)
        .first()
    )


def _owned_dividend(dividend_id):
    return (
        Dividend.query.join(Asset, Asset.id == Dividend.asset_id)
        .join(InvestmentAccount, InvestmentAccount.id == Asset.investment_account_id)
        .join(Account, Account.id == InvestmentAccount.account_id)
        .filter(Dividend.id == dividend_id, Account.user_id == g.current_user.id)
        .first()
    )


def _due_date_for(day_of_month, reference=None):
    reference = reference or dt.date.today()
    return dt.date(reference.year, reference.month, safe_day(reference.year, reference.month, day_of_month))


def _amount_for_schedule(schedule: DividendSchedule, quantity: Decimal):
    if schedule.calc_mode == "fixed":
        return (schedule.fixed_amount or Decimal("0")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    per_share = schedule.amount_per_share or Decimal("0")
    return (per_share * quantity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _materialize_schedule(schedule: DividendSchedule):
    """Gera os recebimentos vencidos (ate hoje) que ainda nao existem para este
    provento recorrente, usando a posicao do ativo na data de cada ocorrencia."""
    if not schedule.active:
        return

    today = dt.date.today()
    asset = schedule.asset
    account = asset.investment_account.account
    category = _get_or_create_dividend_category(g.current_user.id)
    months_step = FREQUENCY_MONTHS[schedule.frequency]

    created_any = False
    while schedule.next_due_date <= today:
        due_date = schedule.next_due_date
        quantity = Decimal(str(_asset_position(asset)["quantity"]))
        amount = _amount_for_schedule(schedule, quantity)

        if amount > 0:
            tx = Transaction(
                user_id=g.current_user.id,
                account_id=account.id,
                category_id=category.id,
                description=f"Provento {asset.code or asset.name}",
                amount=amount,
                type="income",
                date=due_date,
                payment_method="debit",
                status="confirmed",
            )
            db.session.add(tx)
            db.session.flush()

            dividend = Dividend(
                asset_id=asset.id,
                schedule_id=schedule.id,
                transaction_id=tx.id,
                kind=schedule.kind,
                date=due_date,
                quantity_snapshot=quantity,
                amount=amount,
            )
            db.session.add(dividend)
            created_any = True

        schedule.next_due_date = add_months(schedule.next_due_date, months_step)

    if created_any:
        db.session.flush()
        recalc_account_balance(account)


def _sync_all_schedules(user_id):
    schedules = (
        DividendSchedule.query.join(Asset, Asset.id == DividendSchedule.asset_id)
        .join(InvestmentAccount, InvestmentAccount.id == Asset.investment_account_id)
        .join(Account, Account.id == InvestmentAccount.account_id)
        .filter(Account.user_id == user_id, DividendSchedule.active.is_(True))
        .all()
    )
    for schedule in schedules:
        _materialize_schedule(schedule)


@dividends_bp.get("/schedules")
@login_required
def list_schedules():
    _sync_all_schedules(g.current_user.id)
    db.session.commit()

    schedules = (
        DividendSchedule.query.join(Asset, Asset.id == DividendSchedule.asset_id)
        .join(InvestmentAccount, InvestmentAccount.id == Asset.investment_account_id)
        .join(Account, Account.id == InvestmentAccount.account_id)
        .filter(Account.user_id == g.current_user.id)
        .order_by(DividendSchedule.created_at.desc())
        .all()
    )
    result = []
    for s in schedules:
        data = s.to_dict()
        data["asset"] = s.asset.to_dict()
        result.append(data)
    return {"dividend_schedules": result}


@dividends_bp.post("/schedules")
@login_required
def create_schedule():
    data = request.get_json(silent=True) or {}

    asset = _owned_asset(data.get("asset_id"))
    if asset is None:
        raise ApiError("Ativo não encontrado", 404)

    kind = data.get("kind") or "dividendo"
    if kind not in DIVIDEND_KINDS:
        raise ApiError("Tipo de provento inválido", 400)

    calc_mode = data.get("calc_mode")
    if calc_mode not in DIVIDEND_CALC_MODES:
        raise ApiError("Modo de cálculo inválido", 400)

    frequency = data.get("frequency") or "monthly"
    if frequency not in DIVIDEND_FREQUENCIES:
        raise ApiError("Periodicidade inválida", 400)

    day_of_month = data.get("day_of_month")
    if not day_of_month or not (1 <= int(day_of_month) <= 31):
        raise ApiError("Dia previsto de pagamento inválido", 400)

    amount_per_share = None
    fixed_amount = None
    if calc_mode == "per_share":
        amount_per_share = data.get("amount_per_share")
        if not amount_per_share or Decimal(str(amount_per_share)) <= 0:
            raise ApiError("Informe o valor por cota", 400)
        amount_per_share = Decimal(str(amount_per_share))
    else:
        fixed_amount = data.get("fixed_amount")
        if not fixed_amount or Decimal(str(fixed_amount)) <= 0:
            raise ApiError("Informe o valor fixo", 400)
        fixed_amount = Decimal(str(fixed_amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    start_raw = data.get("start_date")
    start_date = dt.date.fromisoformat(start_raw) if start_raw else _due_date_for(int(day_of_month))

    schedule = DividendSchedule(
        asset_id=asset.id,
        kind=kind,
        calc_mode=calc_mode,
        amount_per_share=amount_per_share,
        fixed_amount=fixed_amount,
        frequency=frequency,
        day_of_month=int(day_of_month),
        next_due_date=start_date,
        active=True,
    )
    db.session.add(schedule)
    db.session.flush()

    _materialize_schedule(schedule)
    db.session.commit()

    result = schedule.to_dict()
    result["asset"] = asset.to_dict()
    return {"dividend_schedule": result}, 201


@dividends_bp.patch("/schedules/<uuid:schedule_id>")
@login_required
def update_schedule(schedule_id):
    schedule = _owned_schedule(schedule_id)
    if schedule is None:
        raise ApiError("Provento recorrente não encontrado", 404)

    data = request.get_json(silent=True) or {}

    if "kind" in data:
        if data["kind"] not in DIVIDEND_KINDS:
            raise ApiError("Tipo de provento inválido", 400)
        schedule.kind = data["kind"]
    if "calc_mode" in data:
        if data["calc_mode"] not in DIVIDEND_CALC_MODES:
            raise ApiError("Modo de cálculo inválido", 400)
        schedule.calc_mode = data["calc_mode"]
    if "amount_per_share" in data:
        value = data["amount_per_share"]
        schedule.amount_per_share = Decimal(str(value)) if value not in (None, "") else None
    if "fixed_amount" in data:
        value = data["fixed_amount"]
        schedule.fixed_amount = (
            Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if value not in (None, "") else None
        )
    if "frequency" in data:
        if data["frequency"] not in DIVIDEND_FREQUENCIES:
            raise ApiError("Periodicidade inválida", 400)
        schedule.frequency = data["frequency"]
    if "day_of_month" in data:
        day_of_month = data["day_of_month"]
        if not day_of_month or not (1 <= int(day_of_month) <= 31):
            raise ApiError("Dia previsto de pagamento inválido", 400)
        schedule.day_of_month = int(day_of_month)
    if "active" in data:
        schedule.active = bool(data["active"])

    db.session.commit()

    result = schedule.to_dict()
    result["asset"] = schedule.asset.to_dict()
    return {"dividend_schedule": result}


@dividends_bp.delete("/schedules/<uuid:schedule_id>")
@login_required
def delete_schedule(schedule_id):
    schedule = _owned_schedule(schedule_id)
    if schedule is None:
        raise ApiError("Provento recorrente não encontrado", 404)

    Dividend.query.filter_by(schedule_id=schedule.id).update({"schedule_id": None})
    db.session.flush()
    db.session.delete(schedule)
    db.session.commit()
    return {"ok": True}


@dividends_bp.get("/")
@login_required
def list_dividends():
    _sync_all_schedules(g.current_user.id)
    db.session.commit()

    limit = request.args.get("limit")
    query = (
        Dividend.query.join(Asset, Asset.id == Dividend.asset_id)
        .join(InvestmentAccount, InvestmentAccount.id == Asset.investment_account_id)
        .join(Account, Account.id == InvestmentAccount.account_id)
        .filter(Account.user_id == g.current_user.id)
        .order_by(Dividend.date.desc(), Dividend.created_at.desc())
    )
    if limit:
        query = query.limit(int(limit))

    fx_rates, _ = get_brl_rates()

    result = []
    for d in query.all():
        data = d.to_dict()
        data["asset"] = d.asset.to_dict()
        currency = d.asset.investment_account.account.currency
        data["currency"] = currency
        data["amount_brl"] = float(convert_to_brl(d.amount, currency, fx_rates))
        result.append(data)
    return {"dividends": result}


@dividends_bp.post("/")
@login_required
def create_dividend():
    """Dividendo avulso: registra um unico recebimento, sem gerar recorrencia."""
    data = request.get_json(silent=True) or {}

    asset = _owned_asset(data.get("asset_id"))
    if asset is None:
        raise ApiError("Ativo não encontrado", 404)

    kind = data.get("kind") or "dividendo"
    if kind not in DIVIDEND_KINDS:
        raise ApiError("Tipo de provento inválido", 400)

    amount = data.get("amount")
    if not amount or Decimal(str(amount)) <= 0:
        raise ApiError("Valor deve ser maior que zero", 400)
    amount = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    date_raw = data.get("date")
    if not date_raw:
        raise ApiError("Data é obrigatória", 400)
    received_date = dt.date.fromisoformat(date_raw)

    account = asset.investment_account.account
    category = _get_or_create_dividend_category(g.current_user.id)

    tx = Transaction(
        user_id=g.current_user.id,
        account_id=account.id,
        category_id=category.id,
        description=f"Provento {asset.code or asset.name}",
        amount=amount,
        type="income",
        date=received_date,
        payment_method="debit",
        status="confirmed",
    )
    db.session.add(tx)
    db.session.flush()

    quantity = Decimal(str(_asset_position(asset)["quantity"]))
    dividend = Dividend(
        asset_id=asset.id,
        schedule_id=None,
        transaction_id=tx.id,
        kind=kind,
        date=received_date,
        quantity_snapshot=quantity,
        amount=amount,
    )
    db.session.add(dividend)
    db.session.flush()

    recalc_account_balance(account)
    db.session.commit()

    result = dividend.to_dict()
    result["asset"] = asset.to_dict()
    return {"dividend": result}, 201


@dividends_bp.patch("/<uuid:dividend_id>")
@login_required
def update_dividend(dividend_id):
    dividend = _owned_dividend(dividend_id)
    if dividend is None:
        raise ApiError("Recebimento não encontrado", 404)

    data = request.get_json(silent=True) or {}
    tx = Transaction.query.get(dividend.transaction_id) if dividend.transaction_id else None
    account = tx.account if tx else None

    if "amount" in data:
        amount = data["amount"]
        if not amount or Decimal(str(amount)) <= 0:
            raise ApiError("Valor deve ser maior que zero", 400)
        dividend.amount = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if tx:
            tx.amount = dividend.amount
    if "date" in data:
        dividend.date = dt.date.fromisoformat(data["date"])
        if tx:
            tx.date = dividend.date
    if "kind" in data:
        if data["kind"] not in DIVIDEND_KINDS:
            raise ApiError("Tipo de provento inválido", 400)
        dividend.kind = data["kind"]

    db.session.flush()
    if account:
        recalc_account_balance(account)
    db.session.commit()

    result = dividend.to_dict()
    result["asset"] = dividend.asset.to_dict()
    return {"dividend": result}


@dividends_bp.delete("/<uuid:dividend_id>")
@login_required
def delete_dividend(dividend_id):
    dividend = _owned_dividend(dividend_id)
    if dividend is None:
        raise ApiError("Recebimento não encontrado", 404)

    tx = Transaction.query.get(dividend.transaction_id) if dividend.transaction_id else None
    account = tx.account if tx else None

    db.session.delete(dividend)
    db.session.flush()
    if tx:
        db.session.delete(tx)
        db.session.flush()

    if account:
        recalc_account_balance(account)
    db.session.commit()
    return {"ok": True}
