"""add fee_amount to asset_transactions

Revision ID: d2f6a8b3c751
Revises: b7e3c1a9d4f2
Create Date: 2026-08-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd2f6a8b3c751'
down_revision = 'b7e3c1a9d4f2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "asset_transactions",
        sa.Column("fee_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
    )


def downgrade():
    op.drop_column("asset_transactions", "fee_amount")
