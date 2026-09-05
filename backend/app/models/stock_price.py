from app.extensions import db
from app.models.base import utcnow


class StockPrice(db.Model):
    """Cache do preco atual de acoes/FIIs, atualizado pela rotina de warm-up
    em background (ver market_data_service). symbol e' o ticker (ex:
    'PETR4', 'HGLG11', 'AAPL'), currency indica a origem/mercado (BRL via
    brapi, USD via Finnhub)."""

    __tablename__ = "stock_prices"

    symbol = db.Column(db.Text, primary_key=True)
    currency = db.Column(db.Text, primary_key=True)
    date = db.Column(db.Date, primary_key=True)
    price = db.Column(db.Numeric(18, 6), nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def to_dict(self):
        return {
            "symbol": self.symbol,
            "currency": self.currency,
            "date": self.date.isoformat(),
            "price": float(self.price),
        }
