import datetime as dt
import json
import logging
import time
import urllib.request
from decimal import Decimal

logger = logging.getLogger(__name__)

BCB_SGS_BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados/ultimos/1"

# Series SGS do Banco Central: cotacao PTAX de fechamento (compra), em BRL
# por 1 unidade da moeda. Publicada em dias uteis, ~13h - nao e' tempo real,
# mas dispensa o script local que antes precisava rodar pra popular a tabela
# `quotes` (ver git history / scripts/update_quotes.py, removido).
QUOTE_SGS_CODES = {"USD": 1, "EUR": 21619, "GBP": 21623}

# Cache em memoria por processo: evita bater no BCB a cada requisicao que
# precisa converter moeda. Best-effort - se a API falhar, cai no ultimo valor
# cacheado (mesmo vencido); so' fica None se nunca buscou com sucesso.
_rates_cache = {}
CACHE_TTL_SECONDS = 600


def _fetch_bcb_latest(sgs_code):
    url = BCB_SGS_BASE_URL.format(code=sgs_code) + "?formato=json"
    req = urllib.request.Request(url, headers={"User-Agent": "finance-manager/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    entry = payload[-1]
    date = dt.datetime.strptime(entry["data"], "%d/%m/%Y").date()
    return Decimal(entry["valor"]), date


def get_brl_rates():
    """Cotacao PTAX mais recente de USD/EUR/GBP em BRL (quantos reais vale 1
    unidade da moeda), buscada do Banco Central sob demanda com cache de
    processo de CACHE_TTL_SECONDS. Retorna (rates, fetched_at) - rates e'
    {codigo: float}, fetched_at e' a data de referencia mais antiga entre as
    moedas retornadas (ou None se nenhuma cotacao estiver disponivel)."""
    now = time.time()
    rates = {}
    fetched_dates = []

    for code, sgs_code in QUOTE_SGS_CODES.items():
        cached = _rates_cache.get(code)
        if cached and now - cached[2] < CACHE_TTL_SECONDS:
            rate, ref_date, _ = cached
        else:
            try:
                rate, ref_date = _fetch_bcb_latest(sgs_code)
            except Exception:
                logger.warning("Falha ao buscar cotacao PTAX do BCB para %s", code, exc_info=True)
                if cached:
                    rate, ref_date, _ = cached
                else:
                    continue
            _rates_cache[code] = (rate, ref_date, now)

        rates[code] = float(rate)
        fetched_dates.append(ref_date)

    if not rates:
        return None, None
    fetched_at = dt.datetime.combine(min(fetched_dates), dt.time.min, tzinfo=dt.timezone.utc)
    return rates, fetched_at


def convert_to_brl(amount, currency, rates):
    """Converte `amount` de `currency` para BRL usando `rates` (dict code -> BRL
    por unidade). BRL ou moeda sem cotacao disponivel retorna o valor original."""
    if currency == "BRL" or amount is None:
        return amount
    rate = (rates or {}).get(currency)
    if not rate:
        return amount
    if isinstance(amount, Decimal):
        rate = Decimal(str(rate))
    return amount * rate
