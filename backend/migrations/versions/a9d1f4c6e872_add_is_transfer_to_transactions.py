"""add is_transfer and transfer_pair_id to transactions

Revision ID: a9d1f4c6e872
Revises: c4d7a2e8f156
Create Date: 2026-08-15 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'a9d1f4c6e872'
down_revision = 'c4d7a2e8f156'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('is_transfer', sa.Boolean(), nullable=False, server_default='false')
        )
        batch_op.add_column(
            sa.Column('transfer_pair_id', postgresql.UUID(as_uuid=True), nullable=True)
        )
        batch_op.create_index(
            batch_op.f('ix_transactions_transfer_pair_id'), ['transfer_pair_id'], unique=False
        )
        batch_op.create_foreign_key(
            'fk_transactions_transfer_pair_id_transactions',
            'transactions',
            ['transfer_pair_id'],
            ['id'],
        )


def downgrade():
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.drop_constraint(
            'fk_transactions_transfer_pair_id_transactions', type_='foreignkey'
        )
        batch_op.drop_index(batch_op.f('ix_transactions_transfer_pair_id'))
        batch_op.drop_column('transfer_pair_id')
        batch_op.drop_column('is_transfer')
