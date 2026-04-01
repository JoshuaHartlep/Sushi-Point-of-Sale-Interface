"""add image position fields to menu items

Adds image_position_x, image_position_y, and image_zoom columns to menu_items
for client-side image cropping/positioning support.

Revision ID: 8c9d0e1f2a3b
Revises: 14495eb936cc
Create Date: 2026-04-01 15:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8c9d0e1f2a3b'
down_revision: Union[str, None] = '14495eb936cc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('menu_items', sa.Column('image_position_x', sa.Float(), nullable=False, server_default='50.0'))
    op.add_column('menu_items', sa.Column('image_position_y', sa.Float(), nullable=False, server_default='50.0'))
    op.add_column('menu_items', sa.Column('image_zoom', sa.Float(), nullable=False, server_default='1.0'))


def downgrade() -> None:
    op.drop_column('menu_items', 'image_zoom')
    op.drop_column('menu_items', 'image_position_y')
    op.drop_column('menu_items', 'image_position_x')
