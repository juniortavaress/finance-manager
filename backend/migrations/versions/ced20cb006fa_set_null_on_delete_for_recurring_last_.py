"""set null on delete for recurring last_transaction_id fk

Revision ID: ced20cb006fa
Revises: d3e5a0f7c9b4
Create Date: 2026-08-09 00:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'ced20cb006fa'
down_revision = 'd3e5a0f7c9b4'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('recurring_transactions', schema=None) as batch_op:
        batch_op.drop_constraint(
            'fk_recurring_transactions_last_transaction_id_transactions', type_='foreignkey'
        )
        batch_op.create_foreign_key(
            'fk_recurring_transactions_last_transaction_id_transactions',
            'transactions',
            ['last_transaction_id'],
            ['id'],
            ondelete='SET NULL',
        )


def downgrade():
    with op.batch_alter_table('recurring_transactions', schema=None) as batch_op:
        batch_op.drop_constraint(
            'fk_recurring_transactions_last_transaction_id_transactions', type_='foreignkey'
        )
        batch_op.create_foreign_key(
            'fk_recurring_transactions_last_transaction_id_transactions',
            'transactions',
            ['last_transaction_id'],
            ['id'],
        )
