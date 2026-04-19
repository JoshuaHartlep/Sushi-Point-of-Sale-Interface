"""
MenuItemEmbedding model — stores pre-computed vector embeddings for menu items.

Each row represents one embedding snapshot for a (tenant, item, model, version)
combination.  The content_hash field lets the upsert pipeline skip re-embedding
when the canonical text hasn't changed.

Tenant isolation: tenant_id is always present so every query can be scoped to a
single restaurant without cross-tenant leakage.
"""

from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base

try:
    from pgvector.sqlalchemy import Vector as PGVector
    _VECTOR_AVAILABLE = True
except ImportError:  # pgvector not installed — fall back to JSON blob (no similarity search)
    from sqlalchemy import JSON as PGVector
    _VECTOR_AVAILABLE = False


class MenuItemEmbedding(Base):
    """
    Persisted embedding for a single menu item.

    Unique key: (tenant_id, menu_item_id, embedding_model, embedding_version)
    so each logical model/version slot has exactly one row per item per tenant.
    """
    __tablename__ = "menu_item_embeddings"

    id = Column(Integer, primary_key=True, index=True)

    # Tenant scope — never omit from queries.
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    # Which menu item this embedding belongs to.
    # CASCADE DELETE keeps the embeddings table tidy when items are removed.
    menu_item_id = Column(
        Integer,
        ForeignKey("menu_items.id", ondelete="CASCADE"),
        nullable=False,
    )

    # The vector itself.  Dimension must match EMBEDDING_DIM in settings
    # (default 1536 for text-embedding-3-small).
    # Uses pgvector's Vector type when the extension is available; falls back
    # to a JSON column (which disables vector similarity search but keeps the
    # rest of the pipeline functional for hashing / keyword-only fallback).
    embedding = Column(PGVector(1536) if _VECTOR_AVAILABLE else PGVector, nullable=True)

    # Which model + logical version produced this embedding.
    # Storing both lets you run A/B migrations: keep old embeddings live while
    # back-filling new ones, then swap the active version with a config change.
    embedding_model = Column(String(100), nullable=False, default="text-embedding-3-small")
    embedding_version = Column(String(50), nullable=False, default="v1")

    # SHA-256 hex digest of the canonical embedding text.
    # Re-embedding is skipped when this matches the hash of the current item text.
    content_hash = Column(String(64), nullable=False)

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "menu_item_id",
            "embedding_model",
            "embedding_version",
            name="uq_menu_item_embeddings_tenant_item_model_version",
        ),
    )
