"""add simplify_debts to groups

Revision ID: b3e8f1c4a920
Revises: a7f3c9e1d5b2
Create Date: 2026-08-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b3e8f1c4a920'
down_revision = 'a7f3c9e1d5b2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('groups', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('simplify_debts', sa.Boolean(), nullable=False, server_default='false')
        )


def downgrade():
    with op.batch_alter_table('groups', schema=None) as batch_op:
        batch_op.drop_column('simplify_debts')
