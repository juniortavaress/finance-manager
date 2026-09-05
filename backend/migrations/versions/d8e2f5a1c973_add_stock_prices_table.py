"""add stock_prices table

Revision ID: d8e2f5a1c973
Revises: c5afbc03faaa
Create Date: 2026-09-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd8e2f5a1c973'
down_revision = 'c5afbc03faaa'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('stock_prices',
    sa.Column('symbol', sa.Text(), nullable=False),
    sa.Column('currency', sa.Text(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('price', sa.Numeric(precision=18, scale=6), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('symbol', 'currency', 'date')
    )


def downgrade():
    op.drop_table('stock_prices')
