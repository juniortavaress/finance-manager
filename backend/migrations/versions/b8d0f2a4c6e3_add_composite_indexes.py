"""indices compostos para as consultas mais quentes (usuario+data, conta+data)

Revision ID: b8d0f2a4c6e3
Revises: a9c3e5b7d1f4
Create Date: 2026-11-19 13:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'b8d0f2a4c6e3'
down_revision = 'a9c3e5b7d1f4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_transactions_user_date", "transactions", ["user_id", "date"])
    op.create_index("ix_transactions_account_date", "transactions", ["account_id", "date"])
    op.create_index("ix_asset_transactions_asset_date", "asset_transactions", ["asset_id", "date"])


def downgrade():
    op.drop_index("ix_asset_transactions_asset_date", table_name="asset_transactions")
    op.drop_index("ix_transactions_account_date", table_name="transactions")
    op.drop_index("ix_transactions_user_date", table_name="transactions")
