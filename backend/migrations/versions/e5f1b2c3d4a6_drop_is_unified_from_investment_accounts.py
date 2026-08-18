"""drop is_unified from investment_accounts

Revision ID: e5f1b2c3d4a6
Revises: d3e9a5b6c7f2
Create Date: 2026-08-18 00:00:02.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e5f1b2c3d4a6'
down_revision = 'd3e9a5b6c7f2'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("investment_accounts", "is_unified")


def downgrade():
    op.add_column(
        "investment_accounts",
        sa.Column("is_unified", sa.Boolean(), nullable=False, server_default="false"),
    )
