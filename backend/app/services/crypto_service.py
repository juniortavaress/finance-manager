import datetime as dt
import json
import logging
import time
import urllib.request
from decimal import Decimal

logger = logging.getLogger(__name__)

COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3"
BINANCE_BASE_URL = "https://api.binance.com/api/v3"

# Lista fechada de criptos suportadas - e' o que aparece no select de "novo
# ativo cripto" no frontend (ver GET /investments/crypto-symbols). O id e' o
# usado pela CoinGecko; o symbol e' usado pela Binance (script de backfill).
SUPPORTED_CRYPTOCURRENCIES = {
    "BTC": {"name": "Bitcoin", "coingecko_id": "bitcoin"},
    "ETH": {"name": "Ethereum", "coingecko_id": "ethereum"},
    "SOL": {"name": "Solana", "coingecko_id": "solana"},
    "BNB": {"name": "BNB", "coingecko_id": "binancecoin"},
    "XRP": {"name": "XRP", "coingecko_id": "ripple"},
}

# Moedas de conta aceitas como vs_currency na CoinGecko (todas suportadas
# diretamente, minusculo).
COINGECKO_VS_CURRENCIES = {"BRL", "USD", "EUR", "GBP"}

# Moeda da conta -> sufixo do par na Binance (usado so pelo script de
# backfill historico, nao pelo backend - Binance bloqueia o IP do Render).
CURRENCY_TO_BINANCE_SUFFIX = {"BRL": "BRL", "USD": "USDT", "EUR": "EUR", "GBP": "GBP"}

KLINES_LIMIT = 1000
# CoinGecko free tier so responde historico dentro dos ultimos 365 dias -
# suficiente aqui pois so' e' usado pra preencher dias recentes faltantes
# (o passado profundo vem do backfill via Binance).
MAX_HISTORY_DAYS = 365

# Cache em memoria por processo: evita bater na CoinGecko a cada carregamento
# de pagina. Best-effort - current_unit_price continua editavel manualmente
# se a API falhar ou o simbolo/moeda nao forem suportados.
_price_cache = {}
CACHE_TTL_SECONDS = 300


def resolve_symbol(code):
    """Traduz `code` de um ativo cripto (ex: 'BTCBRL', 'btc') para o simbolo
    canonico (ex: 'BTC'). Retorna None se nao reconhecido."""
    if not code:
        return None
    symbol = code.strip().upper()
    for suffix in ("BRL", "USD", "USDT", "EUR", "GBP"):
        if symbol.endswith(suffix) and len(symbol) > len(suffix):
            symbol = symbol[: -len(suffix)]
            break
    return symbol if symbol in SUPPORTED_CRYPTOCURRENCIES else None


def binance_pair(code, currency):
    """Simbolo + moeda -> par Binance (ex: 'BTC' + 'USD' -> 'BTCUSDT').
    Usado apenas pelo script local de backfill historico."""
    symbol = resolve_symbol(code)
    if not symbol:
        return None
    currency_suffix = CURRENCY_TO_BINANCE_SUFFIX.get(currency)
    if not currency_suffix:
        return None
    return f"{symbol}{currency_suffix}"


