from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db
from app.models.base import BaseModel


class BillReminder(BaseModel):
    __tablename__ = "bill_reminders"

    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    account_id = db.Column(UUID(as_uuid=True), db.ForeignKey("accounts.id"), nullable=False, index=True)
    category_id = db.Column(UUID(as_uuid=True), db.ForeignKey("categories.id"), nullable=False, index=True)
    description = db.Column(db.Text, nullable=False)
    amount = db.Column(db.Numeric(14, 2), nullable=False)
    day_of_month = db.Column(db.SmallInteger, nullable=False)
    active = db.Column(db.Boolean, nullable=False, default=True)
    current_due_date = db.Column(db.Date, nullable=False)
    paid_at = db.Column(db.Date, nullable=True)
    last_transaction_id = db.Column(UUID(as_uuid=True), db.ForeignKey("transactions.id"), nullable=True)

    account = db.relationship("Account", backref="bill_reminders")
    category = db.relationship("Category", backref="bill_reminders")

    def to_dict(self):
        return {
            "id": str(self.id),
            "account_id": str(self.account_id),
            "category_id": str(self.category_id),
            "description": self.description,
            "amount": float(self.amount),
            "day_of_month": self.day_of_month,
            "active": self.active,
            "current_due_date": self.current_due_date.isoformat(),
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "last_transaction_id": str(self.last_transaction_id) if self.last_transaction_id else None,
            "category": self.category.to_dict() if self.category else None,
            "account": self.account.to_dict() if self.account else None,
        }
