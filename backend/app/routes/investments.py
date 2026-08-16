import datetime as dt
from decimal import Decimal, ROUND_HALF_UP

from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import Account, Asset, AssetTransaction, Bank, Category, InvestmentAccount, Transaction
from app.models.investment import ASSET_TYPES
from app.services.finance_service import add_months, recalc_account_balance

investments_bp = Blueprint("investments", __name__)

TRANSFER_CATEGORY_NAME = "Transferência entre contas"


def _get_or_create_transfer_category(user_id):
    category = Category.query.filter_by(user_id=user_id, name=TRANSFER_CATEGORY_NAME, archived=True).first()
    if category is None:
        category = Category(
            user_id=user_id,
            name=TRANSFER_CATEGORY_NAME,
            icon="\U0001F501",
            color_hex="#8B9A97",
            kind="both",
            archived=True,
        )
        db.session.add(category)
        db.session.flush()
    return category


def _owned_investment_accounts():
    return (
        InvestmentAccount.query.join(Account, Account.id == InvestmentAccount.account_id)
        .filter(Account.user_id == g.current_user.id)
        .all()
    )


def _owned_asset(asset_id):
    return (
        Asset.query.join(InvestmentAccount, InvestmentAccount.id == Asset.investment_account_id)
        .join(Account, Account.id == InvestmentAccount.account_id)
        .filter(Asset.id == asset_id, Account.user_id == g.current_user.id)
        .first()
    )


def _asset_position(asset: Asset):
    """Quantidade, custo total e preco medio a partir do historico de compras/vendas.
    Vendas reduzem a quantidade mas nao alteram o preco medio das compras restantes
    (metodo de custo medio, sem FIFO/LIFO)."""
    quantity = Decimal("0")
    cost_basis = Decimal("0")
    avg_price = Decimal("0")

    for tx in asset.asset_transactions:
        if tx.type == "buy":
            cost_basis += tx.quantity * tx.unit_price + tx.fee_amount
            quantity += tx.quantity
            avg_price = (cost_basis / quantity) if quantity > 0 else Decimal("0")
        else:
            cost_basis -= tx.quantity * avg_price
            quantity -= tx.quantity

    current_value = (quantity * asset.current_unit_price) if asset.current_unit_price is not None else None

    return {
        "quantity": float(quantity),
        "avg_unit_price": float(avg_price),
        "invested_amount": float(cost_basis),
        "current_amount": float(current_value) if current_value is not None else None,
    }


def _asset_to_dict(asset: Asset):
    data = asset.to_dict()
    data["position"] = _asset_position(asset)
    return data


@investments_bp.get("/assets")
@login_required
def list_assets():
    inv_account_ids = [ia.id for ia in _owned_investment_accounts()]
    assets = (
        Asset.query.filter(Asset.investment_account_id.in_(inv_account_ids)).all() if inv_account_ids else []
    )
    return {"assets": [_asset_to_dict(a) for a in assets]}


@investments_bp.get("/asset-transactions")
@login_required
def list_asset_transactions():
    inv_account_ids = [ia.id for ia in _owned_investment_accounts()]
    asset_ids = (
        [a.id for a in Asset.query.filter(Asset.investment_account_id.in_(inv_account_ids)).all()]
        if inv_account_ids
        else []
    )
    if not asset_ids:
        return {"asset_transactions": []}

    limit = request.args.get("limit")
    query = AssetTransaction.query.filter(AssetTransaction.asset_id.in_(asset_ids)).order_by(
        AssetTransaction.date.desc(), AssetTransaction.created_at.desc()
    )
    if limit:
        query = query.limit(int(limit))

    result = []
    for tx in query.all():
        data = tx.to_dict()
        data["asset"] = tx.asset.to_dict()
        result.append(data)
    return {"asset_transactions": result}


def _month_start(d: dt.date) -> dt.date:
    return d.replace(day=1)


