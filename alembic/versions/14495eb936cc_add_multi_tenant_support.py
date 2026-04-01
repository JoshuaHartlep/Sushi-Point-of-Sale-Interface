"""add multi-tenant support

Adds a `tenants` table and `tenant_id` FK columns to all business data tables
so that every row is scoped to a single restaurant.

Migration strategy (safe 3-phase approach):
  1. Create `tenants` table and insert the default tenant (id=1).
  2. Add `tenant_id` columns as NULLABLE to each business table.
  3. Backfill all existing rows with the default tenant_id (1).
  4. ALTER columns to NOT NULL and add FK + index constraints.

This order guarantees zero downtime on non-empty databases: the existing data
is always valid before any constraint is tightened.

Revision ID: 14495eb936cc
Revises: 3f8a2b5c6d7e
Create Date: 2026-04-01 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '14495eb936cc'
down_revision: Union[str, None] = '7b2c3d4e5f6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tables that need a tenant_id column.
# Settings is last because it has a unique constraint in addition to the FK.
_TENANT_TABLES = [
    'categories',
    'menu_items',
    'modifiers',
    'tables',
    'orders',
    'settings',
]

# The default tenant ID used for all existing (pre-migration) rows.
DEFAULT_TENANT_ID = 1


def upgrade() -> None:
    """
    Phase 1 — Create tenants table and insert the default tenant.
    Phase 2 — Add nullable tenant_id columns.
    Phase 3 — Backfill existing rows.
    Phase 4 — Tighten to NOT NULL + FK + index.
    """

    # -------------------------------------------------------------------------
    # Phase 1: tenants table
    # Use IF NOT EXISTS because Base.metadata.create_all() at app startup may
    # have already created the table before this migration ran.
    # -------------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenants (
            id SERIAL NOT NULL,
            name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            PRIMARY KEY (id)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_tenants_id ON tenants (id)
    """)

    # Seed the default tenant — skip silently if it already exists
    op.execute(f"""
        INSERT INTO tenants (id, name)
        VALUES ({DEFAULT_TENANT_ID}, 'Default Restaurant')
        ON CONFLICT (id) DO NOTHING
    """)

    # -------------------------------------------------------------------------
    # Phase 2: add tenant_id as nullable (no FK yet — safe on non-empty tables)
    # -------------------------------------------------------------------------
    for table in _TENANT_TABLES:
        op.add_column(table, sa.Column('tenant_id', sa.Integer(), nullable=True))

    # -------------------------------------------------------------------------
    # Phase 3: backfill existing rows with the default tenant
    # -------------------------------------------------------------------------
    for table in _TENANT_TABLES:
        op.execute(f"UPDATE {table} SET tenant_id = {DEFAULT_TENANT_ID}")

    # -------------------------------------------------------------------------
    # Phase 4: tighten constraints now that every row has a valid tenant_id
    # -------------------------------------------------------------------------
    for table in _TENANT_TABLES:
        # Make NOT NULL (safe because every row was just backfilled)
        op.alter_column(table, 'tenant_id', nullable=False)

        # Add the FK constraint
        op.create_foreign_key(
            f'fk_{table}_tenant_id',
            table,
            'tenants',
            ['tenant_id'],
            ['id'],
        )

        # Index for fast per-tenant queries
        op.create_index(f'ix_{table}_tenant_id', table, ['tenant_id'])

    # settings.tenant_id must be UNIQUE (one settings row per tenant)
    op.create_unique_constraint('uq_settings_tenant_id', 'settings', ['tenant_id'])


def downgrade() -> None:
    """
    Reverses the migration in safe order: drop constraints first, then columns,
    then the tenants table itself.
    """

    # Drop unique constraint on settings first
    op.drop_constraint('uq_settings_tenant_id', 'settings', type_='unique')

    for table in reversed(_TENANT_TABLES):
        # Drop index
        try:
            op.drop_index(f'ix_{table}_tenant_id', table_name=table)
        except Exception:
            pass  # index may not exist if migration was partially applied

        # Drop FK constraint
        try:
            op.drop_constraint(f'fk_{table}_tenant_id', table, type_='foreignkey')
        except Exception:
            pass

        # Drop the column
        op.drop_column(table, 'tenant_id')

    # Drop tenants table last (all FK references already removed above)
    op.drop_index(op.f('ix_tenants_id'), table_name='tenants')
    op.drop_table('tenants')
