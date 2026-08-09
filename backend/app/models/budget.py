from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db
from app.models.base import BaseModel


class Budget(BaseModel):
    __tablename__ = "budgets"
    __table_args__ = (db.UniqueConstraint("user_id", "category_id", "month", name="uq_budget_user_cat_month"),)

    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    category_id = db.Column(UUID(as_uuid=True), db.ForeignKey("categories.id"), nullable=False, index=True)
    month = db.Column(db.Date, nullable=False)
    limit_amount = db.Column(db.Numeric(14, 2), nullable=False)

    category = db.relationship("Category", backref="budgets")

    def to_dict(self):
        return {
            "id": str(self.id),
            "category_id": str(self.category_id),
            "month": self.month.isoformat(),
            "limit_amount": float(self.limit_amount),
            "category": self.category.to_dict() if self.category else None,
        }
