import datetime as dt
import json
import urllib.error
import urllib.request

QUOTE_CURRENCIES = ("USD", "EUR", "GBP")
CACHE_TTL_SECONDS = 3600

_cache = {"fetched_at": None, "rates": None}


def _fetch_rates_brl_base():
    """Busca cotacao de USD/EUR/GBP em BRL na Frankfurter (API publica do BCE,
    sem chave). Retorna None em caso de falha de rede - quem chama decide o
    fallback (cache antigo ou None)."""
    symbols = ",".join(QUOTE_CURRENCIES)
    url = f"https://api.frankfurter.app/latest?from=BRL&to={symbols}"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None

    rates_from_brl = payload.get("rates") or {}
    rates = {}
    for code in QUOTE_CURRENCIES:
        rate_from_brl = rates_from_brl.get(code)
        if rate_from_brl:
            rates[code] = 1 / rate_from_brl
    return rates or None


def get_brl_rates():
    """Cotacao atual de USD/EUR/GBP em BRL (quantos reais vale 1 unidade da
    moeda), cacheada em memoria do processo por CACHE_TTL_SECONDS - evita bater
    na API externa a cada request."""
    now = dt.datetime.now(dt.timezone.utc)
    if (
        _cache["rates"] is not None
        and _cache["fetched_at"] is not None
        and (now - _cache["fetched_at"]).total_seconds() < CACHE_TTL_SECONDS
    ):
        return _cache["rates"], _cache["fetched_at"]

    fresh = _fetch_rates_brl_base()
    if fresh is not None:
        _cache["rates"] = fresh
        _cache["fetched_at"] = now
        return fresh, now

    return _cache["rates"], _cache["fetched_at"]


def convert_to_brl(amount, currency, rates):
    """Converte `amount` de `currency` para BRL usando `rates` (dict code -> BRL
    por unidade). BRL ou moeda sem cotacao disponivel retorna o valor original."""
    if currency == "BRL" or amount is None:
        return amount
    rate = (rates or {}).get(currency)
    if not rate:
        return amount
    return amount * rate
