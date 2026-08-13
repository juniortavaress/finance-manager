"""add budget_amount to categories

Revision ID: 2d4d39c3ea8d
Revises: ff5de44b90af
Create Date: 2026-08-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2d4d39c3ea8d'
down_revision = 'ff5de44b90af'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.add_column(sa.Column('budget_amount', sa.Numeric(14, 2), nullable=True))


def downgrade():
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.drop_column('budget_amount')
