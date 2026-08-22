from app.extensions import db
from app.models.base import utcnow


class CryptoPrice(db.Model):
    """Historico diario de preco de fechamento de cripto, populado pelo
    script scripts/update_crypto_history.py (rodado localmente, busca na
    Binance sem o limite de 365 dias do plano gratuito da CoinGecko - a API
    que o backend usa direto, pois a Binance bloqueia o IP do Render)."""

    __tablename__ = "crypto_prices"

    symbol = db.Column(db.Text, primary_key=True)
    currency = db.Column(db.Text, primary_key=True)
    date = db.Column(db.Date, primary_key=True)
    price = db.Column(db.Numeric(18, 8), nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def to_dict(self):
        return {
            "symbol": self.symbol,
            "currency": self.currency,
            "date": self.date.isoformat(),
            "price": float(self.price),
        }
