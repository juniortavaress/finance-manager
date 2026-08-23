"""add fixed_income_rate_pct to asset_transactions

Revision ID: c4d5e6f7a8b9
Revises: bb43bd4031d2
Create Date: 2026-08-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4d5e6f7a8b9'
down_revision = 'bb43bd4031d2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('asset_transactions', sa.Column('fixed_income_rate_pct', sa.Numeric(precision=7, scale=3), nullable=True))

    # Backfill: cada compra de renda fixa ja cadastrada assume a taxa unica
    # que estava no ativo ate agora - preserva o calculo dos ativos
    # existentes. Dai em diante cada compra carrega sua propria taxa.
    op.execute(
        """
        UPDATE asset_transactions AS tx
        SET fixed_income_rate_pct = a.fixed_income_rate_pct
        FROM assets AS a
        WHERE tx.asset_id = a.id
          AND tx.type = 'buy'
          AND a.type = 'renda_fixa'
          AND a.fixed_income_rate_pct IS NOT NULL
        """
    )


def downgrade():
    op.drop_column('asset_transactions', 'fixed_income_rate_pct')
