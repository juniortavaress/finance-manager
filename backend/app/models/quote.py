from app.extensions import db
from app.models.base import utcnow


class Quote(db.Model):
    __tablename__ = "quotes"

    currency = db.Column(db.Text, primary_key=True)
    brl_rate = db.Column(db.Numeric(14, 6), nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def to_dict(self):
        return {
            "currency": self.currency,
            "brl_rate": float(self.brl_rate),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
