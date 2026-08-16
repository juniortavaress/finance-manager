"""add archived to assets

Revision ID: e4a7c2f9b163
Revises: d2f6a8b3c751
Create Date: 2026-08-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e4a7c2f9b163'
down_revision = 'd2f6a8b3c751'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "assets",
        sa.Column("archived", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade():
    op.drop_column("assets", "archived")
