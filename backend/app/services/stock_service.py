import datetime as dt
import json
import logging
import urllib.request
from decimal import Decimal

from app.extensions import db
from app.models import StockPrice
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

        for date, price in closes:
            row = StockPrice.query.get((symbol, currency, date))
            if row is None:
                db.session.add(StockPrice(symbol=symbol, currency=currency, date=date, price=price))
            else:
                row.price = price
            changed = True

    if changed:
        db.session.commit()


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

    result = {}
    for symbol, currency in pairs:
        row = (
            StockPrice.query.filter(
                StockPrice.symbol == symbol,
                StockPrice.currency == currency,
            )
            .order_by(StockPrice.date.desc())
            .first()
        )
        if row is not None:
            result[(symbol, currency)] = row.price

    return result


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
    if not months or earliest_date is None:
        return {}

    rows = (
        StockPrice.query.filter(
            StockPrice.symbol == symbol,
            StockPrice.currency == currency,
            StockPrice.date >= earliest_date,
        )
        .order_by(StockPrice.date)
        .all()
    )
    if not rows:
        return {}
    daily_prices = [(row.date, row.price) for row in rows]

    monthly = {}
    price_idx = 0
    last_price = None
    for month_start in months:
        month_end = add_months(month_start, 1)
        while price_idx < len(daily_prices) and daily_prices[price_idx][0] < month_end:
            last_price = daily_prices[price_idx][1]
            price_idx += 1
        if last_price is not None:
            monthly[month_start] = last_price

    return monthly
