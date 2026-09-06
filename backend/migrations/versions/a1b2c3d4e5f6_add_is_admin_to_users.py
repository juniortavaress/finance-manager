"""add is_admin to users

Revision ID: a1b2c3d4e5f6
Revises: c3a7f281b5e9
Create Date: 2026-09-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'c3a7f281b5e9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default="false"))


def downgrade():
    op.drop_column("users", "is_admin")
