"""add fixed income fields to assets

Revision ID: b1c4e9a7f3d2
Revises: a3d9e6f1c284
Create Date: 2026-08-17 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b1c4e9a7f3d2'
down_revision = 'a3d9e6f1c284'
branch_labels = None
depends_on = None


def upgrade():
    fixed_income_type = sa.Enum("pos_fixado", "pre_fixado", "ipca", name="fixed_income_type")
    fixed_income_type.create(op.get_bind())

    op.add_column("assets", sa.Column("fixed_income_type", fixed_income_type, nullable=True))
    op.add_column("assets", sa.Column("fixed_income_indexer", sa.Text(), nullable=True))
    op.add_column("assets", sa.Column("fixed_income_rate_pct", sa.Numeric(7, 3), nullable=True))
    op.add_column("assets", sa.Column("maturity_date", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("assets", "maturity_date")
    op.drop_column("assets", "fixed_income_rate_pct")
    op.drop_column("assets", "fixed_income_indexer")
    op.drop_column("assets", "fixed_income_type")

    fixed_income_type = sa.Enum("pos_fixado", "pre_fixado", "ipca", name="fixed_income_type")
    fixed_income_type.drop(op.get_bind())
