"""add unique constraint on dividends(schedule_id, date)

Revision ID: 2c5828e9e44c
Revises: b2c3d4e5f6a7
Create Date: 2026-09-14 00:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '2c5828e9e44c'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_unique_constraint("uq_dividend_schedule_date", "dividends", ["schedule_id", "date"])


def downgrade():
    op.drop_constraint("uq_dividend_schedule_date", "dividends", type_="unique")
