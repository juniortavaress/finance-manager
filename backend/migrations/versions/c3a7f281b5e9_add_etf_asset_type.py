"""add etf value to asset_type enum

Revision ID: c3a7f281b5e9
Revises: d8e2f5a1c973
Create Date: 2026-09-06 00:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'c3a7f281b5e9'
down_revision = 'd8e2f5a1c973'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE asset_type ADD VALUE IF NOT EXISTS 'etf'")


def downgrade():
    # PostgreSQL nao suporta remover valor de enum diretamente.
    pass
