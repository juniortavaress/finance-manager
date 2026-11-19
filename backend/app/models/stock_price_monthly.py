from app.extensions import db


class StockPriceMonthly(db.Model):
    """Fechamento mensal pre-calculado de `stock_prices` (ultimo preco diario
    de cada mes). O grafico de evolucao da carteira so' precisa de um preco
    por ativo por mes - ler isso aqui (algumas centenas de linhas) em vez de
    milhares de precos diarios evita carregar a serie inteira a cada
    abertura da tela. Mantida por stock_service.refresh_prices."""

    __tablename__ = "stock_price_monthly"

    symbol = db.Column(db.Text, primary_key=True)
    currency = db.Column(db.Text, primary_key=True)
    month = db.Column(db.Date, primary_key=True)
    price = db.Column(db.Numeric(18, 6), nullable=False)
