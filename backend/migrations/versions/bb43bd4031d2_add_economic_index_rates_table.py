"""add economic_index_rates table

Revision ID: bb43bd4031d2
Revises: a137282de563
Create Date: 2026-08-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'bb43bd4031d2'
down_revision = 'a137282de563'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('economic_index_rates',
    sa.Column('indexer', sa.Text(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('rate_pct', sa.Numeric(precision=12, scale=8), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('indexer', 'date')
    )


def downgrade():
    op.drop_table('economic_index_rates')
