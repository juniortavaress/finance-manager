import datetime as dt
import json
import time
import urllib.request
from decimal import Decimal

BINANCE_BASE_URL = "https://api.binance.com/api/v3"

# Lista fechada de criptos suportadas - e' o que aparece no select de "novo
# ativo cripto" no frontend (ver GET /investments/crypto-symbols).
SUPPORTED_CRYPTOCURRENCIES = {
    "BTC": "Bitcoin",
    "ETH": "Ethereum",
    "SOL": "Solana",
    "BNB": "BNB",
    "XRP": "XRP",
}

# Moeda da conta -> sufixo do par na Binance. USD usa USDT (par mais liquido
# da Binance para dolar) em vez de USD puro.
CURRENCY_TO_BINANCE_SUFFIX = {
    "BRL": "BRL",
    "USD": "USDT",
    "EUR": "EUR",
    "GBP": "GBP",
}

KLINES_LIMIT = 1000

# Cache em memoria por processo: evita bater na Binance a cada carregamento
# de pagina. Best-effort - current_unit_price continua editavel manualmente
# se a API falhar ou o simbolo/moeda nao forem suportados.
_price_cache = {}
CACHE_TTL_SECONDS = 300


def binance_pair(code, currency):
    """Traduz `code` do ativo (ex: 'BTC', 'btc', 'BTCBRL') + moeda da conta
    para o par usado na Binance (ex: 'BTCBRL'). Retorna None se o simbolo ou
    a moeda nao forem suportados."""
    if not code:
        return None
    symbol = code.strip().upper()
    for suffix in ("BRL", "USD", "USDT", "EUR", "GBP"):
        if symbol.endswith(suffix) and len(symbol) > len(suffix):
            symbol = symbol[: -len(suffix)]
            break
    if symbol not in SUPPORTED_CRYPTOCURRENCIES:
        return None
    currency_suffix = CURRENCY_TO_BINANCE_SUFFIX.get(currency)
    if not currency_suffix:
        return None
    return f"{symbol}{currency_suffix}"


def _fetch_current_price(pair):
    url = f"{BINANCE_BASE_URL}/ticker/price?symbol={pair}"
    req = urllib.request.Request(url, headers={"User-Agent": "finance-manager/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return Decimal(payload["price"])


def get_current_prices(pairs):
    """Preco atual (na moeda do proprio par, ex: BTCBRL -> BRL) para um
    conjunto de pares Binance, com cache de processo de CACHE_TTL_SECONDS.
    Retorna {} (sem levantar) para pares que falharem - quem chama deve
    manter o current_unit_price existente nesse caso."""
    pairs = set(pairs)
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

    for pair in to_fetch:
        try:
            price = _fetch_current_price(pair)
        except Exception:
            cached = _price_cache.get(pair)
            if cached:
                result[pair] = cached[0]
            continue
        _price_cache[pair] = (price, now)
        result[pair] = price

    return result


def get_historical_prices(pair, start_date, end_date):
    """Serie historica diaria de preco (na moeda do proprio par) para `pair`
    entre start_date e end_date (inclusive). Pagina em blocos de KLINES_LIMIT
    dias - a Binance nao limita o passado como a CoinGecko free tier limita.
    Retorna lista de (date, Decimal) ordenada por data, ou [] se a API falhar."""
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
