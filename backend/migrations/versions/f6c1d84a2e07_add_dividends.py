"""add dividend_schedules and dividends tables

Revision ID: f6c1d84a2e07
Revises: e4a7c2f9b163
Create Date: 2026-08-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'f6c1d84a2e07'
down_revision = 'e4a7c2f9b163'
branch_labels = None
depends_on = None

DIVIDEND_KINDS = ("dividendo", "rendimento", "jcp", "cupom", "bonificacao", "outro")
DIVIDEND_CALC_MODES = ("per_share", "fixed")
DIVIDEND_FREQUENCIES = ("monthly", "quarterly", "semiannual", "yearly")


def upgrade():
    op.create_table(
        "dividend_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.Enum(*DIVIDEND_KINDS, name="dividend_kind"), nullable=False, server_default="dividendo"),
        sa.Column("calc_mode", sa.Enum(*DIVIDEND_CALC_MODES, name="dividend_calc_mode"), nullable=False),
        sa.Column("amount_per_share", sa.Numeric(14, 6), nullable=True),
        sa.Column("fixed_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column(
            "frequency",
            sa.Enum(*DIVIDEND_FREQUENCIES, name="dividend_frequency"),
            nullable=False,
            server_default="monthly",
        ),
        sa.Column("day_of_month", sa.SmallInteger(), nullable=False),
        sa.Column("next_due_date", sa.Date(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"]),
    )
    op.create_index("ix_dividend_schedules_asset_id", "dividend_schedules", ["asset_id"])

    op.create_table(
        "dividends",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("transaction_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "kind", sa.Enum(*DIVIDEND_KINDS, name="dividend_kind_history"), nullable=False, server_default="dividendo"
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("quantity_snapshot", sa.Numeric(18, 8), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"]),
        sa.ForeignKeyConstraint(["schedule_id"], ["dividend_schedules.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
    )
    op.create_index("ix_dividends_asset_id", "dividends", ["asset_id"])
    op.create_index("ix_dividends_schedule_id", "dividends", ["schedule_id"])
    op.create_index("ix_dividends_transaction_id", "dividends", ["transaction_id"])
    op.create_index("ix_dividends_date", "dividends", ["date"])


def downgrade():
    op.drop_table("dividends")
    op.drop_table("dividend_schedules")
    op.execute("DROP TYPE IF EXISTS dividend_kind_history")
    op.execute("DROP TYPE IF EXISTS dividend_frequency")
    op.execute("DROP TYPE IF EXISTS dividend_calc_mode")
    op.execute("DROP TYPE IF EXISTS dividend_kind")
