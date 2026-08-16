from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db
from app.models.base import BaseModel

TRANSACTION_TYPES = ("income", "expense")
PAYMENT_METHODS = ("debit", "credit", "pix", "other")
RECURRING_PAYMENT_METHODS = ("debit", "pix", "other", "credit")
TRANSACTION_STATUSES = ("confirmed", "scheduled")
FREQUENCIES = ("monthly", "weekly", "yearly")


class Transaction(BaseModel):
    __tablename__ = "transactions"

    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    account_id = db.Column(UUID(as_uuid=True), db.ForeignKey("accounts.id"), nullable=False, index=True)
    category_id = db.Column(UUID(as_uuid=True), db.ForeignKey("categories.id"), nullable=False, index=True)
    description = db.Column(db.Text, nullable=False)
    amount = db.Column(db.Numeric(14, 2), nullable=False)
    type = db.Column(db.Enum(*TRANSACTION_TYPES, name="transaction_type"), nullable=False)
    date = db.Column(db.Date, nullable=False, index=True)
    payment_method = db.Column(db.Enum(*PAYMENT_METHODS, name="payment_method"), nullable=False)
    status = db.Column(db.Enum(*TRANSACTION_STATUSES, name="transaction_status"), nullable=False, default="confirmed")
    credit_card_invoice_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("credit_card_invoices.id"), nullable=True, index=True
    )
    recurring_transaction_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("recurring_transactions.id"), nullable=True, index=True
    )
    installment_plan_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("installment_plans.id"), nullable=True, index=True
    )
    installment_number = db.Column(db.SmallInteger, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    is_invoice_payment = db.Column(db.Boolean, nullable=False, default=False, server_default="false")
    invoice_payment_for_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("credit_card_invoices.id"), nullable=True, index=True
    )
    is_transfer = db.Column(db.Boolean, nullable=False, default=False, server_default="false")
    transfer_pair_id = db.Column(UUID(as_uuid=True), db.ForeignKey("transactions.id"), nullable=True, index=True)

    account = db.relationship("Account", backref="transactions")
    category = db.relationship("Category", backref="transactions")
    invoice_payment_for = db.relationship(
        "CreditCardInvoice", backref="payment_transactions", foreign_keys=[invoice_payment_for_id]
    )
    transfer_pair = db.relationship("Transaction", remote_side="Transaction.id", foreign_keys=[transfer_pair_id])

    def to_dict(self):
        return {
            "id": str(self.id),
            "account_id": str(self.account_id),
            "category_id": str(self.category_id),
            "description": self.description,
            "amount": float(self.amount),
            "type": self.type,
            "date": self.date.isoformat(),
            "payment_method": self.payment_method,
            "status": self.status,
            "credit_card_invoice_id": str(self.credit_card_invoice_id) if self.credit_card_invoice_id else None,
            "recurring_transaction_id": str(self.recurring_transaction_id) if self.recurring_transaction_id else None,
            "installment_plan_id": str(self.installment_plan_id) if self.installment_plan_id else None,
            "installment_number": self.installment_number,
            "notes": self.notes,
            "is_invoice_payment": self.is_invoice_payment,
            "invoice_payment_for_id": str(self.invoice_payment_for_id) if self.invoice_payment_for_id else None,
            "is_transfer": self.is_transfer,
            "transfer_pair_id": str(self.transfer_pair_id) if self.transfer_pair_id else None,
            "category": self.category.to_dict() if self.category else None,
            "account": self.account.to_dict() if self.account else None,
        }


class RecurringTransaction(BaseModel):
    __tablename__ = "recurring_transactions"

    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    account_id = db.Column(UUID(as_uuid=True), db.ForeignKey("accounts.id"), nullable=False, index=True)
    category_id = db.Column(UUID(as_uuid=True), db.ForeignKey("categories.id"), nullable=False, index=True)
    description = db.Column(db.Text, nullable=False)
    amount = db.Column(db.Numeric(14, 2), nullable=False)
    type = db.Column(db.Enum(*TRANSACTION_TYPES, name="transaction_type_recurring"), nullable=False)
    payment_method = db.Column(
        db.Enum(*RECURRING_PAYMENT_METHODS, name="recurring_payment_method"), nullable=False, default="debit"
    )
    frequency = db.Column(db.Enum(*FREQUENCIES, name="recurring_frequency"), nullable=False, default="monthly")
    day_of_month = db.Column(db.SmallInteger, nullable=True)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=True)
    auto_confirm = db.Column(db.Boolean, nullable=False, default=True)
    next_run_date = db.Column(db.Date, nullable=True)
    active = db.Column(db.Boolean, nullable=False, default=True)
    auto_debit = db.Column(db.Boolean, nullable=False, default=True)
    current_due_date = db.Column(db.Date, nullable=True)
    paid_at = db.Column(db.Date, nullable=True)
    last_transaction_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True, index=True
    )

    account = db.relationship("Account", backref="recurring_transactions")
    category = db.relationship("Category", backref="recurring_transactions")
    generated_transactions = db.relationship(
        "Transaction", backref="recurring_transaction", foreign_keys=[Transaction.recurring_transaction_id]
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "account_id": str(self.account_id),
            "category_id": str(self.category_id),
            "description": self.description,
            "amount": float(self.amount),
            "type": self.type,
            "payment_method": self.payment_method,
            "frequency": self.frequency,
            "day_of_month": self.day_of_month,
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "auto_confirm": self.auto_confirm,
            "next_run_date": self.next_run_date.isoformat() if self.next_run_date else None,
            "active": self.active,
            "auto_debit": self.auto_debit,
            "current_due_date": self.current_due_date.isoformat() if self.current_due_date else None,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "last_transaction_id": str(self.last_transaction_id) if self.last_transaction_id else None,
            "category": self.category.to_dict() if self.category else None,
            "account": self.account.to_dict() if self.account else None,
        }
