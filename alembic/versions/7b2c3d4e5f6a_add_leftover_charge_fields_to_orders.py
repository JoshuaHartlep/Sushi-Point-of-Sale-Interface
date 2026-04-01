"""add leftover charge fields to orders

Revision ID: 7b2c3d4e5f6a
Revises: 6a1b2c3d4e5f
Create Date: 2026-04-01 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7b2c3d4e5f6a"
down_revision: Union[str, None] = "6a1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("leftover_charge_amount", sa.Numeric(precision=10, scale=2), nullable=True, server_default="0.00"),
    )
    op.add_column("orders", sa.Column("leftover_charge_note", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "leftover_charge_note")
    op.drop_column("orders", "leftover_charge_amount")
