from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db
from app.models.base import BaseModel, gen_uuid, utcnow


class User(BaseModel):
    __tablename__ = "users"

    name = db.Column(db.Text, nullable=False)
    email = db.Column(db.Text, nullable=False, unique=True, index=True)
    password_hash = db.Column(db.Text, nullable=False)
    avatar_url = db.Column(db.Text, nullable=True)
    currency_default = db.Column(db.Text, nullable=False, default="BRL")
    deleted_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "email": self.email,
            "avatar_url": self.avatar_url,
            "currency_default": self.currency_default,
        }


class AuthSession(BaseModel):
    __tablename__ = "auth_sessions"

    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    refresh_token_hash = db.Column(db.Text, nullable=False)
    user_agent = db.Column(db.Text, nullable=True)
    ip_address = db.Column(db.Text, nullable=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)


class PasswordResetToken(BaseModel):
    __tablename__ = "password_reset_tokens"

    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True)
    token_hash = db.Column(db.Text, nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    used_at = db.Column(db.DateTime(timezone=True), nullable=True)
