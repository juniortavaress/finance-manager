import datetime as dt
from decimal import Decimal, ROUND_HALF_UP

from flask import Blueprint, g, request
from sqlalchemy.orm import selectinload

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import Account, Asset, AssetTransaction, Bank, Category, InvestmentAccount, Transaction
from app.models.investment import ASSET_TYPES, FIXED_INCOME_TYPES
from app.services.finance_service import add_months, recalc_account_balance
from app.services.fixed_income_service import pre_fixado_current_value
from app.services.quotes_service import convert_to_brl, get_brl_rates

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


def _pre_fixado_projected_value(asset: Asset, as_of: dt.date):
    """Valor atual projetado de um ativo pre-fixado: cada compra rende juros
    compostos (dias uteis/252) desde sua propria data ate `as_of` (ou o
    vencimento, o que vier primeiro - o titulo "congela" apos vencer).
    Vendas reduzem a base restante proporcionalmente (mesmo metodo de custo
    medio usado em _asset_position, sem FIFO/LIFO)."""
    if asset.fixed_income_rate_pct is None or asset.maturity_date is None:
        return None

    cutoff = min(as_of, asset.maturity_date)
    quantity = Decimal("0")
    projected_value = Decimal("0")

    for tx in asset.asset_transactions:
        if tx.type == "buy":
            lot_invested = tx.quantity * tx.unit_price + tx.fee_amount
            lot_value = pre_fixado_current_value(lot_invested, asset.fixed_income_rate_pct, tx.date, cutoff)
            quantity += tx.quantity
            projected_value += lot_value
        else:
            if quantity > 0:
                ratio = tx.quantity / quantity
                projected_value -= projected_value * ratio
            quantity -= tx.quantity

    return projected_value if quantity > 0 else Decimal("0")


def _asset_position(asset: Asset):
    """Quantidade, custo total e preco medio a partir do historico de compras/vendas.
    Vendas reduzem a quantidade mas nao alteram o preco medio das compras restantes
    (metodo de custo medio, sem FIFO/LIFO). Rentabilidade e "total return":
    considera valorizacao do ativo + dividendos recebidos sobre o valor investido."""
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

    if asset.type == "renda_fixa" and asset.fixed_income_type == "pre_fixado":
        current_value = _pre_fixado_projected_value(asset, dt.date.today())
    else:
        current_value = (quantity * asset.current_unit_price) if asset.current_unit_price is not None else None
    dividends_total = sum((d.amount for d in asset.dividends), Decimal("0"))

    base_value = current_value if current_value is not None else cost_basis
    total_return_pct = (
        float(((base_value + dividends_total) / cost_basis - 1) * 100) if cost_basis > 0 else None
    )

    return {
        "quantity": float(quantity),
        "avg_unit_price": float(avg_price),
        "invested_amount": float(cost_basis),
        "current_amount": float(current_value) if current_value is not None else None,
        "dividends_total": float(dividends_total),
        "total_return_pct": total_return_pct,
    }


def _asset_to_dict(asset: Asset):
    data = asset.to_dict()
    data["position"] = _asset_position(asset)
    data["archived"] = data["position"]["quantity"] <= 0
    return data


