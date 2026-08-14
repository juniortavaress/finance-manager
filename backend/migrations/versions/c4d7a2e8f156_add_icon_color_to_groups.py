"""add icon and color_hex to groups

Revision ID: c4d7a2e8f156
Revises: b3e8f1c4a920
Create Date: 2026-08-14 00:00:00.000001

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4d7a2e8f156'
down_revision = 'b3e8f1c4a920'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('groups', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('icon', sa.Text(), nullable=False, server_default='\U0001F465')
        )
        batch_op.add_column(
            sa.Column('color_hex', sa.Text(), nullable=False, server_default='#0F5C5C')
        )


def downgrade():
    with op.batch_alter_table('groups', schema=None) as batch_op:
        batch_op.drop_column('color_hex')
        batch_op.drop_column('icon')
