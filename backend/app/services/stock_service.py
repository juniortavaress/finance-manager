import datetime as dt
import json
import logging
import urllib.request
from decimal import Decimal

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.extensions import db
from app.models import StockPrice
from app.models.base import utcnow
from app.services.finance_service import add_months

logger = logging.getLogger(__name__)

YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"

# Yahoo Finance nao e' API oficial (endpoint interno, sem chave, sem SLA) -
# mas cobre B3 e mercado americano na mesma fonte, com historico diario real
# (crypto_service/quotes_service usam fontes oficiais - CoinGecko/BCB - essa
# e' a excecao consciente, ver conversa que motivou a escolha).
YAHOO_CURRENCY_SUFFIX = {"BRL": ".SA", "USD": ""}

# Antes de existir qualquer registro local, comeca o backfill a partir desta
# data (a B3/Yahoo nao tem dado anterior a isso mesmo, na pratica).
EARLIEST_POSSIBLE_DATE = dt.date(2000, 1, 1)


def _yahoo_ticker(symbol, currency):
    suffix = YAHOO_CURRENCY_SUFFIX.get(currency)
    if suffix is None:
        return None
    return f"{symbol}{suffix}"


def _fetch_daily_closes(ticker, start_date, end_date):
    """Serie diaria (Yahoo chart API) de `ticker` entre start_date e
    end_date (inclusive). Usa period1/period2 explicitos (timestamps) em vez
    de range=max: o Yahoo reduz a granularidade para mensal/semanal em
    janelas muito longas pedidas via `range`, mas mantem diario real quando
    o intervalo e' dado por period1/period2. Retorna lista de (date,
    Decimal) ordenada por data, ou [] se a API falhar/nao tiver dado."""
    period1 = int(dt.datetime.combine(start_date, dt.time.min, tzinfo=dt.timezone.utc).timestamp())
    period2 = int(dt.datetime.combine(end_date + dt.timedelta(days=1), dt.time.min, tzinfo=dt.timezone.utc).timestamp())
    url = f"{YAHOO_CHART_URL.format(ticker=ticker)}?interval=1d&period1={period1}&period2={period2}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            logger.warning("Ticker %s nao encontrado no Yahoo Finance (404) - pulando.", ticker)
        else:
            logger.warning("Falha ao buscar historico do Yahoo Finance para %s", ticker, exc_info=True)
        return []
    except Exception:
        logger.warning("Falha ao buscar historico do Yahoo Finance para %s", ticker, exc_info=True)
        return []

    result_list = (payload.get("chart") or {}).get("result") or []
    if not result_list:
        return []
    result = result_list[0]
    timestamps = result.get("timestamp") or []
    closes = ((result.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []

    out = []
    for ts, close in zip(timestamps, closes):
        if close is None:
            continue
        date = dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc).date()
        out.append((date, Decimal(str(close))))
    return out


def refresh_prices(symbol_currency_earliest):
    """Mantem `stock_prices` atualizado para cada (symbol, currency) em
    `symbol_currency_earliest` (iteravel de (symbol, currency, earliest_needed),
    earliest_needed = data da compra mais antiga daquele ativo). Bate em
    rede (Yahoo Finance) - so' deve ser chamado pela rotina de warm-up em
    background, nunca no caminho sincrono de uma requisicao que o usuario
    esta esperando (ver market_data_service).

    Regra de backfill por (symbol, currency):
    - sem nada salvo ainda: busca desde earliest_needed (data da compra mais
      antiga) ate hoje - ou desde EARLIEST_POSSIBLE_DATE se earliest_needed
      nao for informado;
    - earliest_needed mais antigo que o que ja esta salvo (ex: usuario
      cadastrou uma compra anterior a tudo que ja tinha): rebusca desde
      earliest_needed ate hoje;
    - ja cobre o passado necessario: busca so' o trecho do fim, do ultimo
      dia salvo ate hoje.
    Em todos os casos o preco de hoje sempre substitui o que ja existir
    (upsert) - nunca fica mais de uma linha por dia."""
    today = dt.date.today()
    changed = False

    for symbol, currency, earliest_needed in symbol_currency_earliest:
        ticker = _yahoo_ticker(symbol, currency)
        if not ticker:
            continue

        earliest_cached = (
            db.session.query(db.func.min(StockPrice.date))
            .filter(StockPrice.symbol == symbol, StockPrice.currency == currency)
            .scalar()
        )
        latest_cached = (
            db.session.query(db.func.max(StockPrice.date))
            .filter(StockPrice.symbol == symbol, StockPrice.currency == currency)
            .scalar()
        )

        needs_full_backfill = earliest_cached is None or (
            earliest_needed is not None and earliest_needed < earliest_cached
        )
        if needs_full_backfill:
            start_date = earliest_needed or EARLIEST_POSSIBLE_DATE
        else:
            start_date = latest_cached

        closes = _fetch_daily_closes(ticker, start_date, today)
        if not closes:
            continue

        # Upsert em lote (uma ida ao banco por bloco, nao uma por dia).
        for start in range(0, len(closes), 3000):
            stmt = pg_insert(StockPrice).values(
                [
                    {"symbol": symbol, "currency": currency, "date": date, "price": price, "updated_at": utcnow()}
                    for date, price in closes[start : start + 3000]
                ]
            )
            db.session.execute(
                stmt.on_conflict_do_update(
                    index_elements=["symbol", "currency", "date"],
                    set_={"price": stmt.excluded.price, "updated_at": stmt.excluded.updated_at},
                )
            )
        _refresh_monthly_closes(symbol, currency, closes[0][0].replace(day=1))
        changed = True

    if changed:
        db.session.commit()


def _refresh_monthly_closes(symbol, currency, from_month):
    """Recalcula em stock_price_monthly o fechamento (ultimo preco diario) de
    cada mes a partir de `from_month`, para um (symbol, currency)."""
    db.session.execute(
        db.text(
            """
            INSERT INTO stock_price_monthly (symbol, currency, month, price)
            SELECT DISTINCT ON (date_trunc('month', date))
                symbol, currency, date_trunc('month', date)::date, price
            FROM stock_prices
            WHERE symbol = :symbol AND currency = :currency AND date >= :from_month
            ORDER BY date_trunc('month', date), date DESC
            ON CONFLICT (symbol, currency, month) DO UPDATE SET price = EXCLUDED.price
            """
        ),
        {"symbol": symbol, "currency": currency, "from_month": from_month},
    )


def get_current_prices(symbol_currency_pairs):
    """Preco atual (ultimo preco cacheado em `stock_prices`) para um
    conjunto de (symbol, currency) (ex: [('PETR4', 'BRL')]). Nunca bate em
    rede - quem mantem o cache atualizado e' refresh_prices, chamado pela
    rotina de warm-up. Retorna {(symbol, currency): Decimal} so' para os
    pares com preco cacheado - quem chama deve manter o current_unit_price
    existente nos que faltarem."""
    pairs = set(symbol_currency_pairs)
    if not pairs:
        return {}

    # UMA query com LATERAL: para cada par, um index lookup (PK symbol,
    # currency, date) pega so' a linha mais recente. Um DISTINCT ON com IN
    # faria seq scan + sort na tabela inteira de historico diario.
    pairs = list(pairs)
    rows = db.session.execute(
        db.text(
            """
            SELECT sp.symbol, sp.currency, sp.price
            FROM unnest(CAST(:symbols AS text[]), CAST(:currencies AS text[])) AS v(symbol, currency)
            CROSS JOIN LATERAL (
                SELECT symbol, currency, price FROM stock_prices
                WHERE symbol = v.symbol AND currency = v.currency
                ORDER BY date DESC LIMIT 1
            ) sp
            """
        ),
        {"symbols": [p[0] for p in pairs], "currencies": [p[1] for p in pairs]},
    ).all()
    return {(row.symbol, row.currency): row.price for row in rows}


def get_price_on_or_before(symbol, currency, date):
    """Preco de fechamento mais recente em `stock_prices` na data exata ou
    antes dela (ex: preco do dia da compra, se cacheado, senao o ultimo
    disponivel antes). Nunca bate em rede - so' le o cache. Retorna None se
    nao houver nenhum preco cacheado ate essa data."""
    row = (
        StockPrice.query.filter(
            StockPrice.symbol == symbol,
            StockPrice.currency == currency,
            StockPrice.date <= date,
        )
        .order_by(StockPrice.date.desc())
        .first()
    )
    return row.price if row is not None else None


def get_historical_prices(symbol, currency, start_date=None):
    """Serie historica cacheada em `stock_prices` para `symbol`/`currency`,
    do mais antigo pro mais recente (opcionalmente a partir de start_date).
    Nunca bate em rede - so' le o que a rotina de warm-up ja tiver
    persistido."""
    query = StockPrice.query.filter(StockPrice.symbol == symbol, StockPrice.currency == currency)
    if start_date is not None:
        query = query.filter(StockPrice.date >= start_date)
    rows = query.order_by(StockPrice.date.asc()).all()
    return [(row.date, row.price) for row in rows]


def get_monthly_prices(symbol, currency, months, earliest_date):
    """Preco de fechamento por mes em `months` (usa o ultimo preco diario
    cacheado ate o fim de cada mes), lido de `stock_prices`. Mesma logica de
    _crypto_monthly_prices (ver investments.py) - usada pelo grafico de
    evolucao (portfolio inteiro ou ativo individual) para acoes/FII terem
    preco historico real por mes, em vez de reaproveitar o preco atual.
    Retorna {month_start: Decimal}, so' com os meses que tem preco
    cacheado disponivel ate aquele ponto."""
    result = get_monthly_prices_bulk([(symbol, currency)], months, earliest_date)
    return result.get((symbol, currency), {})


def get_monthly_prices_bulk(symbol_currency_pairs, months, earliest_date):
    """Equivalente a get_monthly_prices, mas para varios pares (symbol,
    currency) de uma so' vez, com UMA UNICA query (WHERE symbol IN (...) AND
    currency IN (...)) em vez de uma query por simbolo - usada pelo grafico
    de evolucao do portfolio inteiro, onde chamar get_monthly_prices em loop
    (uma ida ao banco por ativo/simbolo distinto) e' o gargalo dominante da
    rota com dezenas de simbolos. Retorna {(symbol, currency): {month_start:
    Decimal}}."""
    if not months or earliest_date is None or not symbol_currency_pairs:
        return {}

    # Fechamentos mensais ja pre-calculados (stock_price_monthly) - poucas
    # centenas de linhas em vez da serie diaria inteira. Core, sem ORM.
    pairs = list(symbol_currency_pairs)
    rows = db.session.execute(
        db.text(
            """
            SELECT m.symbol, m.currency, m.month, m.price
            FROM unnest(CAST(:symbols AS text[]), CAST(:currencies AS text[])) AS v(symbol, currency)
            JOIN stock_price_monthly m ON m.symbol = v.symbol AND m.currency = v.currency
            WHERE m.month >= :first_month
            ORDER BY m.symbol, m.currency, m.month
            """
        ),
        {
            "symbols": [p[0] for p in pairs],
            "currencies": [p[1] for p in pairs],
            "first_month": earliest_date.replace(day=1),
        },
    ).all()

    monthly_rows_by_key = {}
    for symbol, currency, month, price in rows:
        monthly_rows_by_key.setdefault((symbol, currency), []).append((month, price))

    result = {}
    for key in pairs:
        month_rows = monthly_rows_by_key.get(key)
        if not month_rows:
            continue
        monthly = {}
        idx = 0
        last_price = None
        for month_start in months:
            while idx < len(month_rows) and month_rows[idx][0] <= month_start:
                last_price = month_rows[idx][1]
                idx += 1
            if last_price is not None:
                monthly[month_start] = last_price
        if monthly:
            result[key] = monthly

    return result
