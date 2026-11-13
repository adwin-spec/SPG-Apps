"""user soft delete + area kab/kota

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-13 08:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('areas', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'),
                                     nullable=False, server_default=sa.text("'[]'")))


def downgrade() -> None:
    op.drop_column('users', 'areas')
    op.drop_column('users', 'deleted_at')
