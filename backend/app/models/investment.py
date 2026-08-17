from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db
from app.models.base import BaseModel

ASSET_TYPES = ("renda_fixa", "acoes", "fii", "fundos", "cripto", "outro")
FIXED_INCOME_TYPES = ("pos_fixado", "pre_fixado", "ipca")
ASSET_TRANSACTION_TYPES = ("buy", "sell")
DIVIDEND_KINDS = ("dividendo", "rendimento", "jcp", "cupom", "bonificacao", "outro")
DIVIDEND_CALC_MODES = ("per_share", "fixed")
DIVIDEND_FREQUENCIES = ("monthly", "quarterly", "semiannual", "yearly")


class Asset(BaseModel):
    __tablename__ = "assets"

    investment_account_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("investment_accounts.id"), nullable=False, index=True
    )
    type = db.Column(db.Enum(*ASSET_TYPES, name="asset_type"), nullable=False)
    code = db.Column(db.Text, nullable=True)
    name = db.Column(db.Text, nullable=False)
    current_unit_price = db.Column(db.Numeric(14, 6), nullable=True)

    fixed_income_type = db.Column(db.Enum(*FIXED_INCOME_TYPES, name="fixed_income_type"), nullable=True)
    fixed_income_indexer = db.Column(db.Text, nullable=True)
    fixed_income_rate_pct = db.Column(db.Numeric(7, 3), nullable=True)
    maturity_date = db.Column(db.Date, nullable=True)

    asset_transactions = db.relationship(
        "AssetTransaction", backref="asset", cascade="all, delete-orphan", order_by="AssetTransaction.date"
    )
    dividends = db.relationship("Dividend", backref="asset", cascade="all, delete-orphan", order_by="Dividend.date")
    dividend_schedules = db.relationship(
        "DividendSchedule", backref="asset", cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "investment_account_id": str(self.investment_account_id),
            "type": self.type,
            "code": self.code,
            "name": self.name,
            "current_unit_price": float(self.current_unit_price) if self.current_unit_price is not None else None,
            "fixed_income_type": self.fixed_income_type,
            "fixed_income_indexer": self.fixed_income_indexer,
            "fixed_income_rate_pct": float(self.fixed_income_rate_pct) if self.fixed_income_rate_pct is not None else None,
            "maturity_date": self.maturity_date.isoformat() if self.maturity_date else None,
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


class DividendSchedule(BaseModel):
    """Provento recorrente cadastrado para um ativo. Materializa Dividend
    automaticamente na data prevista, usando a posicao do ativo no momento."""

    __tablename__ = "dividend_schedules"

    asset_id = db.Column(UUID(as_uuid=True), db.ForeignKey("assets.id"), nullable=False, index=True)
    kind = db.Column(db.Enum(*DIVIDEND_KINDS, name="dividend_kind"), nullable=False, default="dividendo")
    calc_mode = db.Column(db.Enum(*DIVIDEND_CALC_MODES, name="dividend_calc_mode"), nullable=False)
    amount_per_share = db.Column(db.Numeric(14, 6), nullable=True)
    fixed_amount = db.Column(db.Numeric(14, 2), nullable=True)
    frequency = db.Column(db.Enum(*DIVIDEND_FREQUENCIES, name="dividend_frequency"), nullable=False, default="monthly")
    day_of_month = db.Column(db.SmallInteger, nullable=False)
    next_due_date = db.Column(db.Date, nullable=False)
    active = db.Column(db.Boolean, nullable=False, default=True)

    dividends = db.relationship("Dividend", backref="schedule")

    def to_dict(self):
        return {
            "id": str(self.id),
            "asset_id": str(self.asset_id),
            "kind": self.kind,
            "calc_mode": self.calc_mode,
            "amount_per_share": float(self.amount_per_share) if self.amount_per_share is not None else None,
            "fixed_amount": float(self.fixed_amount) if self.fixed_amount is not None else None,
            "frequency": self.frequency,
            "day_of_month": self.day_of_month,
            "next_due_date": self.next_due_date.isoformat(),
            "active": self.active,
        }


class Dividend(BaseModel):
    """Historico real de proventos recebidos - tanto materializados de um
    DividendSchedule quanto lancados avulsos (schedule_id nulo)."""

    __tablename__ = "dividends"

    asset_id = db.Column(UUID(as_uuid=True), db.ForeignKey("assets.id"), nullable=False, index=True)
    schedule_id = db.Column(UUID(as_uuid=True), db.ForeignKey("dividend_schedules.id"), nullable=True, index=True)
    transaction_id = db.Column(UUID(as_uuid=True), db.ForeignKey("transactions.id"), nullable=True, index=True)
    kind = db.Column(db.Enum(*DIVIDEND_KINDS, name="dividend_kind_history"), nullable=False, default="dividendo")
    date = db.Column(db.Date, nullable=False, index=True)
    quantity_snapshot = db.Column(db.Numeric(18, 8), nullable=True)
    amount = db.Column(db.Numeric(14, 2), nullable=False)

    def to_dict(self):
        return {
            "id": str(self.id),
            "asset_id": str(self.asset_id),
            "schedule_id": str(self.schedule_id) if self.schedule_id else None,
            "transaction_id": str(self.transaction_id) if self.transaction_id else None,
            "kind": self.kind,
            "date": self.date.isoformat(),
            "quantity_snapshot": float(self.quantity_snapshot) if self.quantity_snapshot is not None else None,
            "amount": float(self.amount),
        }
