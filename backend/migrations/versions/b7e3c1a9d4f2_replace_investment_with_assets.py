"""replace Investment/InvestmentSnapshot with Asset/AssetTransaction

Revision ID: b7e3c1a9d4f2
Revises: a9d1f4c6e872
Create Date: 2026-08-16 00:00:00.000000

"""
import uuid
from decimal import Decimal

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'b7e3c1a9d4f2'
down_revision = 'a9d1f4c6e872'
branch_labels = None
depends_on = None

ASSET_TYPES = ("renda_fixa", "acoes", "fii", "fundos", "cripto", "outro")
TRANSFER_CATEGORY_NAME = "Transferência entre contas"


def upgrade():
    op.create_table(
        "assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("investment_account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("type", sa.Enum(*ASSET_TYPES, name="asset_type"), nullable=False),
        sa.Column("code", sa.Text(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("current_unit_price", sa.Numeric(14, 6), nullable=True),
        sa.ForeignKeyConstraint(["investment_account_id"], ["investment_accounts.id"]),
    )
    op.create_index("ix_assets_investment_account_id", "assets", ["investment_account_id"])

    op.create_table(
        "asset_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("transaction_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("type", sa.Enum("buy", "sell", name="asset_transaction_type"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 8), nullable=False),
        sa.Column("unit_price", sa.Numeric(14, 6), nullable=False),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("note_id", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
    )
    op.create_index("ix_asset_transactions_asset_id", "asset_transactions", ["asset_id"])
    op.create_index("ix_asset_transactions_transaction_id", "asset_transactions", ["transaction_id"])
    op.create_index("ix_asset_transactions_date", "asset_transactions", ["date"])

    connection = op.get_bind()

    # Backfill: cada Investment vira um Asset com uma unica compra inicial
    # (quantidade 1, preco unitario = invested_amount), preservando o
    # historico em vez de descartar os dados existentes. current_amount vira
    # o current_unit_price do ativo (ja que quantity=1, preco == valor).
    old_investments = connection.execute(
        sa.text(
            """
            SELECT i.id, i.investment_account_id, i.type, i.name, i.invested_amount, i.current_amount,
                   ia.account_id
            FROM investments i
            JOIN investment_accounts ia ON ia.id = i.investment_account_id
            """
        )
    ).fetchall()

    if old_investments:
        affected_account_ids = set()
        for row in old_investments:
            user_id = connection.execute(
                sa.text("SELECT user_id FROM accounts WHERE id = :account_id"),
                {"account_id": row.account_id},
            ).scalar()

            category_id = connection.execute(
                sa.text(
                    "SELECT id FROM categories WHERE user_id = :user_id AND name = :name AND archived = TRUE"
                ),
                {"user_id": user_id, "name": TRANSFER_CATEGORY_NAME},
            ).scalar()
            if category_id is None:
                category_id = uuid.uuid4()
                connection.execute(
                    sa.text(
                        """
                        INSERT INTO categories (id, created_at, updated_at, user_id, name, icon, color_hex, kind, archived)
                        VALUES (:id, now(), now(), :user_id, :name, :icon, :color, 'both', TRUE)
                        """
                    ),
                    {
                        "id": category_id,
                        "user_id": user_id,
                        "name": TRANSFER_CATEGORY_NAME,
                        "icon": "\U0001F501",
                        "color": "#8B9A97",
                    },
                )

            asset_type = row.type if row.type in ASSET_TYPES else "outro"
            asset_id = uuid.uuid4()
            connection.execute(
                sa.text(
                    """
                    INSERT INTO assets (id, created_at, updated_at, investment_account_id, type, code, name, current_unit_price)
                    VALUES (:id, now(), now(), :investment_account_id, :type, NULL, :name, :current_unit_price)
                    """
                ),
                {
                    "id": asset_id,
                    "investment_account_id": row.investment_account_id,
                    "type": asset_type,
                    "name": row.name,
                    "current_unit_price": row.current_amount,
                },
            )

            tx_id = uuid.uuid4()
            invested = row.invested_amount if row.invested_amount and row.invested_amount > 0 else Decimal("0.01")
            connection.execute(
                sa.text(
                    """
                    INSERT INTO transactions (
                        id, created_at, updated_at, user_id, account_id, category_id, description,
                        amount, type, date, payment_method, status, is_transfer
                    )
                    VALUES (
                        :id, now(), now(), :user_id, :account_id, :category_id, :description,
                        :amount, 'expense', CURRENT_DATE, 'debit', 'confirmed', TRUE
                    )
                    """
                ),
                {
                    "id": tx_id,
                    "user_id": user_id,
                    "account_id": row.account_id,
                    "category_id": category_id,
                    "description": f"Compra {row.name}",
                    "amount": invested,
                },
            )

            connection.execute(
                sa.text(
                    """
                    INSERT INTO asset_transactions (
                        id, created_at, updated_at, asset_id, transaction_id, type, date,
                        quantity, unit_price, total_amount, note_id
                    )
                    VALUES (
                        :id, now(), now(), :asset_id, :transaction_id, 'buy', CURRENT_DATE,
                        1, :unit_price, :total_amount, NULL
                    )
                    """
                ),
                {
                    "id": uuid.uuid4(),
                    "asset_id": asset_id,
                    "transaction_id": tx_id,
                    "unit_price": invested,
                    "total_amount": invested,
                },
            )

            affected_account_ids.add(row.account_id)

        for account_id in affected_account_ids:
            connection.execute(
                sa.text(
                    """
                    UPDATE accounts
                    SET balance = opening_balance - COALESCE((
                        SELECT SUM(amount) FROM transactions
                        WHERE account_id = :account_id AND payment_method = 'debit'
                          AND status = 'confirmed' AND type = 'expense'
                    ), 0) + COALESCE((
                        SELECT SUM(amount) FROM transactions
                        WHERE account_id = :account_id AND payment_method = 'debit'
                          AND status = 'confirmed' AND type = 'income'
                    ), 0)
                    WHERE id = :account_id
                    """
                ),
                {"account_id": account_id},
            )

    op.drop_table("investment_snapshots")
    op.drop_table("investments")
    op.execute("DROP TYPE IF EXISTS investment_type")


def downgrade():
    op.execute(
        "CREATE TYPE investment_type AS ENUM ('renda_fixa', 'acoes', 'fundos', 'cripto', 'outro')"
    )
    op.create_table(
        "investments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("investment_account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("type", sa.Enum("renda_fixa", "acoes", "fundos", "cripto", "outro", name="investment_type"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("invested_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("current_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["investment_account_id"], ["investment_accounts.id"]),
    )
    op.create_index("ix_investments_investment_account_id", "investments", ["investment_account_id"])

    op.create_table(
        "investment_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("investment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("value", sa.Numeric(14, 2), nullable=False),
        sa.ForeignKeyConstraint(["investment_id"], ["investments.id"]),
    )
    op.create_index("ix_investment_snapshots_investment_id", "investment_snapshots", ["investment_id"])

    op.drop_table("asset_transactions")
    op.drop_table("assets")
    op.execute("DROP TYPE IF EXISTS asset_transaction_type")
    op.execute("DROP TYPE IF EXISTS asset_type")
