"""add exchange_rate to transactions

Revision ID: d3e9a5b6c7f2
Revises: c2d8f4a5b691
Create Date: 2026-08-18 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd3e9a5b6c7f2'
down_revision = 'c2d8f4a5b691'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("transactions", sa.Column("exchange_rate", sa.Numeric(18, 8), nullable=True))


def downgrade():
    op.drop_column("transactions", "exchange_rate")