def _settle_matured_pre_fixado(asset: Asset):
    """Resgate automatico: quando um titulo pre-fixado passa do vencimento e
    ainda tem posicao em aberto, gera a venda pelo valor projetado na data de
    vencimento (mesmo formato de _create_asset_transaction), zerando a
    posicao e creditando a conta - igual um resgate real de corretora."""
    if asset.type != "renda_fixa" or asset.fixed_income_type != "pre_fixado":
        return
    if asset.maturity_date is None or asset.fixed_income_rate_pct is None:
        return
    if asset.maturity_date > dt.date.today():
        return

    position = _asset_position(asset)
    quantity = Decimal(str(position["quantity"]))
    if quantity <= 0:
        return

    redemption_value = _pre_fixado_projected_value(asset, asset.maturity_date)
    if redemption_value is None or redemption_value <= 0:
        return

    account = asset.investment_account.account
    category = _get_or_create_transfer_category(g.current_user.id)
    label = asset.code or asset.name

    tx = Transaction(
        user_id=g.current_user.id,
        account_id=account.id,
        category_id=category.id,
        description=f"Venda {label}",
        amount=redemption_value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        type="income",
        date=asset.maturity_date,
        payment_method="debit",
        status="confirmed",
        is_transfer=True,
    )
    db.session.add(tx)
    db.session.flush()

    asset_tx = AssetTransaction(
        asset_id=asset.id,
        transaction_id=tx.id,
        type="sell",
        date=asset.maturity_date,
        quantity=quantity,
        unit_price=(redemption_value / quantity).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP),
        total_amount=tx.amount,
        fee_amount=Decimal("0"),
        note_id="Resgate automático (vencimento)",
    )
    db.session.add(asset_tx)
    db.session.flush()

    recalc_account_balance(account)


def _settle_all_matured_pre_fixado(user_id):
    inv_account_ids = [ia.id for ia in _owned_investment_accounts()]
    if not inv_account_ids:
        return
    assets = Asset.query.filter(
        Asset.investment_account_id.in_(inv_account_ids),
        Asset.type == "renda_fixa",
        Asset.fixed_income_type == "pre_fixado",
        Asset.maturity_date.isnot(None),
        Asset.maturity_date <= dt.date.today(),
    ).options(selectinload(Asset.asset_transactions)).all()
    for asset in assets:
        _settle_matured_pre_fixado(asset)
    if assets:
        db.session.commit()


@investments_bp.get("/assets")
@login_required
def list_assets():
    _settle_all_matured_pre_fixado(g.current_user.id)

    inv_account_ids = [ia.id for ia in _owned_investment_accounts()]
    all_assets = (
        Asset.query.filter(Asset.investment_account_id.in_(inv_account_ids))
        .options(selectinload(Asset.asset_transactions), selectinload(Asset.dividends))
        .all()
        if inv_account_ids
        else []
    )

    active, archived = [], []
    for asset in all_assets:
        data = _asset_to_dict(asset)
        (archived if data["position"]["quantity"] <= 0 else active).append(data)
    return {"assets": active, "archived_assets": archived}


@investments_bp.get("/asset-transactions")
@login_required
def list_asset_transactions():
    bank_id = request.args.get("bank_id")

    ia_query = (
        InvestmentAccount.query.join(Account, Account.id == InvestmentAccount.account_id)
        .filter(Account.user_id == g.current_user.id)
    )
    if bank_id:
        ia_query = ia_query.filter(Account.bank_id == bank_id)
    inv_account_ids = [ia.id for ia in ia_query.all()]

    owned_assets = (
        Asset.query.filter(Asset.investment_account_id.in_(inv_account_ids)).all()
        if inv_account_ids
        else []
    )
    assets_by_id = {a.id: a for a in owned_assets}
    asset_ids = list(assets_by_id.keys())
    if not asset_ids:
        return {"asset_transactions": [], "total": 0, "page": 1, "page_size": 15}

    query = AssetTransaction.query.filter(AssetTransaction.asset_id.in_(asset_ids))

    tx_type = request.args.get("type")
    if tx_type in ("buy", "sell"):
        query = query.filter(AssetTransaction.type == tx_type)

    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    if date_from:
        query = query.filter(AssetTransaction.date >= dt.date.fromisoformat(date_from))
    if date_to:
        query = query.filter(AssetTransaction.date <= dt.date.fromisoformat(date_to))

    query = query.order_by(AssetTransaction.date.desc(), AssetTransaction.created_at.desc())

    legacy_limit = request.args.get("limit")
    if legacy_limit and "page" not in request.args:
        query = query.limit(int(legacy_limit))
        result = []
        for tx in query.all():
            data = tx.to_dict()
            data["asset"] = assets_by_id[tx.asset_id].to_dict()
            result.append(data)
        return {"asset_transactions": result, "total": len(result), "page": 1, "page_size": len(result) or 15}

    page = int(request.args.get("page", 1))
    page_size = min(int(request.args.get("page_size", 15)), 100)
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for tx in items:
        data = tx.to_dict()
        data["asset"] = assets_by_id[tx.asset_id].to_dict()
        result.append(data)
    return {"asset_transactions": result, "total": total, "page": page, "page_size": page_size}


