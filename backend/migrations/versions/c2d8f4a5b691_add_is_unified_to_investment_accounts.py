"""add is_unified to investment_accounts

Revision ID: c2d8f4a5b691
Revises: b1c4e9a7f3d2
Create Date: 2026-08-18 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c2d8f4a5b691'
down_revision = 'b1c4e9a7f3d2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "investment_accounts",
        sa.Column("is_unified", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade():
    op.drop_column("investment_accounts", "is_unified")
