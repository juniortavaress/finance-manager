from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db
from app.models.base import BaseModel

INVOICE_STATUSES = ("open", "closed", "paid")


class CreditCardInvoice(BaseModel):
    __tablename__ = "credit_card_invoices"
    __table_args__ = (db.UniqueConstraint("credit_card_id", "reference_month", name="uq_invoice_card_month"),)

    credit_card_id = db.Column(UUID(as_uuid=True), db.ForeignKey("credit_cards.id"), nullable=False, index=True)
    reference_month = db.Column(db.Date, nullable=False)
    closing_date = db.Column(db.Date, nullable=False)
    due_date = db.Column(db.Date, nullable=False)
    total_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    paid_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    status = db.Column(db.Enum(*INVOICE_STATUSES, name="invoice_status"), nullable=False, default="open")
    paid_at = db.Column(db.DateTime(timezone=True), nullable=True)

    transactions = db.relationship(
        "Transaction", backref="credit_card_invoice", foreign_keys="Transaction.credit_card_invoice_id"
    )

    def to_dict(self):
        outstanding = self.total_amount - self.paid_amount
        if outstanding < 0:
            outstanding = 0
        return {
            "id": str(self.id),
            "credit_card_id": str(self.credit_card_id),
            "reference_month": self.reference_month.isoformat(),
            "closing_date": self.closing_date.isoformat(),
            "due_date": self.due_date.isoformat(),
            "total_amount": float(self.total_amount),
            "paid_amount": float(self.paid_amount),
            "outstanding_amount": float(outstanding),
            "status": self.status,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
        }