@investments_bp.get("/summary")
@login_required
def investments_summary():
    bank_filter = request.args.get("bank_id")

    inv_accounts = _owned_investment_accounts()
    inv_account_ids = [ia.id for ia in inv_accounts]
    if not inv_account_ids:
        return {
            "assets": [],
            "unallocated_by_bank": [],
            "evolution": [],
        }

    accounts_by_ia_id = {
        ia.id: Account.query.get(ia.account_id) for ia in inv_accounts
    }

    all_assets = Asset.query.filter(Asset.investment_account_id.in_(inv_account_ids)).all()
    assets_result = []
    earliest_date = None
    for asset in all_assets:
        account = accounts_by_ia_id[asset.investment_account_id]
        if bank_filter and str(account.bank_id) != bank_filter:
            continue
        bank = Bank.query.get(account.bank_id)
        data = asset.to_dict()
        data["position"] = _asset_position(asset)
        data["bank_id"] = str(account.bank_id)
        data["bank_name"] = bank.name if bank else None
        data["bank_color"] = bank.color_hex if bank else None
        assets_result.append(data)
        for tx in asset.asset_transactions:
            if earliest_date is None or tx.date < earliest_date:
                earliest_date = tx.date

    unallocated_by_bank = []
    for ia in inv_accounts:
        account = accounts_by_ia_id[ia.id]
        if bank_filter and str(account.bank_id) != bank_filter:
            continue
        if account.balance <= 0:
            continue
        bank = Bank.query.get(account.bank_id)
        unallocated_by_bank.append(
            {
                "bank_id": str(account.bank_id),
                "bank_name": bank.name if bank else None,
                "bank_color": bank.color_hex if bank else None,
                "balance": float(account.balance),
            }
        )

    evolution = []
    if earliest_date:
        today = dt.date.today()
        cursor = _month_start(earliest_date)
        last = _month_start(today)
        months = []
        while cursor <= last:
            months.append(cursor)
            cursor = add_months(cursor, 1)

        relevant_assets = [
            a
            for a in all_assets
            if not bank_filter or str(accounts_by_ia_id[a.investment_account_id].bank_id) == bank_filter
        ]

        for month_start in months:
            month_end = add_months(month_start, 1)
            invested_total = Decimal("0")
            current_total = Decimal("0")
            for asset in relevant_assets:
                quantity = Decimal("0")
                cost_basis = Decimal("0")
                avg_price = Decimal("0")
                for tx in asset.asset_transactions:
                    if tx.date >= month_end:
                        continue
                    if tx.type == "buy":
                        cost_basis += tx.quantity * tx.unit_price
                        quantity += tx.quantity
                        avg_price = (cost_basis / quantity) if quantity > 0 else Decimal("0")
                    else:
                        cost_basis -= tx.quantity * avg_price
                        quantity -= tx.quantity
                invested_total += cost_basis
                if asset.current_unit_price is not None:
                    current_total += quantity * asset.current_unit_price
                else:
                    current_total += cost_basis
            evolution.append(
                {
                    "year": month_start.year,
                    "month": month_start.month,
                    "invested": float(invested_total),
                    "current": float(current_total),
                }
            )

    return {
        "assets": assets_result,
        "unallocated_by_bank": unallocated_by_bank,
        "evolution": evolution,
    }


@investments_bp.post("/assets")
@login_required
def create_asset():
    data = request.get_json(silent=True) or {}
    investment_account_id = data.get("investment_account_id")
    name = (data.get("name") or "").strip()
    code = (data.get("code") or "").strip() or None
    asset_type = data.get("type")

    if not name:
        raise ApiError("Nome do ativo é obrigatório", 400)
    if asset_type not in ASSET_TYPES:
        raise ApiError("Categoria do ativo inválida", 400)

    ia = InvestmentAccount.query.join(Account, Account.id == InvestmentAccount.account_id).filter(
        InvestmentAccount.id == investment_account_id, Account.user_id == g.current_user.id
    ).first()
    if ia is None:
        raise ApiError("Conta de investimento não encontrada", 404)

    asset = Asset(investment_account_id=ia.id, type=asset_type, code=code, name=name)
    db.session.add(asset)
    db.session.commit()
    return {"asset": _asset_to_dict(asset)}, 201


@investments_bp.patch("/assets/<uuid:asset_id>")
@login_required
def update_asset(asset_id):
    asset = _owned_asset(asset_id)
    if asset is None:
        raise ApiError("Ativo não encontrado", 404)

    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise ApiError("Nome do ativo é obrigatório", 400)
        asset.name = name
    if "code" in data:
        asset.code = (data["code"] or "").strip() or None
    if "type" in data:
        if data["type"] not in ASSET_TYPES:
            raise ApiError("Categoria do ativo inválida", 400)
        asset.type = data["type"]
    if "current_unit_price" in data:
        price = data["current_unit_price"]
        asset.current_unit_price = Decimal(str(price)) if price not in (None, "") else None

    db.session.commit()
    return {"asset": _asset_to_dict(asset)}


