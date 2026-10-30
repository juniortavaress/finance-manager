import datetime as dt
from collections import namedtuple
from decimal import Decimal, ROUND_HALF_UP
from functools import lru_cache

import holidays

BUSINESS_DAYS_PER_YEAR = 252


@lru_cache(maxsize=16)
def _br_holidays_set(start_year: int, end_year: int) -> frozenset:
    """Feriados bancarios BR (calendario B3/Anbima, usado para contar dias
    uteis de titulos de renda fixa) para um intervalo de anos, memorizado por
    processo. lru_cache aqui evita reconstruir o calendario a cada chamada -
    sem isso, 50 ativos x poucas compras cada vira centenas de reconstrucoes
    de calendario por request.
    Usa o calendario financeiro 'BVMF' (B3), nao holidays.Brazil(): o B3
    inclui Carnaval (seg+ter) e Corpus Christi, que sao feriados bancarios
    nacionais de fato mas nao constam no calendario de feriados nacionais
    oficiais - sem eles o calculo conta dias uteis a mais e diverge do valor
    real mostrado pela corretora."""
    return frozenset(holidays.financial_holidays("BVMF", years=range(start_year, end_year + 1)).keys())


def business_days_between(start: dt.date, end: dt.date) -> int:
    """Dias uteis (seg-sex, exclui feriados bancarios BR - calendario B3) entre
    start (exclusive) e end (inclusive) - convencao Anbima usada para render
    de titulos pre-fixados.
    Conta por aritmetica (semanas completas + resto), sem iterar dia a dia -
    o que permite escalar para dezenas de ativos sem pesar no request. So o
    desconto de feriados percorre a lista (curta: ~9/ano) de feriados no
    intervalo, nunca os dias corridos entre as datas."""
    if end <= start:
        return 0

    total_days = (end - start).days
    full_weeks, remainder = divmod(total_days, 7)
    business_days = full_weeks * 5

    cursor_weekday = start.weekday()
    for i in range(1, remainder + 1):
        if (cursor_weekday + i) % 7 < 5:
            business_days += 1

    holiday_dates = _br_holidays_set(start.year, end.year)
    range_start, range_end = start + dt.timedelta(days=1), end
    for holiday_date in holiday_dates:
        if range_start <= holiday_date <= range_end and holiday_date.weekday() < 5:
            business_days -= 1

    return business_days


