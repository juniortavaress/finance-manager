"""drop archived from assets (now derived from quantity == 0)

Revision ID: a3d9e6f1c284
Revises: f6c1d84a2e07
Create Date: 2026-08-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a3d9e6f1c284'
down_revision = 'f6c1d84a2e07'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("assets", "archived")


def downgrade():
    op.add_column(
        "assets",
        sa.Column("archived", sa.Boolean(), nullable=False, server_default="false"),
    )
