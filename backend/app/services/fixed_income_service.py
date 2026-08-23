import datetime as dt
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


def ipca_plus_current_value(
    invested_amount: Decimal,
    annual_rate_pct: Decimal,
    monthly_ipca: dict,
    purchase_date: dt.date,
    as_of: dt.date,
) -> Decimal:
    """Valor atual de um lote IPCA+ (ex: IPCA + 7,5% ao ano): capitaliza o
    IPCA acumulado nos meses FECHADOS entre a compra e hoje, multiplicado
    pelo fator de juros compostos da taxa fixa contratada (dias uteis/252)
    sobre o periodo inteiro (compra ate `as_of`, incluindo o mes corrente).

    Aproximacao consciente: a convencao oficial Anbima usa uma PROJECAO de
    IPCA (dado proprietario, sem API publica) para o mes corrente ainda nao
    fechado; aqui esse pedaco fica sem capitalizacao de IPCA (so a taxa fixa
    continua rendendo pro-rata) ate o IBGE publicar o indice, o que subestima
    o valor por poucos dias/semanas e se autocorrige assim que o mes fecha -
    ver conversa com o usuario sobre o tradeoff.
    `monthly_ipca` e' {primeiro_dia_do_mes: Decimal} de
    app.services.economic_index_service.get_ipca_monthly_variations, so' com
    meses ja divulgados pelo IBGE."""
    ipca_factor = Decimal("1")
    cursor = purchase_date.replace(day=1)
    while cursor < as_of.replace(day=1):
        variation = monthly_ipca.get(cursor)
        if variation is not None:
            ipca_factor *= 1 + variation / Decimal("100")
        cursor = dt.date(cursor.year + (cursor.month // 12), (cursor.month % 12) + 1, 1)

    du = business_days_between(purchase_date, as_of)
    rate_factor = (1 + annual_rate_pct / Decimal("100")) ** (Decimal(du) / Decimal(BUSINESS_DAYS_PER_YEAR)) if du > 0 else Decimal("1")

    return (invested_amount * ipca_factor * rate_factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def warm_up_holidays_cache():
    """Pre-computa o calendario de feriados (custo real do calculo pre-fixado,
    nao o loop em si) num range plausivel de anos, na subida do processo -
    evita que a PRIMEIRA request de um worker novo (deploy/restart) pague
    esse custo (~150-200ms) durante o carregamento da tela do usuario."""
    today = dt.date.today()
    _br_holidays_set(today.year - 15, today.year + 15)
