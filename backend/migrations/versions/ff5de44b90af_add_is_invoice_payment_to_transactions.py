"""add is_invoice_payment and invoice_payment_for_id to transactions

Revision ID: ff5de44b90af
Revises: ced20cb006fa
Create Date: 2026-08-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'ff5de44b90af'
down_revision = 'ced20cb006fa'
branch_labels = None
depends_on = None

PAYMENT_CATEGORY_NAME = "Pagamento de fatura"


def upgrade():
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('is_invoice_payment', sa.Boolean(), nullable=False, server_default='false')
        )
        batch_op.add_column(
            sa.Column('invoice_payment_for_id', postgresql.UUID(as_uuid=True), nullable=True)
        )
        batch_op.create_index(
            batch_op.f('ix_transactions_invoice_payment_for_id'), ['invoice_payment_for_id'], unique=False
        )
        batch_op.create_foreign_key(
            'fk_transactions_invoice_payment_for_id_credit_card_invoices',
            'credit_card_invoices',
            ['invoice_payment_for_id'],
            ['id'],
        )

    connection = op.get_bind()

    # Backfill: previously, an invoice payment was only identifiable by its
    # (archived, auto-created) category named "Pagamento de fatura". Mark those
    # existing transactions so historical data keeps behaving correctly.
    connection.execute(
        sa.text(
            """
            UPDATE transactions t
            SET is_invoice_payment = TRUE
            FROM categories c
            WHERE t.category_id = c.id
              AND c.archived = TRUE
              AND c.name = :category_name
            """
        ),
        {"category_name": PAYMENT_CATEGORY_NAME},
    )

    # Best-effort backfill of invoice_payment_for_id for those same rows: the
    # original payment flow never linked the transaction back to the invoice,
    # so match on the invoice being fully paid, same paid date and amount.
    # Ambiguous matches (e.g. two invoices paid for the same amount on the
    # same day) are intentionally left unlinked rather than guessed.
    connection.execute(
        sa.text(
            """
            UPDATE transactions t
            SET invoice_payment_for_id = i.id
            FROM credit_card_invoices i
            WHERE t.is_invoice_payment = TRUE
              AND t.invoice_payment_for_id IS NULL
              AND i.status = 'paid'
              AND i.paid_at IS NOT NULL
              AND t.date = i.paid_at::date
              AND t.amount = i.total_amount
              AND (
                SELECT COUNT(*) FROM credit_card_invoices i2
                WHERE i2.status = 'paid' AND i2.paid_at::date = t.date AND i2.total_amount = t.amount
              ) = 1
              AND (
                SELECT COUNT(*) FROM transactions t2
                WHERE t2.is_invoice_payment = TRUE AND t2.date = t.date AND t2.amount = t.amount
              ) = 1
            """
        )
    )


def downgrade():
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.drop_constraint(
            'fk_transactions_invoice_payment_for_id_credit_card_invoices', type_='foreignkey'
        )
        batch_op.drop_index(batch_op.f('ix_transactions_invoice_payment_for_id'))
        batch_op.drop_column('invoice_payment_for_id')
        batch_op.drop_column('is_invoice_payment')
