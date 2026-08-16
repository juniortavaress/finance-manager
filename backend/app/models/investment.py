from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db
from app.models.base import BaseModel

ASSET_TYPES = ("renda_fixa", "acoes", "fii", "fundos", "cripto", "outro")
ASSET_TRANSACTION_TYPES = ("buy", "sell")


class Asset(BaseModel):
    __tablename__ = "assets"

    investment_account_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("investment_accounts.id"), nullable=False, index=True
    )
    type = db.Column(db.Enum(*ASSET_TYPES, name="asset_type"), nullable=False)
    code = db.Column(db.Text, nullable=True)
    name = db.Column(db.Text, nullable=False)
    current_unit_price = db.Column(db.Numeric(14, 6), nullable=True)

    asset_transactions = db.relationship(
        "AssetTransaction", backref="asset", cascade="all, delete-orphan", order_by="AssetTransaction.date"
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "investment_account_id": str(self.investment_account_id),
            "type": self.type,
            "code": self.code,
            "name": self.name,
            "current_unit_price": float(self.current_unit_price) if self.current_unit_price is not None else None,
        }


class AssetTransaction(BaseModel):
    __tablename__ = "asset_transactions"

    asset_id = db.Column(UUID(as_uuid=True), db.ForeignKey("assets.id"), nullable=False, index=True)
    transaction_id = db.Column(UUID(as_uuid=True), db.ForeignKey("transactions.id"), nullable=True, index=True)
    type = db.Column(db.Enum(*ASSET_TRANSACTION_TYPES, name="asset_transaction_type"), nullable=False)
    date = db.Column(db.Date, nullable=False, index=True)
    quantity = db.Column(db.Numeric(18, 8), nullable=False)
    unit_price = db.Column(db.Numeric(14, 6), nullable=False)
    total_amount = db.Column(db.Numeric(14, 2), nullable=False)
    fee_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0, server_default="0")
    note_id = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            "id": str(self.id),
            "asset_id": str(self.asset_id),
            "transaction_id": str(self.transaction_id) if self.transaction_id else None,
            "type": self.type,
            "date": self.date.isoformat(),
            "quantity": float(self.quantity),
            "unit_price": float(self.unit_price),
            "total_amount": float(self.total_amount),
            "fee_amount": float(self.fee_amount),
            "note_id": self.note_id,
        }
