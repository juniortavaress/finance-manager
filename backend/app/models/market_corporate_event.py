from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db
from app.models.base import BaseModel

MARKET_CORPORATE_EVENT_TYPES = ("split", "merger")


class MarketCorporateEvent(BaseModel):
    """Evento societario de mercado (desdobramento/grupamento ou
    incorporacao) registrado por CODIGO de ativo, nao por Asset de um
    usuario especifico - um unico registro aqui vale para todo usuario que
    tiver esse codigo na carteira, aplicado em tempo de calculo (nunca muta
    AssetTransaction). Ver _resolve_market_events_for_assets /
    _effective_transactions em routes/investments.py."""

    __tablename__ = "market_corporate_events"

    type = db.Column(db.Enum(*MARKET_CORPORATE_EVENT_TYPES, name="market_corporate_event_type"), nullable=False)
    target_code = db.Column(db.Text, nullable=False, index=True)
    source_code = db.Column(db.Text, nullable=True, index=True)
    date = db.Column(db.Date, nullable=False, index=True)
    ratio = db.Column(db.Numeric(18, 8), nullable=False)
    note = db.Column(db.Text, nullable=True)
    created_by_user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False)

    def to_dict(self):
        return {
            "id": str(self.id),
            "type": self.type,
            "target_code": self.target_code,
            "source_code": self.source_code,
            "date": self.date.isoformat(),
            "ratio": float(self.ratio),
            "note": self.note,
        }
