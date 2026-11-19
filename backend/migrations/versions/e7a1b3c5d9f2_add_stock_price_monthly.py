"""add stock_price_monthly (fechamento mensal pre-calculado)

Revision ID: e7a1b3c5d9f2
Revises: 2c5828e9e44c
Create Date: 2026-11-19 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e7a1b3c5d9f2'
down_revision = '2c5828e9e44c'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "stock_price_monthly",
        sa.Column("symbol", sa.Text(), nullable=False),
        sa.Column("currency", sa.Text(), nullable=False),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("price", sa.Numeric(18, 6), nullable=False),
        sa.PrimaryKeyConstraint("symbol", "currency", "month"),
    )
    # Backfill: ultimo preco diario de cada mes, ja existente em stock_prices.
    op.execute(
        """
        INSERT INTO stock_price_monthly (symbol, currency, month, price)
        SELECT DISTINCT ON (symbol, currency, date_trunc('month', date))
            symbol, currency, date_trunc('month', date)::date, price
        FROM stock_prices
        ORDER BY symbol, currency, date_trunc('month', date), date DESC
        """
    )


def downgrade():
    op.drop_table("stock_price_monthly")
