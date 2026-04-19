"""add menu_item_embeddings table for semantic search

Requires the pgvector PostgreSQL extension to be available on the server.
If pgvector is not installed, run:
    CREATE EXTENSION IF NOT EXISTS vector;
as a superuser before applying this migration.

The table stores pre-computed vector embeddings for every active menu item
so hybrid (semantic + keyword) search can be served without a live embedding
API call per query.

Indexes added:
  - ix_menu_item_embeddings_tenant_id  (tenant isolation)
  - ix_menu_item_embeddings_content_hash (skip re-embed when text unchanged)
  - ix_menu_item_embeddings_vector_hnsw  (ANN similarity search via pgvector HNSW)

The HNSW index uses cosine distance (vector_cosine_ops) to match the operator
used in the hybrid_search service query.

Revision ID: b3e4f5a6c7d8
Revises: 14495eb936cc
Create Date: 2026-04-19 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b3e4f5a6c7d8'
down_revision: Union[str, None] = '8c9d0e1f2a3b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Embedding vector dimension — must match EMBEDDING_DIM in settings
# (default 1536 for text-embedding-3-small).
_EMBEDDING_DIM = 1536


def upgrade() -> None:
    # ── 1. Enable pgvector extension ──────────────────────────────────────────
    # IF NOT EXISTS avoids errors on databases where it was already installed.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ── 2. Create embeddings table ────────────────────────────────────────────
    # Drop first in case Base.metadata.create_all() already created the table
    # with a JSON fallback column (happens when the pgvector Python package
    # wasn't installed at server startup time).  The table is always empty at
    # this point so dropping is safe.
    op.execute("DROP TABLE IF EXISTS menu_item_embeddings CASCADE")

    op.execute(f"""
        CREATE TABLE menu_item_embeddings (
            id              SERIAL PRIMARY KEY,
            tenant_id       INTEGER NOT NULL
                                REFERENCES tenants(id),
            menu_item_id    INTEGER NOT NULL
                                REFERENCES menu_items(id) ON DELETE CASCADE,
            embedding       vector({_EMBEDDING_DIM}),
            embedding_model VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-small',
            embedding_version VARCHAR(50) NOT NULL DEFAULT 'v1',
            content_hash    VARCHAR(64) NOT NULL,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_menu_item_embeddings_tenant_item_model_version
                UNIQUE (tenant_id, menu_item_id, embedding_model, embedding_version)
        )
    """)

    # ── 3. Supporting indexes ─────────────────────────────────────────────────

    # Fast per-tenant scoping on every query
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_menu_item_embeddings_tenant_id
            ON menu_item_embeddings (tenant_id)
    """)

    # Fast hash lookup to skip unchanged items during upsert
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_menu_item_embeddings_content_hash
            ON menu_item_embeddings (content_hash)
    """)

    # HNSW vector index for approximate nearest-neighbour search.
    # m=16 / ef_construction=64 are conservative defaults (good accuracy, low build time).
    # Tune m and ef_construction upward if you have thousands of items and need higher recall.
    # This index can be created on an empty table — it will be populated as rows are inserted.
    op.execute(f"""
        CREATE INDEX IF NOT EXISTS ix_menu_item_embeddings_vector_hnsw
            ON menu_item_embeddings
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_menu_item_embeddings_vector_hnsw")
    op.execute("DROP INDEX IF EXISTS ix_menu_item_embeddings_content_hash")
    op.execute("DROP INDEX IF EXISTS ix_menu_item_embeddings_tenant_id")
    op.execute("DROP TABLE IF EXISTS menu_item_embeddings")
    # NOTE: we intentionally do NOT drop the vector extension here because
    # other tables/indexes may depend on it.
