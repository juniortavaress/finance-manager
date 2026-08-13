from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db
from app.models.base import BaseModel

CATEGORY_KINDS = ("expense", "income", "both")


class Category(BaseModel):
    __tablename__ = "categories"

    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.Text, nullable=False)
    icon = db.Column(db.Text, nullable=False, default="\U0001F4C1")
    color_hex = db.Column(db.Text, nullable=False, default="#8B9A97")
    kind = db.Column(db.Enum(*CATEGORY_KINDS, name="category_kind"), nullable=False)
    archived = db.Column(db.Boolean, nullable=False, default=False)
    budget_amount = db.Column(db.Numeric(14, 2), nullable=True)

    def to_dict(self):
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "name": self.name,
            "icon": self.icon,
            "color_hex": self.color_hex,
            "kind": self.kind,
            "archived": self.archived,
            "budget_amount": float(self.budget_amount) if self.budget_amount is not None else None,
        }
