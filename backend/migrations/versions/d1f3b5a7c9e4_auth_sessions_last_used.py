"""auth_sessions passa a registrar o ultimo acesso e nao exige refresh token

Revision ID: d1f3b5a7c9e4
Revises: c9e1a3b5d7f2
Create Date: 2026-11-24 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd1f3b5a7c9e4'
down_revision = 'c9e1a3b5d7f2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("auth_sessions", sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("auth_sessions", "refresh_token_hash", existing_type=sa.Text(), nullable=True)


def downgrade():
    op.execute("UPDATE auth_sessions SET refresh_token_hash = '' WHERE refresh_token_hash IS NULL")
    op.alter_column("auth_sessions", "refresh_token_hash", existing_type=sa.Text(), nullable=False)
    op.drop_column("auth_sessions", "last_used_at")
