from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db
from app.models.base import BaseModel

INVESTMENT_TYPES = ("renda_fixa", "acoes", "fundos", "cripto", "outro")


class Investment(BaseModel):
    __tablename__ = "investments"

    investment_account_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("investment_accounts.id"), nullable=False, index=True
    )
    type = db.Column(db.Enum(*INVESTMENT_TYPES, name="investment_type"), nullable=False)
    name = db.Column(db.Text, nullable=False)
    invested_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    current_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)

    snapshots = db.relationship("InvestmentSnapshot", backref="investment", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "investment_account_id": str(self.investment_account_id),
            "type": self.type,
            "name": self.name,
            "invested_amount": float(self.invested_amount),
            "current_amount": float(self.current_amount),
        }


class InvestmentSnapshot(BaseModel):
    __tablename__ = "investment_snapshots"

    investment_id = db.Column(UUID(as_uuid=True), db.ForeignKey("investments.id"), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False)
    value = db.Column(db.Numeric(14, 2), nullable=False)

    def to_dict(self):
        return {
            "id": str(self.id),
            "investment_id": str(self.investment_id),
            "date": self.date.isoformat(),
            "value": float(self.value),
        }
