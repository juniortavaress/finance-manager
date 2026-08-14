from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db
from app.models.base import BaseModel

FRIENDSHIP_STATUSES = ("pending", "accepted", "rejected")
SPLIT_MODES = ("equal", "value", "percentage")


class Friendship(BaseModel):
    __tablename__ = "friendships"

    requester_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    addressee_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    status = db.Column(db.Enum(*FRIENDSHIP_STATUSES, name="friendship_status"), nullable=False, default="pending")
    responded_at = db.Column(db.DateTime(timezone=True), nullable=True)

    requester = db.relationship("User", foreign_keys=[requester_id])
    addressee = db.relationship("User", foreign_keys=[addressee_id])

    __table_args__ = (
        db.CheckConstraint("requester_id <> addressee_id", name="ck_friendship_not_self"),
        db.UniqueConstraint("requester_id", "addressee_id", name="uq_friendship_pair"),
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "requester_id": str(self.requester_id),
            "addressee_id": str(self.addressee_id),
            "status": self.status,
            "responded_at": self.responded_at.isoformat() if self.responded_at else None,
            "created_at": self.created_at.isoformat(),
        }


class Group(BaseModel):
    __tablename__ = "groups"

    name = db.Column(db.Text, nullable=False)
    created_by = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    archived = db.Column(db.Boolean, nullable=False, default=False)
    simplify_debts = db.Column(db.Boolean, nullable=False, default=False, server_default="false")
    icon = db.Column(db.Text, nullable=False, default="\U0001F465", server_default="\U0001F465")
    color_hex = db.Column(db.Text, nullable=False, default="#0F5C5C", server_default="#0F5C5C")

    members = db.relationship("GroupMember", backref="group", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "created_by": str(self.created_by),
            "archived": self.archived,
            "simplify_debts": self.simplify_debts,
            "icon": self.icon,
            "color_hex": self.color_hex,
        }


class GroupMember(BaseModel):
    __tablename__ = "group_members"

    group_id = db.Column(UUID(as_uuid=True), db.ForeignKey("groups.id"), nullable=False, index=True)
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)

    user = db.relationship("User")

    __table_args__ = (db.UniqueConstraint("group_id", "user_id", name="uq_group_member"),)

    def to_dict(self):
        return {
            "id": str(self.id),
            "group_id": str(self.group_id),
            "user_id": str(self.user_id),
            "user": self.user.to_dict() if self.user else None,
        }


class SharedExpense(BaseModel):
    __tablename__ = "shared_expenses"

    group_id = db.Column(UUID(as_uuid=True), db.ForeignKey("groups.id"), nullable=True, index=True)
    friend_user_low_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=True, index=True)
    friend_user_high_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=True, index=True)

    description = db.Column(db.Text, nullable=False)
    total_amount = db.Column(db.Numeric(14, 2), nullable=False)
    date = db.Column(db.Date, nullable=False, index=True)
    paid_by_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    split_mode = db.Column(db.Enum(*SPLIT_MODES, name="split_mode"), nullable=False, default="equal")
    created_by = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False)
    payer_account_id = db.Column(UUID(as_uuid=True), db.ForeignKey("accounts.id"), nullable=True)
    transaction_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    notes = db.Column(db.Text, nullable=True)

    participants = db.relationship("ExpenseParticipant", backref="shared_expense", cascade="all, delete-orphan")
    paid_by = db.relationship("User", foreign_keys=[paid_by_id])
    group = db.relationship("Group")

    __table_args__ = (
        db.CheckConstraint(
            "(group_id IS NOT NULL AND friend_user_low_id IS NULL AND friend_user_high_id IS NULL) OR "
            "(group_id IS NULL AND friend_user_low_id IS NOT NULL AND friend_user_high_id IS NOT NULL)",
            name="ck_shared_expense_scope_xor",
        ),
        db.CheckConstraint("total_amount > 0", name="ck_shared_expense_amount_positive"),
    )

    @property
    def payer_link_status(self):
        return "recorded" if self.transaction_id else "pending"

    def to_dict(self):
        return {
            "id": str(self.id),
            "group_id": str(self.group_id) if self.group_id else None,
            "group_name": self.group.name if self.group else None,
            "group_icon": self.group.icon if self.group else None,
            "group_color_hex": self.group.color_hex if self.group else None,
            "friend_user_low_id": str(self.friend_user_low_id) if self.friend_user_low_id else None,
            "friend_user_high_id": str(self.friend_user_high_id) if self.friend_user_high_id else None,
            "description": self.description,
            "total_amount": float(self.total_amount),
            "date": self.date.isoformat(),
            "created_at": self.created_at.isoformat(),
            "paid_by_id": str(self.paid_by_id),
            "paid_by": self.paid_by.to_dict() if self.paid_by else None,
            "split_mode": self.split_mode,
            "created_by": str(self.created_by),
            "payer_account_id": str(self.payer_account_id) if self.payer_account_id else None,
            "transaction_id": str(self.transaction_id) if self.transaction_id else None,
            "payer_link_status": self.payer_link_status,
            "notes": self.notes,
            "participants": [p.to_dict() for p in self.participants],
        }


