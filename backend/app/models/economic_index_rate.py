from app.extensions import db
from app.models.base import utcnow


class EconomicIndexRate(db.Model):
    """Historico diario de taxa de indexadores economicos (CDI, Selic),
    buscado da API SGS do Banco Central (series 12 e 11) e cacheado aqui
    para nao bater na API a cada calculo de renda fixa pos-fixada. `rate_pct`
    e' a taxa DIARIA em percentual (ex: 0.052531 = 0,052531% no dia), como
    publicada pelo BCB."""

    __tablename__ = "economic_index_rates"

    indexer = db.Column(db.Text, primary_key=True)
    date = db.Column(db.Date, primary_key=True)
    rate_pct = db.Column(db.Numeric(12, 8), nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def to_dict(self):
        return {
            "indexer": self.indexer,
            "date": self.date.isoformat(),
            "rate_pct": float(self.rate_pct),
        }
