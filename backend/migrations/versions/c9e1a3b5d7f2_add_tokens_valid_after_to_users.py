"""users.tokens_valid_after para encerrar as sessoes de todos os dispositivos

Revision ID: c9e1a3b5d7f2
Revises: b8d0f2a4c6e3
Create Date: 2026-11-24 19:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c9e1a3b5d7f2'
down_revision = 'b8d0f2a4c6e3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("tokens_valid_after", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("users", "tokens_valid_after")
