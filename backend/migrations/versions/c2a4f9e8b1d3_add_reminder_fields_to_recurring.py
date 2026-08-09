"""add reminder fields to recurring transactions

Revision ID: c2a4f9e8b1d3
Revises: f8ebcc16c295
Create Date: 2026-08-08 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c2a4f9e8b1d3'
down_revision = 'f8ebcc16c295'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('recurring_transactions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('auto_debit', sa.Boolean(), nullable=False, server_default='true'))
        batch_op.add_column(sa.Column('current_due_date', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('paid_at', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('last_transaction_id', sa.UUID(), nullable=True))
        batch_op.create_foreign_key(
            'fk_recurring_transactions_last_transaction_id_transactions',
            'transactions',
            ['last_transaction_id'],
            ['id'],
        )
        batch_op.create_index(
            batch_op.f('ix_recurring_transactions_last_transaction_id'), ['last_transaction_id'], unique=False
        )


def downgrade():
    with op.batch_alter_table('recurring_transactions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_recurring_transactions_last_transaction_id'))
        batch_op.drop_constraint(
            'fk_recurring_transactions_last_transaction_id_transactions', type_='foreignkey'
        )
        batch_op.drop_column('last_transaction_id')
        batch_op.drop_column('paid_at')
        batch_op.drop_column('current_due_date')
        batch_op.drop_column('auto_debit')
