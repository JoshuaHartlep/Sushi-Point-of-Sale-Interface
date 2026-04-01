"""add ayce surcharge to menu items

Revision ID: 6a1b2c3d4e5f
Revises: 3f8a2b5c6d7e
Create Date: 2026-04-01 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6a1b2c3d4e5f"
down_revision: Union[str, None] = "3f8a2b5c6d7e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "menu_items",
        sa.Column("ayce_surcharge", sa.Numeric(precision=10, scale=2), nullable=True, server_default="0.00"),
    )


def downgrade() -> None:
    op.drop_column("menu_items", "ayce_surcharge")
