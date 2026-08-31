from app.extensions import db
from app.models.base import utcnow


class FxRate(db.Model):
    """Ultima cotacao PTAX (BRL por 1 unidade da moeda) de cada moeda
    estrangeira suportada, buscada da API SGS do Banco Central e cacheada
    aqui (substitui o cache em memoria de processo de quotes_service, que se
    perdia a cada reinicio do servidor)."""

    __tablename__ = "fx_rates"

    currency = db.Column(db.Text, primary_key=True)
    rate = db.Column(db.Numeric(18, 8), nullable=False)
    ref_date = db.Column(db.Date, nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def to_dict(self):
        return {
            "currency": self.currency,
            "rate": float(self.rate),
            "ref_date": self.ref_date.isoformat(),
        }
