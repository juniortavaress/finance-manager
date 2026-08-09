from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db
from app.models.base import BaseModel

INSTALLMENT_STATUSES = ("active", "completed")


class InstallmentPlan(BaseModel):
    __tablename__ = "installment_plans"

    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    credit_card_id = db.Column(UUID(as_uuid=True), db.ForeignKey("credit_cards.id"), nullable=False, index=True)
    category_id = db.Column(UUID(as_uuid=True), db.ForeignKey("categories.id"), nullable=False, index=True)
    description = db.Column(db.Text, nullable=False)
    total_amount = db.Column(db.Numeric(14, 2), nullable=False)
    installments_count = db.Column(db.SmallInteger, nullable=False)
    installment_amount = db.Column(db.Numeric(14, 2), nullable=False)
    first_installment_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.Enum(*INSTALLMENT_STATUSES, name="installment_status"), nullable=False, default="active")

    category = db.relationship("Category", backref="installment_plans")
    transactions = db.relationship(
        "Transaction",
        backref="installment_plan",
        foreign_keys="Transaction.installment_plan_id",
        order_by="Transaction.installment_number",
    )

    def to_dict(self, include_transactions=False):
        data = {
            "id": str(self.id),
            "credit_card_id": str(self.credit_card_id),
            "category_id": str(self.category_id),
            "description": self.description,
            "total_amount": float(self.total_amount),
            "installments_count": self.installments_count,
            "installment_amount": float(self.installment_amount),
            "first_installment_date": self.first_installment_date.isoformat(),
            "status": self.status,
            "category": self.category.to_dict() if self.category else None,
        }
        if include_transactions:
            data["transactions"] = [t.to_dict() for t in self.transactions]
        return data
