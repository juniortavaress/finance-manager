import datetime as dt
import json
import logging
import urllib.request
from decimal import Decimal

from app.extensions import db
from app.models import EconomicIndexRate

logger = logging.getLogger(__name__)

BCB_SGS_BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados"

# Series SGS do Banco Central: taxa diaria em percentual (ex: 0.052531 =
# 0,052531% no dia). CDI e Selic tem historico diario publicado com poucos
# dias uteis de defasagem.
INDEXER_SGS_CODES = {"CDI": 12, "SELIC": 11}


def _normalize_indexer(indexer):
    if not indexer:
        return None
    key = indexer.strip().upper()
    return key if key in INDEXER_SGS_CODES else None


def _fetch_bcb_series(sgs_code, start_date, end_date):
    """Busca a serie diaria bruta do BCB entre start_date e end_date
    (inclusive). Retorna lista de (date, Decimal) ordenada por data, ou []
    se a API falhar - quem chama cai de volta no que ja estiver cacheado."""
    url = (
        f"{BCB_SGS_BASE_URL.format(code=sgs_code)}?formato=json"
        f"&dataInicial={start_date.strftime('%d/%m/%Y')}&dataFinal={end_date.strftime('%d/%m/%Y')}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "finance-manager/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception:
        logger.warning("Falha ao buscar serie SGS %s do BCB", sgs_code, exc_info=True)
        return []

    result = []
    for entry in payload:
        try:
            date = dt.datetime.strptime(entry["data"], "%d/%m/%Y").date()
            rate = Decimal(entry["valor"])
        except (KeyError, ValueError):
            continue
        result.append((date, rate))
    return result


def _ensure_rates_cached(indexer, start_date, end_date):
    """Garante que economic_index_rates tem a serie de `indexer` cobrindo
    [start_date, end_date], buscando do BCB so' os dias que faltam (por
    trecho contiguo faltante, nao dia a dia) e persistindo via upsert."""
    sgs_code = INDEXER_SGS_CODES[indexer]
    existing_dates = {
        row.date
        for row in EconomicIndexRate.query.filter(
            EconomicIndexRate.indexer == indexer,
            EconomicIndexRate.date >= start_date,
            EconomicIndexRate.date <= end_date,
        ).all()
    }

    missing_ranges = []
    cursor = start_date
    while cursor <= end_date:
        if cursor in existing_dates or cursor.weekday() >= 5:
            cursor += dt.timedelta(days=1)
            continue
        range_start = cursor
        while cursor <= end_date and (cursor.weekday() >= 5 or cursor not in existing_dates):
            cursor += dt.timedelta(days=1)
        missing_ranges.append((range_start, cursor - dt.timedelta(days=1)))

    for range_start, range_end in missing_ranges:
        fetched = _fetch_bcb_series(sgs_code, range_start, range_end)
        for date, rate in fetched:
            db.session.merge(EconomicIndexRate(indexer=indexer, date=date, rate_pct=rate))
        if fetched:
            db.session.commit()


def get_daily_rates(indexer, start_date, end_date):
    """Serie diaria de taxa (percentual ao dia, Decimal) de `indexer` (CDI ou
    Selic) entre start_date (exclusive) e end_date (inclusive), buscando do
    BCB o que faltar em cache. Retorna {date: Decimal} apenas com os dias que
    tem taxa publicada (dias uteis; findes de semana/feriados nao tem
    publicacao propria no SGS)."""
    indexer = _normalize_indexer(indexer)
    if not indexer or end_date <= start_date:
        return {}

    _ensure_rates_cached(indexer, start_date + dt.timedelta(days=1), end_date)

    rows = EconomicIndexRate.query.filter(
        EconomicIndexRate.indexer == indexer,
        EconomicIndexRate.date > start_date,
        EconomicIndexRate.date <= end_date,
    ).all()
    return {row.date: row.rate_pct for row in rows}