@investments_bp.delete("/assets/<uuid:asset_id>")
@login_required
def delete_asset(asset_id):
    asset = _owned_asset(asset_id)
    if asset is None:
        raise ApiError("Ativo não encontrado", 404)
    if asset.asset_transactions:
        raise ApiError("Não é possível excluir um ativo com compras ou vendas registradas", 400)

    db.session.delete(asset)
    db.session.commit()
    return {"ok": True}


def _create_asset_transaction(asset, kind, data):
    date_raw = data.get("date")
    quantity = data.get("quantity")
    unit_price = data.get("unit_price")
    fee_amount = data.get("fee_amount") or 0
    note_id = (data.get("note_id") or "").strip() or None

    if not date_raw:
        raise ApiError("Data é obrigatória", 400)
    if not quantity or Decimal(str(quantity)) <= 0:
        raise ApiError("Quantidade deve ser maior que zero", 400)
    if not unit_price or Decimal(str(unit_price)) <= 0:
        raise ApiError("Valor unitário deve ser maior que zero", 400)
    if Decimal(str(fee_amount)) < 0:
        raise ApiError("Taxa não pode ser negativa", 400)

    quantity = Decimal(str(quantity))
    unit_price = Decimal(str(unit_price))
    fee_amount = Decimal(str(fee_amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    total_amount = (quantity * unit_price + fee_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    trade_date = dt.date.fromisoformat(date_raw)

    account = asset.investment_account.account
    category = _get_or_create_transfer_category(g.current_user.id)

    if kind == "buy":
        if total_amount > account.balance:
            raise ApiError("Saldo insuficiente na conta de investimento", 400)
        tx_type = "expense"
        description = f"Compra {asset.code or asset.name}"
    else:
        position = _asset_position(asset)
        if quantity > Decimal(str(position["quantity"])):
            raise ApiError("Quantidade insuficiente do ativo para vender", 400)
        tx_type = "income"
        description = f"Venda {asset.code or asset.name}"

    tx = Transaction(
        user_id=g.current_user.id,
        account_id=account.id,
        category_id=category.id,
        description=description,
        amount=total_amount,
        type=tx_type,
        date=trade_date,
        payment_method="debit",
        status="confirmed",
        is_transfer=True,
    )
    db.session.add(tx)
    db.session.flush()

    asset_tx = AssetTransaction(
        asset_id=asset.id,
        transaction_id=tx.id,
        type=kind,
        date=trade_date,
        quantity=quantity,
        unit_price=unit_price,
        total_amount=total_amount,
        fee_amount=fee_amount,
        note_id=note_id,
    )
    db.session.add(asset_tx)
    db.session.flush()

    recalc_account_balance(account)
    db.session.commit()
    return asset_tx


@investments_bp.post("/assets/<uuid:asset_id>/buy")
@login_required
def buy_asset(asset_id):
    asset = _owned_asset(asset_id)
    if asset is None:
        raise ApiError("Ativo não encontrado", 404)

    data = request.get_json(silent=True) or {}
    asset_tx = _create_asset_transaction(asset, "buy", data)
    return {"asset_transaction": asset_tx.to_dict(), "asset": _asset_to_dict(asset)}, 201


@investments_bp.post("/assets/<uuid:asset_id>/sell")
@login_required
def sell_asset(asset_id):
    asset = _owned_asset(asset_id)
    if asset is None:
        raise ApiError("Ativo não encontrado", 404)

    data = request.get_json(silent=True) or {}
    asset_tx = _create_asset_transaction(asset, "sell", data)
    return {"asset_transaction": asset_tx.to_dict(), "asset": _asset_to_dict(asset)}, 201


@investments_bp.delete("/asset-transactions/<uuid:asset_transaction_id>")
@login_required
def delete_asset_transaction(asset_transaction_id):
    asset_tx = (
        AssetTransaction.query.join(Asset, Asset.id == AssetTransaction.asset_id)
        .join(InvestmentAccount, InvestmentAccount.id == Asset.investment_account_id)
        .join(Account, Account.id == InvestmentAccount.account_id)
        .filter(AssetTransaction.id == asset_transaction_id, Account.user_id == g.current_user.id)
        .first()
    )
    if asset_tx is None:
        raise ApiError("Operação não encontrada", 404)

    tx = Transaction.query.get(asset_tx.transaction_id) if asset_tx.transaction_id else None
    account = tx.account if tx else None

    db.session.delete(asset_tx)
    if tx:
        db.session.delete(tx)
    db.session.flush()

    if account:
        recalc_account_balance(account)
    db.session.commit()
    return {"ok": True}
