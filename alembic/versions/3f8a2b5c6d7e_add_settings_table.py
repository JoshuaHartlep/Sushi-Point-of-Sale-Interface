"""add settings table

Revision ID: 3f8a2b5c6d7e
Revises: 2534c1a487d4
Create Date: 2025-08-01 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '3f8a2b5c6d7e'
down_revision: Union[str, None] = '2534c1a487d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create settings table
    op.create_table(
        'settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('restaurant_name', sa.String(length=255), nullable=False),
        sa.Column('timezone', sa.String(length=100), nullable=False),
        sa.Column('ayce_lunch_price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('ayce_dinner_price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_settings_id'), 'settings', ['id'], unique=False)
    
    # Insert default settings record
    op.execute("""
        INSERT INTO settings (id, restaurant_name, timezone, ayce_lunch_price, ayce_dinner_price)
        VALUES (1, 'Sushi Restaurant', 'America/New_York', 20.00, 25.00)
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_settings_id'), table_name='settings')
    op.drop_table('settings')