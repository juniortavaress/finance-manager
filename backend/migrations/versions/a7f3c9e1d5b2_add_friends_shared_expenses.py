"""add friends, groups and shared expenses

Revision ID: a7f3c9e1d5b2
Revises: 2d4d39c3ea8d
Create Date: 2026-08-13 00:00:00.000001

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a7f3c9e1d5b2'
down_revision = '2d4d39c3ea8d'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('friendships',
    sa.Column('requester_id', sa.UUID(), nullable=False),
    sa.Column('addressee_id', sa.UUID(), nullable=False),
    sa.Column('status', sa.Enum('pending', 'accepted', 'rejected', name='friendship_status'), nullable=False),
    sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('requester_id <> addressee_id', name='ck_friendship_not_self'),
    sa.ForeignKeyConstraint(['addressee_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['requester_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('requester_id', 'addressee_id', name='uq_friendship_pair'),
    )
    with op.batch_alter_table('friendships', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_friendships_addressee_id'), ['addressee_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_friendships_requester_id'), ['requester_id'], unique=False)

    op.create_table('groups',
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=False),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('groups', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_groups_created_by'), ['created_by'], unique=False)

    op.create_table('group_members',
    sa.Column('group_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('group_id', 'user_id', name='uq_group_member'),
    )
    with op.batch_alter_table('group_members', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_group_members_group_id'), ['group_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_group_members_user_id'), ['user_id'], unique=False)

    op.create_table('shared_expenses',
    sa.Column('group_id', sa.UUID(), nullable=True),
    sa.Column('friend_user_low_id', sa.UUID(), nullable=True),
    sa.Column('friend_user_high_id', sa.UUID(), nullable=True),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('total_amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('paid_by_id', sa.UUID(), nullable=False),
    sa.Column('split_mode', sa.Enum('equal', 'value', 'percentage', name='split_mode'), nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=False),
    sa.Column('payer_account_id', sa.UUID(), nullable=True),
    sa.Column('transaction_id', sa.UUID(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint(
        "(group_id IS NOT NULL AND friend_user_low_id IS NULL AND friend_user_high_id IS NULL) OR "
        "(group_id IS NULL AND friend_user_low_id IS NOT NULL AND friend_user_high_id IS NOT NULL)",
        name='ck_shared_expense_scope_xor',
    ),
    sa.CheckConstraint('total_amount > 0', name='ck_shared_expense_amount_positive'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['friend_user_high_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['friend_user_low_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ),
    sa.ForeignKeyConstraint(['paid_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['payer_account_id'], ['accounts.id'], ),
    sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('shared_expenses', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_shared_expenses_date'), ['date'], unique=False)
        batch_op.create_index(batch_op.f('ix_shared_expenses_friend_user_high_id'), ['friend_user_high_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_shared_expenses_friend_user_low_id'), ['friend_user_low_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_shared_expenses_group_id'), ['group_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_shared_expenses_paid_by_id'), ['paid_by_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_shared_expenses_transaction_id'), ['transaction_id'], unique=False)

    op.create_table('expense_participants',
    sa.Column('shared_expense_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('share_amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('share_amount > 0', name='ck_participant_share_positive'),
    sa.ForeignKeyConstraint(['shared_expense_id'], ['shared_expenses.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('shared_expense_id', 'user_id', name='uq_expense_participant'),
    )
    with op.batch_alter_table('expense_participants', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_expense_participants_shared_expense_id'), ['shared_expense_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_expense_participants_user_id'), ['user_id'], unique=False)

    op.create_table('settlements',
    sa.Column('group_id', sa.UUID(), nullable=True),
    sa.Column('friend_user_low_id', sa.UUID(), nullable=True),
    sa.Column('friend_user_high_id', sa.UUID(), nullable=True),
    sa.Column('payer_id', sa.UUID(), nullable=False),
    sa.Column('receiver_id', sa.UUID(), nullable=False),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('payer_account_id', sa.UUID(), nullable=True),
    sa.Column('payer_transaction_id', sa.UUID(), nullable=True),
    sa.Column('receiver_account_id', sa.UUID(), nullable=True),
    sa.Column('receiver_transaction_id', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint(
        "(group_id IS NOT NULL AND friend_user_low_id IS NULL) OR "
        "(group_id IS NULL AND friend_user_low_id IS NOT NULL AND friend_user_high_id IS NOT NULL)",
        name='ck_settlement_scope_xor',
    ),
    sa.CheckConstraint('amount > 0', name='ck_settlement_amount_positive'),
    sa.CheckConstraint('payer_id <> receiver_id', name='ck_settlement_distinct_parties'),
    sa.ForeignKeyConstraint(['friend_user_high_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['friend_user_low_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ),
    sa.ForeignKeyConstraint(['payer_account_id'], ['accounts.id'], ),
    sa.ForeignKeyConstraint(['payer_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['payer_transaction_id'], ['transactions.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['receiver_account_id'], ['accounts.id'], ),
    sa.ForeignKeyConstraint(['receiver_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['receiver_transaction_id'], ['transactions.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('settlements', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_settlements_friend_user_high_id'), ['friend_user_high_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_settlements_friend_user_low_id'), ['friend_user_low_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_settlements_group_id'), ['group_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_settlements_payer_id'), ['payer_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_settlements_receiver_id'), ['receiver_id'], unique=False)


def downgrade():
    op.drop_table('settlements')
    op.drop_table('expense_participants')
    op.drop_table('shared_expenses')
    op.drop_table('group_members')
    op.drop_table('groups')
    op.drop_table('friendships')
