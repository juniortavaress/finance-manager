from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db
from app.models.base import BaseModel

ACCOUNT_TYPES = ("checking", "credit_card", "investment")


class Bank(BaseModel):
    __tablename__ = "banks"

    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.Text, nullable=False)
    color_hex = db.Column(db.Text, nullable=False, default="#0F5C5C")
    logo_url = db.Column(db.Text, nullable=True)
    archived = db.Column(db.Boolean, nullable=False, default=False)

    accounts = db.relationship("Account", backref="bank", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "color_hex": self.color_hex,
            "logo_url": self.logo_url,
            "archived": self.archived,
        }


class Account(BaseModel):
    __tablename__ = "accounts"

    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    bank_id = db.Column(UUID(as_uuid=True), db.ForeignKey("banks.id"), nullable=False, index=True)
    type = db.Column(db.Enum(*ACCOUNT_TYPES, name="account_type"), nullable=False)
    name = db.Column(db.Text, nullable=False)
    currency = db.Column(db.Text, nullable=False, default="BRL")
    balance = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    opening_balance = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    opening_balance_date = db.Column(db.Date, nullable=False)
    archived = db.Column(db.Boolean, nullable=False, default=False)

    credit_card = db.relationship("CreditCard", backref="account", uselist=False, cascade="all, delete-orphan")
    investment_account = db.relationship(
        "InvestmentAccount", backref="account", uselist=False, cascade="all, delete-orphan"
    )

    def to_dict(self):
        data = {
            "id": str(self.id),
            "bank_id": str(self.bank_id),
            "type": self.type,
            "name": self.name,
            "currency": self.currency,
            "balance": float(self.balance),
            "opening_balance": float(self.opening_balance),
            "opening_balance_date": self.opening_balance_date.isoformat(),
            "archived": self.archived,
        }
        if self.credit_card:
            data["credit_card"] = self.credit_card.to_dict()
        if self.investment_account:
            data["investment_account"] = self.investment_account.to_dict()
        return data


class CreditCard(BaseModel):
    __tablename__ = "credit_cards"

    account_id = db.Column(UUID(as_uuid=True), db.ForeignKey("accounts.id"), nullable=False, unique=True)
    credit_limit = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    used_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    closing_day = db.Column(db.SmallInteger, nullable=False)
    due_day = db.Column(db.SmallInteger, nullable=False)

    invoices = db.relationship("CreditCardInvoice", backref="credit_card", cascade="all, delete-orphan")
    installment_plans = db.relationship("InstallmentPlan", backref="credit_card", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "account_id": str(self.account_id),
            "credit_limit": float(self.credit_limit),
            "used_amount": float(self.used_amount),
            "closing_day": self.closing_day,
            "due_day": self.due_day,
        }


class InvestmentAccount(BaseModel):
    __tablename__ = "investment_accounts"

    account_id = db.Column(UUID(as_uuid=True), db.ForeignKey("accounts.id"), nullable=False, unique=True)
    broker_name = db.Column(db.Text, nullable=True)

    investments = db.relationship("Investment", backref="investment_account", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "account_id": str(self.account_id),
            "broker_name": self.broker_name,
        }
