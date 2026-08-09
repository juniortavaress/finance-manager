"""allow credit payment method on recurring transactions

Revision ID: a1c9e5f7d3b2
Revises: 0013b5e4bb72
Create Date: 2026-08-08 19:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'a1c9e5f7d3b2'
down_revision = '0013b5e4bb72'
branch_labels = None
depends_on = None


def upgrade():
    # ALTER TYPE ... ADD VALUE nao pode rodar dentro de um bloco de transacao
    # junto com outros comandos no Postgres, entao roda isolado, fora do batch.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE recurring_payment_method ADD VALUE IF NOT EXISTS 'credit'")


def downgrade():
    # Postgres nao suporta remover valor de enum diretamente.
    # Reverter exigiria recriar o tipo do zero; deixado como no-op.
    pass