def _fetch_current_price_coingecko(coingecko_id, vs_currency):
    url = f"{COINGECKO_BASE_URL}/simple/price?ids={coingecko_id}&vs_currencies={vs_currency.lower()}"
    req = urllib.request.Request(url, headers={"User-Agent": "finance-manager/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return Decimal(str(payload[coingecko_id][vs_currency.lower()]))


def get_current_prices(symbol_currency_pairs):
    """Preco atual via CoinGecko para um conjunto de (symbol, currency) (ex:
    [('BTC', 'BRL')]), com cache de processo de CACHE_TTL_SECONDS. Retorna
    {(symbol, currency): Decimal} so' para os pares que tiveram sucesso -
    quem chama deve manter o current_unit_price existente nos que faltarem."""
    pairs = set(symbol_currency_pairs)
    if not pairs:
        return {}

    now = time.time()
    result = {}
    to_fetch = []
    for pair in pairs:
        cached = _price_cache.get(pair)
        if cached and now - cached[1] < CACHE_TTL_SECONDS:
            result[pair] = cached[0]
        else:
            to_fetch.append(pair)

    for symbol, currency in to_fetch:
        info = SUPPORTED_CRYPTOCURRENCIES.get(symbol)
        if not info or currency not in COINGECKO_VS_CURRENCIES:
            continue
        try:
            price = _fetch_current_price_coingecko(info["coingecko_id"], currency)
        except Exception:
            logger.warning("Falha ao buscar preco atual da CoinGecko para %s/%s", symbol, currency, exc_info=True)
            cached = _price_cache.get((symbol, currency))
            if cached:
                result[(symbol, currency)] = cached[0]
            continue
        _price_cache[(symbol, currency)] = (price, now)
        result[(symbol, currency)] = price

    return result


def get_recent_historical_prices(symbol, currency, days):
    """Serie historica diaria (CoinGecko) dos ultimos `days` dias (max
    MAX_HISTORY_DAYS) para `symbol`/`currency`. Retorna lista de (date,
    Decimal) ordenada por data, ou [] se nao suportado ou a API falhar."""
    info = SUPPORTED_CRYPTOCURRENCIES.get(symbol)
    if not info or currency not in COINGECKO_VS_CURRENCIES:
        return []
    days = min(days, MAX_HISTORY_DAYS)
    url = (
        f"{COINGECKO_BASE_URL}/coins/{info['coingecko_id']}/market_chart"
        f"?vs_currency={currency.lower()}&days={days}&interval=daily"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "finance-manager/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception:
        logger.warning("Falha ao buscar historico da CoinGecko para %s/%s", symbol, currency, exc_info=True)
        return []

    result = []
    for timestamp_ms, price in payload.get("prices", []):
        date = dt.datetime.fromtimestamp(timestamp_ms / 1000, tz=dt.timezone.utc).date()
        result.append((date, Decimal(str(price))))
    return result


def get_binance_historical_prices(pair, start_date, end_date):
    """Serie historica diaria (Binance) para `pair` entre start_date e
    end_date (inclusive). Pagina em blocos de KLINES_LIMIT dias - usado
    apenas pelo script local de backfill (Binance bloqueia o IP do Render,
    por isso o backend em si nunca chama esta funcao). Retorna lista de
    (date, Decimal) ordenada por data, ou [] se a API falhar."""
    start_ms = int(dt.datetime.combine(start_date, dt.time.min, tzinfo=dt.timezone.utc).timestamp() * 1000)
    end_ms = int(dt.datetime.combine(end_date, dt.time.min, tzinfo=dt.timezone.utc).timestamp() * 1000)

    result = []
    cursor = start_ms
    try:
        while cursor <= end_ms:
            url = (
                f"{BINANCE_BASE_URL}/klines?symbol={pair}&interval=1d"
                f"&startTime={cursor}&endTime={end_ms}&limit={KLINES_LIMIT}"
            )
            req = urllib.request.Request(url, headers={"User-Agent": "finance-manager/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                candles = json.loads(resp.read().decode("utf-8"))
            if not candles:
                break
            for candle in candles:
                open_time_ms, close_price = candle[0], candle[4]
                date = dt.datetime.fromtimestamp(open_time_ms / 1000, tz=dt.timezone.utc).date()
                result.append((date, Decimal(close_price)))
            last_open_time = candles[-1][0]
            if last_open_time < cursor:
                break
            cursor = last_open_time + 24 * 60 * 60 * 1000
            if len(candles) < KLINES_LIMIT:
                break
    except Exception:
        return []

    return [(date, price) for date, price in result if start_date <= date <= end_date]
