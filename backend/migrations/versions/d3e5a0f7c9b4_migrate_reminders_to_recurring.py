"""migrate bill reminders data into recurring transactions

Revision ID: d3e5a0f7c9b4
Revises: c2a4f9e8b1d3
Create Date: 2026-08-08 21:05:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd3e5a0f7c9b4'
down_revision = 'c2a4f9e8b1d3'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()

    bind.execute(sa.text("""
        INSERT INTO recurring_transactions (
            id, user_id, account_id, category_id, description, amount,
            type, payment_method, frequency, day_of_month, start_date,
            end_date, auto_confirm, next_run_date, active,
            auto_debit, current_due_date, paid_at, last_transaction_id,
            created_at, updated_at
        )
        SELECT
            br.id, br.user_id, br.account_id, br.category_id, br.description,
            br.amount, 'expense'::transaction_type_recurring,
            (CASE WHEN a.type = 'credit_card' THEN 'credit' ELSE 'debit' END)::recurring_payment_method,
            'monthly'::recurring_frequency, br.day_of_month,
            COALESCE(br.paid_at, br.current_due_date),
            NULL, true, NULL, br.active,
            false, br.current_due_date, br.paid_at, br.last_transaction_id,
            br.created_at, br.updated_at
        FROM bill_reminders br
        JOIN accounts a ON a.id = br.account_id
    """))

    bind.execute(sa.text("""
        UPDATE transactions t
        SET recurring_transaction_id = br.id
        FROM bill_reminders br
        WHERE br.last_transaction_id = t.id
    """))

    with op.batch_alter_table('bill_reminders', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_bill_reminders_user_id'))
        batch_op.drop_index(batch_op.f('ix_bill_reminders_category_id'))
        batch_op.drop_index(batch_op.f('ix_bill_reminders_account_id'))

    op.drop_table('bill_reminders')


def downgrade():
    op.create_table(
        'bill_reminders',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('account_id', sa.UUID(), nullable=False),
        sa.Column('category_id', sa.UUID(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('day_of_month', sa.SmallInteger(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('current_due_date', sa.Date(), nullable=False),
        sa.Column('paid_at', sa.Date(), nullable=True),
        sa.Column('last_transaction_id', sa.UUID(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id']),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id']),
        sa.ForeignKeyConstraint(['last_transaction_id'], ['transactions.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('bill_reminders', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_bill_reminders_account_id'), ['account_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_bill_reminders_category_id'), ['category_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_bill_reminders_user_id'), ['user_id'], unique=False)

    bind = op.get_bind()
    bind.execute(sa.text("""
        INSERT INTO bill_reminders (
            id, user_id, account_id, category_id, description, amount,
            day_of_month, active, current_due_date, paid_at, last_transaction_id,
            created_at, updated_at
        )
        SELECT
            id, user_id, account_id, category_id, description, amount,
            day_of_month, active, current_due_date, paid_at, last_transaction_id,
            created_at, updated_at
        FROM recurring_transactions
        WHERE auto_debit = false
    """))

    bind.execute(sa.text("""
        DELETE FROM recurring_transactions WHERE auto_debit = false
    """))
