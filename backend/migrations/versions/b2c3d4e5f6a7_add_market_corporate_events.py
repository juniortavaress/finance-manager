"""add market_corporate_events table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-09-06 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None

MARKET_CORPORATE_EVENT_TYPES = ("split", "merger")


def upgrade():
    op.create_table(
        "market_corporate_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("type", sa.Enum(*MARKET_CORPORATE_EVENT_TYPES, name="market_corporate_event_type"), nullable=False),
        sa.Column("target_code", sa.Text(), nullable=False),
        sa.Column("source_code", sa.Text(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("ratio", sa.Numeric(18, 8), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
    )
    op.create_index("ix_market_corporate_events_target_code", "market_corporate_events", ["target_code"])
    op.create_index("ix_market_corporate_events_source_code", "market_corporate_events", ["source_code"])
    op.create_index("ix_market_corporate_events_date", "market_corporate_events", ["date"])


def downgrade():
    op.drop_table("market_corporate_events")
    op.execute("DROP TYPE IF EXISTS market_corporate_event_type")
