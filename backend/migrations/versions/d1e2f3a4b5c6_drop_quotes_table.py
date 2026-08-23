"""drop quotes table

Revision ID: d1e2f3a4b5c6
Revises: c4d5e6f7a8b9
Create Date: 2026-08-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd1e2f3a4b5c6'
down_revision = 'c4d5e6f7a8b9'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table('quotes')


def downgrade():
    op.create_table('quotes',
    sa.Column('currency', sa.Text(), nullable=False),
    sa.Column('brl_rate', sa.Numeric(precision=14, scale=6), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('currency')
    )
