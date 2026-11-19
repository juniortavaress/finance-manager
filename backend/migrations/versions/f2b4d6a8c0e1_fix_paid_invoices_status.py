"""corrige faturas totalmente pagas que ficaram com status aberta/fechada

Revision ID: f2b4d6a8c0e1
Revises: e7a1b3c5d9f2
Create Date: 2026-11-19 11:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'f2b4d6a8c0e1'
down_revision = 'e7a1b3c5d9f2'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        UPDATE credit_card_invoices
        SET status = 'paid', paid_at = COALESCE(paid_at, now())
        WHERE status IN ('open', 'closed')
          AND total_amount > 0
          AND paid_amount >= total_amount
        """
    )


def downgrade():
    pass
