import datetime as dt
import json
import logging
import urllib.request
from decimal import Decimal

from app.extensions import db
from app.models import FxRate

logger = logging.getLogger(__name__)

BCB_SGS_BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados/ultimos/1"

# Series SGS do Banco Central: cotacao PTAX de fechamento (compra), em BRL
# por 1 unidade da moeda. Publicada em dias uteis, ~13h - nao e' tempo real,
# mas dispensa o script local que antes precisava rodar pra popular a tabela
# `quotes` (ver git history / scripts/update_quotes.py, removido).
QUOTE_SGS_CODES = {"USD": 1, "EUR": 21619, "GBP": 21623}


def _fetch_bcb_latest(sgs_code):
    url = BCB_SGS_BASE_URL.format(code=sgs_code) + "?formato=json"
    req = urllib.request.Request(url, headers={"User-Agent": "finance-manager/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    entry = payload[-1]
    date = dt.datetime.strptime(entry["data"], "%d/%m/%Y").date()
    return Decimal(entry["valor"]), date


def refresh_brl_rates():
    """Busca do Banco Central a cotacao PTAX mais recente de USD/EUR/GBP e
    persiste em `fx_rates` (upsert). Bate em rede - so' deve ser chamado pela
    rotina de warm-up em background, nunca no caminho sincrono de uma
    requisicao que o usuario esta esperando (ver market_data_service)."""
    changed = False
    for code, sgs_code in QUOTE_SGS_CODES.items():
        try:
            rate, ref_date = _fetch_bcb_latest(sgs_code)
        except Exception:
            logger.warning("Falha ao buscar cotacao PTAX do BCB para %s", code, exc_info=True)
            continue
        row = FxRate.query.get(code)
        if row is None:
            db.session.add(FxRate(currency=code, rate=rate, ref_date=ref_date))
        else:
            row.rate = rate
            row.ref_date = ref_date
        changed = True
    if changed:
        db.session.commit()


def get_brl_rates():
    """Ultima cotacao PTAX de USD/EUR/GBP em BRL (quantos reais vale 1
    unidade da moeda), lida do cache em `fx_rates` (nunca bate em rede aqui -
    quem mantem o cache atualizado e' refresh_brl_rates, chamado pela rotina
    de warm-up). Retorna (rates, fetched_at) - rates e' {codigo: float},
    fetched_at e' a data de referencia mais antiga entre as moedas
    retornadas (ou None se o cache ainda estiver vazio)."""
    rows = FxRate.query.all()
    if not rows:
        return None, None
    rates = {row.currency: float(row.rate) for row in rows}
    fetched_at = dt.datetime.combine(min(row.ref_date for row in rows), dt.time.min, tzinfo=dt.timezone.utc)
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
