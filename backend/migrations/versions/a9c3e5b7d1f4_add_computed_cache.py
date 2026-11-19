"""add computed_cache (resultados pre-calculados por usuario)

Revision ID: a9c3e5b7d1f4
Revises: f2b4d6a8c0e1
Create Date: 2026-11-19 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'a9c3e5b7d1f4'
down_revision = 'f2b4d6a8c0e1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "computed_cache",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("fingerprint", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "key"),
    )


def downgrade():
    op.drop_table("computed_cache")