class ExpenseParticipant(BaseModel):
    __tablename__ = "expense_participants"

    shared_expense_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("shared_expenses.id"), nullable=False, index=True
    )
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    share_amount = db.Column(db.Numeric(14, 2), nullable=False)

    user = db.relationship("User")

    __table_args__ = (
        db.UniqueConstraint("shared_expense_id", "user_id", name="uq_expense_participant"),
        db.CheckConstraint("share_amount > 0", name="ck_participant_share_positive"),
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "user": self.user.to_dict() if self.user else None,
            "share_amount": float(self.share_amount),
        }


class Settlement(BaseModel):
    __tablename__ = "settlements"

    group_id = db.Column(UUID(as_uuid=True), db.ForeignKey("groups.id"), nullable=True, index=True)
    friend_user_low_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=True, index=True)
    friend_user_high_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=True, index=True)

    payer_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    receiver_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    amount = db.Column(db.Numeric(14, 2), nullable=False)
    date = db.Column(db.Date, nullable=False)

    payer_account_id = db.Column(UUID(as_uuid=True), db.ForeignKey("accounts.id"), nullable=True)
    payer_transaction_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )
    receiver_account_id = db.Column(UUID(as_uuid=True), db.ForeignKey("accounts.id"), nullable=True)
    receiver_transaction_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )

    payer = db.relationship("User", foreign_keys=[payer_id])
    receiver = db.relationship("User", foreign_keys=[receiver_id])
    group = db.relationship("Group")

    __table_args__ = (
        db.CheckConstraint(
            "(group_id IS NOT NULL AND friend_user_low_id IS NULL) OR "
            "(group_id IS NULL AND friend_user_low_id IS NOT NULL AND friend_user_high_id IS NOT NULL)",
            name="ck_settlement_scope_xor",
        ),
        db.CheckConstraint("amount > 0", name="ck_settlement_amount_positive"),
        db.CheckConstraint("payer_id <> receiver_id", name="ck_settlement_distinct_parties"),
    )

    @property
    def payer_side_status(self):
        return "recorded" if self.payer_transaction_id else "pending"

    @property
    def receiver_side_status(self):
        return "recorded" if self.receiver_transaction_id else "pending"

    def to_dict(self):
        return {
            "id": str(self.id),
            "group_id": str(self.group_id) if self.group_id else None,
            "group_name": self.group.name if self.group else None,
            "group_icon": self.group.icon if self.group else None,
            "group_color_hex": self.group.color_hex if self.group else None,
            "friend_user_low_id": str(self.friend_user_low_id) if self.friend_user_low_id else None,
            "friend_user_high_id": str(self.friend_user_high_id) if self.friend_user_high_id else None,
            "payer_id": str(self.payer_id),
            "payer": self.payer.to_dict() if self.payer else None,
            "receiver_id": str(self.receiver_id),
            "receiver": self.receiver.to_dict() if self.receiver else None,
            "amount": float(self.amount),
            "date": self.date.isoformat(),
            "created_at": self.created_at.isoformat(),
            "payer_account_id": str(self.payer_account_id) if self.payer_account_id else None,
            "payer_transaction_id": str(self.payer_transaction_id) if self.payer_transaction_id else None,
            "receiver_account_id": str(self.receiver_account_id) if self.receiver_account_id else None,
            "receiver_transaction_id": str(self.receiver_transaction_id) if self.receiver_transaction_id else None,
            "payer_side_status": self.payer_side_status,
            "receiver_side_status": self.receiver_side_status,
        }