def _month_start(d: dt.date) -> dt.date:
    return d.replace(day=1)


@investments_bp.get("/summary")
@login_required
def investments_summary():
    _settle_all_matured_pre_fixado(g.current_user.id)

    bank_filter = request.args.get("bank_id")

    inv_accounts = _owned_investment_accounts()
    inv_account_ids = [ia.id for ia in inv_accounts]
    if not inv_account_ids:
        return {
            "assets": [],
            "unallocated_by_bank": [],
            "invested_by_bank": [],
            "evolution": [],
            "total_transferred": 0,
            "total_invested": 0,
            "total_allocated_cost": 0,
            "total_unallocated": 0,
            "rentability_total": None,
            "rentability_last_month": None,
            "rentability_last_year": None,
            "fx_rates": None,
            "fx_updated_at": None,
        }

    account_ids = [ia.account_id for ia in inv_accounts]
    accounts_by_id = {a.id: a for a in Account.query.filter(Account.id.in_(account_ids)).all()}
    accounts_by_ia_id = {ia.id: accounts_by_id[ia.account_id] for ia in inv_accounts}

    bank_ids = {a.bank_id for a in accounts_by_id.values()}
    banks_by_id = {b.id: b for b in Bank.query.filter(Bank.id.in_(bank_ids)).all()}

    # Sem filtro de corretora ("todas"), valores em moeda estrangeira sao
    # convertidos para BRL pela cotacao atual para poder somar com o resto da
    # carteira. Com uma corretora especifica selecionada, mostra na moeda dela.
    fx_rates, fx_updated_at = (get_brl_rates() if not bank_filter else (None, None))

    def _to_brl(value, currency):
        if value is None:
            return None
        return float(convert_to_brl(Decimal(str(value)), currency, fx_rates))

    all_assets = (
        Asset.query.filter(Asset.investment_account_id.in_(inv_account_ids))
        .options(selectinload(Asset.asset_transactions), selectinload(Asset.dividends))
        .all()
    )
    assets_result = []
    earliest_date = None
    for asset in all_assets:
        account = accounts_by_ia_id[asset.investment_account_id]
        if bank_filter and str(account.bank_id) != bank_filter:
            continue
        bank = banks_by_id.get(account.bank_id)
        data = asset.to_dict()
        position = _asset_position(asset)
        data["position"] = position
        data["bank_id"] = str(account.bank_id)
        data["bank_name"] = bank.name if bank else None
        data["bank_color"] = bank.color_hex if bank else None
        data["currency"] = account.currency
        if not bank_filter and account.currency != "BRL":
            position["invested_amount_original"] = position["invested_amount"]
            position["current_amount_original"] = position["current_amount"]
            converted_invested = _to_brl(position["invested_amount"], account.currency)
            position["invested_amount"] = converted_invested if converted_invested is not None else position["invested_amount"]
            position["current_amount"] = _to_brl(position["current_amount"], account.currency)
        assets_result.append(data)
        for tx in asset.asset_transactions:
            if earliest_date is None or tx.date < earliest_date:
                earliest_date = tx.date

    def _transfer_txs(account, tx_type):
        return Transaction.query.filter(
            Transaction.account_id == account.id,
            Transaction.is_transfer.is_(True),
            Transaction.type == tx_type,
            Transaction.status == "confirmed",
            ~Transaction.description.startswith("Compra "),
            ~Transaction.description.startswith("Venda "),
            ~Transaction.description.startswith("Provento "),
        ).all()

    def _transfer_flow(account, tx_type):
        return sum((tx.amount for tx in _transfer_txs(account, tx_type)), Decimal("0"))

    def _transfer_flow_brl(account, tx_type):
        """Soma os aportes convertidos para BRL usando o cambio registrado em
        cada transacao (custo real de aquisicao da moeda), nao a cotacao
        atual - transacoes antigas sem exchange_rate caem na cotacao atual
        como fallback."""
        total = Decimal("0")
        for tx in _transfer_txs(account, tx_type):
            if tx.exchange_rate:
                total += tx.amount * tx.exchange_rate
            else:
                total += Decimal(str(_to_brl(float(tx.amount), account.currency)))
        return total

    unallocated_by_bank = []
    invested_by_bank = []
    total_unallocated = Decimal("0")
    total_transferred = Decimal("0")
    total_invested = Decimal("0")
    for ia in inv_accounts:
        account = accounts_by_ia_id[ia.id]
        if bank_filter and str(account.bank_id) != bank_filter:
            continue

        net_transferred = _transfer_flow(account, "income") - _transfer_flow(account, "expense")
        total_transferred += net_transferred
        ia_invested = net_transferred
        if not bank_filter and account.currency != "BRL":
            ia_invested_brl = _transfer_flow_brl(account, "income") - _transfer_flow_brl(account, "expense")
        else:
            ia_invested_brl = ia_invested

        total_invested += ia_invested_brl
        bank_for_ia = banks_by_id.get(account.bank_id)
        invested_by_bank.append(
            {
                "bank_id": str(account.bank_id),
                "bank_name": bank_for_ia.name if bank_for_ia else None,
                "bank_color": bank_for_ia.color_hex if bank_for_ia else None,
                "value": float(ia_invested_brl),
                "value_original": float(ia_invested) if account.currency != "BRL" else None,
                "currency": account.currency,
            }
        )

        if account.balance <= 0:
            continue
        bank = banks_by_id.get(account.bank_id)
        balance_brl = Decimal(str(_to_brl(float(account.balance), account.currency))) if not bank_filter and account.currency != "BRL" else account.balance
        total_unallocated += balance_brl
        unallocated_by_bank.append(
            {
                "bank_id": str(account.bank_id),
                "bank_name": bank.name if bank else None,
                "bank_color": bank.color_hex if bank else None,
                "balance": float(balance_brl),
                "balance_original": float(account.balance) if account.currency != "BRL" else None,
                "currency": account.currency,
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

        relevant_ia_ids = [
            ia.id
            for ia in inv_accounts
            if not bank_filter or str(accounts_by_ia_id[ia.id].bank_id) == bank_filter
        ]
        relevant_assets = [a for a in all_assets if a.investment_account_id in relevant_ia_ids]
        current_amount_by_asset_id = {a["id"]: a["position"]["current_amount"] for a in assets_result}

        # Movimentacoes de aporte liquido, com data, pra plotar em degrau (mesmo
        # criterio de net_transferred acima): transferencias externas para a
        # conta de investimento, excluindo movimentacoes internas de compra/venda.
        net_flow_events = []
        relevant_account_ids = [accounts_by_ia_id[ia_id].id for ia_id in relevant_ia_ids]
        if relevant_account_ids:
            transfer_txs = Transaction.query.filter(
                Transaction.account_id.in_(relevant_account_ids),
                Transaction.is_transfer.is_(True),
                Transaction.status == "confirmed",
                ~Transaction.description.startswith("Compra "),
                ~Transaction.description.startswith("Venda "),
                ~Transaction.description.startswith("Provento "),
            ).all()
            accounts_by_account_id = {a.id: a for a in accounts_by_id.values()}
            for tx in transfer_txs:
                signed_amount = tx.amount if tx.type == "income" else -tx.amount
                tx_currency = accounts_by_account_id[tx.account_id].currency
                if not bank_filter and tx_currency != "BRL":
                    fx_factor = tx.exchange_rate or Decimal(str((fx_rates or {}).get(tx_currency, 1)))
                    signed_amount *= fx_factor
                net_flow_events.append((tx.date, signed_amount))

        # Estado incremental por asset (quantidade/custo/preco medio acumulados
        # ate o cursor atual). Como asset_transactions ja vem ordenado por data,
        # cada asset avanca pelas suas transacoes uma unica vez ao longo dos
        # meses, em vez de reprocessar o historico inteiro em cada iteracao
        # (O(ativos x transacoes) no total, em vez de O(meses x ativos x transacoes)).
        asset_state = {
            asset.id: {"quantity": Decimal("0"), "cost_basis": Decimal("0"), "avg_price": Decimal("0"), "tx_idx": 0}
            for asset in relevant_assets
        }

        for month_start in months:
            month_end = add_months(month_start, 1)
            is_current_month = month_start == last
            invested_total = Decimal("0")
            current_total = Decimal("0")
            for asset in relevant_assets:
                state = asset_state[asset.id]
                txs = asset.asset_transactions
                idx = state["tx_idx"]
                quantity = state["quantity"]
                cost_basis = state["cost_basis"]
                avg_price = state["avg_price"]
                while idx < len(txs) and txs[idx].date < month_end:
                    tx = txs[idx]
                    if tx.type == "buy":
                        cost_basis += tx.quantity * tx.unit_price
                        quantity += tx.quantity
                        avg_price = (cost_basis / quantity) if quantity > 0 else Decimal("0")
                    else:
                        cost_basis -= tx.quantity * avg_price
                        quantity -= tx.quantity
                    idx += 1
                state["tx_idx"] = idx
                state["quantity"] = quantity
                state["cost_basis"] = cost_basis
                state["avg_price"] = avg_price

                asset_currency = accounts_by_ia_id[asset.investment_account_id].currency
                # Sem cotacao historica, usa a taxa atual pra converter todo o
                # historico do ativo estrangeiro - aproximacao, nao afeta ativos em BRL.
                fx_factor = (
                    Decimal(str((fx_rates or {}).get(asset_currency, 1)))
                    if not bank_filter and asset_currency != "BRL"
                    else Decimal("1")
                )

                invested_total += cost_basis * fx_factor
                if is_current_month:
                    # No mes atual, usa exatamente o mesmo valor projetado do card
                    # "Valor atual" (_asset_position, com juros compostos para
                    # pre-fixado) em vez de recalcular cru - garante que o ultimo
                    # ponto do grafico bata com o card. current_amount_by_asset_id
                    # ja vem convertido para BRL quando aplicavel.
                    current_value = current_amount_by_asset_id.get(str(asset.id))
                    current_total += Decimal(str(current_value)) if current_value is not None else cost_basis * fx_factor
                elif asset.current_unit_price is not None:
                    current_total += quantity * asset.current_unit_price * fx_factor
                else:
                    current_total += cost_basis * fx_factor

            net_flow_total = sum(
                (amount for date, amount in net_flow_events if date < month_end), Decimal("0")
            )

            evolution.append(
                {
                    "year": month_start.year,
                    "month": month_start.month,
                    "invested": float(invested_total),
                    "current": float(current_total),
                    "net_flow": float(net_flow_total),
                }
            )

    active_assets_result = [a for a in assets_result if a["position"]["quantity"] > 0]
    allocated_cost_basis = sum(
        (Decimal(str(a["position"]["invested_amount"])) for a in active_assets_result), Decimal("0")
    )
    total_current = sum(
        (Decimal(str(a["position"]["current_amount"] if a["position"]["current_amount"] is not None else a["position"]["invested_amount"])) for a in active_assets_result),
        Decimal("0"),
    )
    total_dividends = sum((Decimal(str(a["position"]["dividends_total"])) for a in active_assets_result), Decimal("0"))

    rentability_total = (
        float(((total_current + total_dividends - allocated_cost_basis) / allocated_cost_basis) * 100)
        if allocated_cost_basis > 0
        else None
    )

    def _rentability_from(base_current):
        if base_current is None or base_current <= 0 or not evolution:
            return None
        last_current = Decimal(str(evolution[-1]["current"]))
        return float(((last_current - base_current) / base_current) * 100)

    rentability_last_month = (
        _rentability_from(Decimal(str(evolution[-2]["current"]))) if len(evolution) >= 2 else None
    )

    rentability_last_year = None
    if len(evolution) >= 2:
        last_point = evolution[-1]
        target_year = last_point["year"] - 1
        year_ago_point = next(
            (p for p in evolution if p["year"] == target_year and p["month"] == last_point["month"]), None
        )
        base_point = year_ago_point or evolution[0]
        if base_point is not evolution[-1]:
            rentability_last_year = _rentability_from(Decimal(str(base_point["current"])))

    return {
        "assets": assets_result,
        "unallocated_by_bank": unallocated_by_bank,
        "invested_by_bank": invested_by_bank,
        "evolution": evolution,
        "total_transferred": float(total_transferred),
        "total_invested": float(total_invested),
        "total_allocated_cost": float(allocated_cost_basis),
        "total_unallocated": float(total_unallocated),
        "rentability_total": rentability_total,
        "rentability_last_month": rentability_last_month,
        "rentability_last_year": rentability_last_year,
        "fx_rates": fx_rates,
        "fx_updated_at": fx_updated_at.isoformat() if fx_updated_at else None,
    }


def _parse_fixed_income_fields(data, required):
    """Valida e extrai os campos de renda fixa do payload. Quando `required`
    e True (criacao de ativo renda_fixa), exige tipo, vencimento e a info
    especifica de cada modalidade. Na edicao (`required=False`) os campos sao
    aceitos e salvos livremente, sem exigir nada - existe para permitir
    corrigir ativos antigos que nao tinham essas colunas."""
    result = {}

    if "fixed_income_type" in data or required:
        fi_type = data.get("fixed_income_type")
        if required and fi_type not in FIXED_INCOME_TYPES:
            raise ApiError("Selecione o tipo de renda fixa (pós-fixado, pré-fixado ou IPCA+)", 400)
        if fi_type is not None and fi_type not in FIXED_INCOME_TYPES:
            raise ApiError("Tipo de renda fixa inválido", 400)
        result["fixed_income_type"] = fi_type or None

    effective_type = result.get("fixed_income_type", data.get("fixed_income_type"))

    if "fixed_income_indexer" in data or (required and effective_type == "pos_fixado"):
        indexer = (data.get("fixed_income_indexer") or "").strip() or None
        if required and effective_type == "pos_fixado" and not indexer:
            raise ApiError("Informe o indexador (ex.: CDI, Selic)", 400)
        result["fixed_income_indexer"] = indexer

    if "fixed_income_rate_pct" in data or (required and effective_type in ("pos_fixado", "pre_fixado", "ipca")):
        rate = data.get("fixed_income_rate_pct")
        if required and rate in (None, ""):
            raise ApiError("Informe a taxa", 400)
        result["fixed_income_rate_pct"] = Decimal(str(rate)) if rate not in (None, "") else None

    if "maturity_date" in data or required:
        maturity_raw = data.get("maturity_date")
        if required and not maturity_raw:
            raise ApiError("Informe a data de vencimento", 400)
        result["maturity_date"] = dt.date.fromisoformat(maturity_raw) if maturity_raw else None

    return result


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

    fixed_income_fields = _parse_fixed_income_fields(data, required=asset_type == "renda_fixa")

    asset = Asset(investment_account_id=ia.id, type=asset_type, code=code, name=name, **fixed_income_fields)
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
    if "investment_account_id" in data:
        ia = InvestmentAccount.query.join(Account, Account.id == InvestmentAccount.account_id).filter(
            InvestmentAccount.id == data["investment_account_id"], Account.user_id == g.current_user.id
        ).first()
        if ia is None:
            raise ApiError("Conta de investimento não encontrada", 404)
        asset.investment_account_id = ia.id

    for field, value in _parse_fixed_income_fields(data, required=False).items():
        setattr(asset, field, value)

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
    base_amount = quantity * unit_price
    trade_date = dt.date.fromisoformat(date_raw)

    account = asset.investment_account.account
    category = _get_or_create_transfer_category(g.current_user.id)

    if kind == "buy":
        total_amount = (base_amount + fee_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if total_amount > account.balance:
            raise ApiError("Saldo insuficiente na conta de investimento", 400)
        tx_type = "expense"
        description = f"Compra {asset.code or asset.name}"
    else:
        if fee_amount > base_amount:
            raise ApiError("Taxa não pode ser maior que o valor da venda", 400)
        total_amount = (base_amount - fee_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
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


def _owned_asset_transaction(asset_transaction_id):
    return (
        AssetTransaction.query.join(Asset, Asset.id == AssetTransaction.asset_id)
        .join(InvestmentAccount, InvestmentAccount.id == Asset.investment_account_id)
        .join(Account, Account.id == InvestmentAccount.account_id)
        .filter(AssetTransaction.id == asset_transaction_id, Account.user_id == g.current_user.id)
        .first()
    )


@investments_bp.patch("/asset-transactions/<uuid:asset_transaction_id>")
@login_required
def update_asset_transaction(asset_transaction_id):
    asset_tx = _owned_asset_transaction(asset_transaction_id)
    if asset_tx is None:
        raise ApiError("Operação não encontrada", 404)

    data = request.get_json(silent=True) or {}
    asset = asset_tx.asset
    account = asset.investment_account.account
    tx = Transaction.query.get(asset_tx.transaction_id) if asset_tx.transaction_id else None

    quantity = Decimal(str(data["quantity"])) if "quantity" in data else asset_tx.quantity
    unit_price = Decimal(str(data["unit_price"])) if "unit_price" in data else asset_tx.unit_price
    fee_amount = (
        Decimal(str(data["fee_amount"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if "fee_amount" in data
        else asset_tx.fee_amount
    )
    trade_date = dt.date.fromisoformat(data["date"]) if "date" in data else asset_tx.date
    note_id = (data["note_id"] or "").strip() or None if "note_id" in data else asset_tx.note_id

    if quantity <= 0:
        raise ApiError("Quantidade deve ser maior que zero", 400)
    if unit_price <= 0:
        raise ApiError("Valor unitário deve ser maior que zero", 400)
    if fee_amount < 0:
        raise ApiError("Taxa não pode ser negativa", 400)

    base_amount = quantity * unit_price

    if asset_tx.type == "buy":
        total_amount = (base_amount + fee_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if total_amount > account.balance + asset_tx.total_amount:
            raise ApiError("Saldo insuficiente na conta de investimento", 400)
    else:
        if fee_amount > base_amount:
            raise ApiError("Taxa não pode ser maior que o valor da venda", 400)
        total_amount = (base_amount - fee_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        other_quantity = sum(
            (t.quantity if t.type == "buy" else -t.quantity for t in asset.asset_transactions if t.id != asset_tx.id),
            Decimal("0"),
        )
        if quantity > other_quantity:
            raise ApiError("Quantidade insuficiente do ativo para vender", 400)

    asset_tx.quantity = quantity
    asset_tx.unit_price = unit_price
    asset_tx.fee_amount = fee_amount
    asset_tx.date = trade_date
    asset_tx.total_amount = total_amount
    asset_tx.note_id = note_id

    if tx:
        tx.amount = total_amount
        tx.date = trade_date
        tx.description = f"{'Compra' if asset_tx.type == 'buy' else 'Venda'} {asset.code or asset.name}"

    db.session.flush()
    recalc_account_balance(account)
    db.session.commit()
    return {"asset_transaction": asset_tx.to_dict(), "asset": _asset_to_dict(asset)}


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
    db.session.flush()
    if tx:
        db.session.delete(tx)
        db.session.flush()

    if account:
        recalc_account_balance(account)
    db.session.commit()
    return {"ok": True}