def pre_fixado_current_value(invested_amount: Decimal, annual_rate_pct: Decimal, purchase_date: dt.date, as_of: dt.date) -> Decimal:
    """Valor atual de um lote pre-fixado por juros compostos, convencao dias
    uteis/252 (Anbima): valor = investido * (1 + taxa_anual)^(du/252)."""
    du = business_days_between(purchase_date, as_of)
    if du <= 0:
        return invested_amount
    rate = annual_rate_pct / Decimal("100")
    factor = (1 + rate) ** (Decimal(du) / Decimal(BUSINESS_DAYS_PER_YEAR))
    return (invested_amount * factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def pos_fixado_current_value(
    invested_amount: Decimal, indexer_pct: Decimal, daily_rates: dict, purchase_date: dt.date, as_of: dt.date
) -> Decimal:
    """Valor atual de um lote pos-fixado (ex: 110% do CDI) por juros
    compostos diarios: valor = investido * prod(1 + taxa_dia% * (pct/100))
    para cada dia util com taxa publicada entre purchase_date (exclusive) e
    as_of (inclusive). `daily_rates` e' {date: Decimal} com a taxa diaria
    (percentual) do indexador, de app.services.economic_index_service -
    dias sem taxa publicada (fins de semana/feriados/atraso de divulgacao)
    simplesmente nao contribuem fator, igual a convencao do indexador em si
    (CDI/Selic so' capitalizam em dia util)."""
    if not daily_rates or indexer_pct is None:
        return invested_amount

    pct = indexer_pct / Decimal("100")
    factor = Decimal("1")
    for date, rate_pct in daily_rates.items():
        if purchase_date < date <= as_of:
            factor *= 1 + (rate_pct / Decimal("100")) * pct

    return (invested_amount * factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# --- Renda fixa "por valor" (pre-fixado e pos-fixado CDI/Selic) -------------
#
# Nesses titulos o usuario so' informa VALORES: quanto aportou e quanto
# resgatou. Um resgate e' proporcional entre os aportes: tira a mesma fracao
# (valor resgatado / valor da posicao na data) de CADA lote, levando junto a
# fracao correspondente do principal e do rendimento. Isso da' o lucro
# realizado do resgate e deixa o restante da posicao rendendo normalmente.
#
# O resto do app ainda raciocina em quantidade (posicao, custo medio,
# arquivamento, grafico), entao cada resgate tambem guarda uma quantidade
# derivada = fracao * quantidade em aberto (ver redemption_quantity) - o
# usuario nunca digita nem ve' esse numero.

# `full` (so' para resgates): o usuario resgatou a posicao inteira, mesmo que o
# valor pago pelo banco fique abaixo da estimativa do app (ex: valor liquido
# de imposto) - sem isso, o que sobrasse viraria um resgate "parcial".
FixedIncomeEvent = namedtuple(
    "FixedIncomeEvent", ["key", "kind", "date", "amount", "rate_pct", "full"], defaults=[False]
)
RedemptionResult = namedtuple(
    "RedemptionResult",
    [
        "key",
        "date",
        "amount",
        "value_before",
        "principal_before",
        "ratio",
        "principal_out",
        "yield_out",
        "full",
        "exceeds",
    ],
)

# Resgate que deixaria menos que isso na posicao (na moeda da conta) e'
# tratado como resgate total - evita sobrar poeira de arredondamento.
FULL_REDEMPTION_DUST = Decimal("1.00")
# O valor da posicao e' uma estimativa (CDI publicado, dias uteis); o saldo
# real do banco pode ficar um pouco acima. Ate' essa folga, um resgate maior
# que a estimativa vale como resgate total; acima disso e' considerado erro.
REDEMPTION_OVERSHOOT_TOLERANCE = Decimal("0.02")

_MONEY = Decimal("0.01")
_QUANTITY_PLACES = Decimal("0.00000001")  # Numeric(18, 8), asset_transactions.quantity


class _Lot:
    __slots__ = ("date", "invested", "rate_pct", "factor")

    def __init__(self, date, invested, rate_pct):
        self.date = date
        self.invested = invested
        self.rate_pct = rate_pct
        self.factor = Decimal("1")  # fracao do lote que ainda nao foi resgatada


def make_value_fn(fixed_income_type, daily_rates=None, maturity_date=None):
    """Funcao (investido, taxa, inicio, fim) -> valor do lote em `fim`.
    O titulo "congela" no vencimento, e lote sem taxa nao rende."""

    def value_fn(invested, rate_pct, start, end):
        if maturity_date is not None and end > maturity_date:
            end = maturity_date
        if rate_pct is None:
            return invested
        if fixed_income_type == "pre_fixado":
            return pre_fixado_current_value(invested, rate_pct, start, end)
        return pos_fixado_current_value(invested, rate_pct, daily_rates, start, end)

    return value_fn


def _lots_value(lots, as_of, value_fn):
    return sum((value_fn(lot.invested, lot.rate_pct, lot.date, as_of) * lot.factor for lot in lots), Decimal("0"))


def _lots_principal(lots):
    return sum((lot.invested * lot.factor for lot in lots), Decimal("0"))


def _redeem(lots, event, value_fn):
    value_before = _lots_value(lots, event.date, value_fn)
    principal_before = _lots_principal(lots)

    if value_before <= 0 or event.amount <= 0:
        zero = Decimal("0")
        return RedemptionResult(
            event.key, event.date, event.amount, value_before, principal_before, zero, zero, zero, False, True
        )

    exceeds = event.amount > value_before * (1 + REDEMPTION_OVERSHOOT_TOLERANCE)
    full = event.full or event.amount >= value_before - FULL_REDEMPTION_DUST
    ratio = Decimal("1") if full else event.amount / value_before
    principal_out = principal_before * ratio

    keep = 1 - ratio
    for lot in lots:
        lot.factor *= keep

    return RedemptionResult(
        event.key,
        event.date,
        event.amount,
        value_before,
        principal_before,
        ratio,
        principal_out,
        event.amount - principal_out,
        full,
        exceeds,
    )


def replay_events(events, value_fn, as_of=None):
    """Reproduz aportes e resgates em ordem cronologica (aportes antes de
    resgates no mesmo dia). `events` e' uma lista de FixedIncomeEvent ja
    ordenada: aporte com amount = valor investido (taxas incluidas), resgate
    com amount = valor BRUTO resgatado. Retorna (lotes restantes, lista de
    RedemptionResult - um por resgate, na ordem). Com `as_of`, ignora eventos
    posteriores."""
    lots = []
    results = []
    for event in events:
        if as_of is not None and event.date > as_of:
            break
        if event.kind == "buy":
            lots.append(_Lot(event.date, event.amount, event.rate_pct))
        else:
            results.append(_redeem(lots, event, value_fn))
    return lots, results


def position_snapshot(lots, as_of, value_fn):
    """(valor, principal) em aberto dos lotes restantes em `as_of`."""
    return (
        _lots_value(lots, as_of, value_fn).quantize(_MONEY, rounding=ROUND_HALF_UP),
        _lots_principal(lots).quantize(_MONEY, rounding=ROUND_HALF_UP),
    )


def redemption_quantity(open_quantity, result):
    """Quantidade derivada de um resgate: a mesma fracao que saiu do valor sai
    da quantidade em aberto (resgate total zera exatamente)."""
    if result.full:
        return open_quantity
    quantity = (open_quantity * result.ratio).quantize(_QUANTITY_PLACES, rounding=ROUND_HALF_UP)
    return min(max(quantity, _QUANTITY_PLACES), open_quantity)


def warm_up_holidays_cache():
    """Pre-computa o calendario de feriados (custo real do calculo pre-fixado,
    nao o loop em si) num range plausivel de anos, na subida do processo -
    evita que a PRIMEIRA request de um worker novo (deploy/restart) pague
    esse custo (~150-200ms) durante o carregamento da tela do usuario."""
    today = dt.date.today()
    _br_holidays_set(today.year - 15, today.year + 15)
