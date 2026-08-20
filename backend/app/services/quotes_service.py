from decimal import Decimal

from app.models.quote import Quote

QUOTE_CURRENCIES = ("USD", "EUR", "GBP")


def get_brl_rates():
    """Cotacao atual de USD/EUR/GBP em BRL (quantos reais vale 1 unidade da
    moeda), lida da tabela `quotes` - atualizada por um script externo, nao
    por chamada a API neste processo."""
    rows = Quote.query.filter(Quote.currency.in_(QUOTE_CURRENCIES)).all()
    if not rows:
        return None, None
    rates = {row.currency: float(row.brl_rate) for row in rows}
    fetched_at = max(row.updated_at for row in rows)
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
