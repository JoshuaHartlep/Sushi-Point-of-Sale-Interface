#!/usr/bin/env python
"""
Embedding reindex CLI tool.

Usage examples:

  # Backfill all tenants (hash-gated — skips unchanged items):
  python scripts/reindex_embeddings.py

  # Backfill a specific tenant only:
  python scripts/reindex_embeddings.py --tenant-id 1

  # Full rebuild for a tenant (delete all + re-embed everything):
  python scripts/reindex_embeddings.py --tenant-id 1 --full-rebuild

  # Inspect failed items (dry-run: show what would be embedded without calling the API):
  python scripts/reindex_embeddings.py --tenant-id 1 --dry-run

  # Show current index status per tenant:
  python scripts/reindex_embeddings.py --status

Runbook — rotating the embedding model/version
  1. Update EMBEDDING_MODEL and/or EMBEDDING_VERSION in .env (or env vars).
  2. Run: python scripts/reindex_embeddings.py --full-rebuild
     This deletes all rows for the old model+version and re-embeds under the new key.
  3. Restart the API server so it picks up the new settings.
  Note: If you change EMBEDDING_DIM (e.g. switching to text-embedding-3-large at 3072
  dims), you must also create a new Alembic migration before running this script.

Runbook — recovering from partial failure
  1. Run with --status to identify tenants with missing or failed embeddings.
  2. Run normally (no --full-rebuild) to retry just the missing items.
  3. Run with --full-rebuild only if you want to discard and regenerate all embeddings.
"""

import argparse
import sys
import os

# Make sure the app package is importable when running from the repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import SessionLocal
from app.core.config import settings
from app.models.tenant import Tenant
from app.models.menu import MenuItem
from app.models.embeddings import MenuItemEmbedding


def get_all_tenant_ids(db) -> list[int]:
    return [row.id for row in db.query(Tenant.id).all()]


def print_status(db) -> None:
    """Print per-tenant embedding coverage stats."""
    model = settings.EMBEDDING_MODEL
    version = settings.EMBEDDING_VERSION

    print(f"\nEmbedding index status  (model={model!r}, version={version!r})\n")
    print(f"{'Tenant':>8}  {'Active items':>12}  {'Embedded':>9}  {'Coverage':>9}")
    print("-" * 46)

    for tenant in db.query(Tenant).order_by(Tenant.id).all():
        active = db.query(MenuItem).filter(
            MenuItem.tenant_id == tenant.id,
            MenuItem.is_available == True,
        ).count()
        embedded = db.query(MenuItemEmbedding).filter(
            MenuItemEmbedding.tenant_id == tenant.id,
            MenuItemEmbedding.embedding_model == model,
            MenuItemEmbedding.embedding_version == version,
        ).count()
        pct = f"{100 * embedded / active:.0f}%" if active else "N/A"
        print(f"{tenant.id:>8}  {active:>12}  {embedded:>9}  {pct:>9}")
    print()


def dry_run(db, tenant_id: int) -> None:
    """Show which items would be embedded (content changed or missing)."""
    from app.services.embedding_service import build_menu_item_embedding_text, _content_hash
    from sqlalchemy.orm import joinedload

    model = settings.EMBEDDING_MODEL
    version = settings.EMBEDDING_VERSION

    items = (
        db.query(MenuItem)
        .options(joinedload(MenuItem.category), joinedload(MenuItem.tags))
        .filter(MenuItem.tenant_id == tenant_id, MenuItem.is_available == True)
        .all()
    )

    would_embed = []
    for item in items:
        text = build_menu_item_embedding_text(item)
        chash = _content_hash(text)
        existing = (
            db.query(MenuItemEmbedding)
            .filter(
                MenuItemEmbedding.tenant_id == tenant_id,
                MenuItemEmbedding.menu_item_id == item.id,
                MenuItemEmbedding.embedding_model == model,
                MenuItemEmbedding.embedding_version == version,
            )
            .first()
        )
        needs_embed = not existing or existing.content_hash != chash
        if needs_embed:
            would_embed.append((item.id, item.name, "new" if not existing else "changed"))

    if would_embed:
        print(f"\n[DRY RUN] Would embed {len(would_embed)} items for tenant {tenant_id}:")
        for item_id, name, reason in would_embed:
            print(f"  [{reason:>7}] id={item_id} {name!r}")
    else:
        print(f"\n[DRY RUN] All {len(items)} items are up-to-date for tenant {tenant_id}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Menu embedding reindex tool")
    parser.add_argument("--tenant-id", type=int, default=None, help="Target tenant ID (default: all tenants)")
    parser.add_argument("--full-rebuild", action="store_true", help="Delete all embeddings for tenant/model/version and re-embed from scratch")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be embedded without calling the API")
    parser.add_argument("--status", action="store_true", help="Print per-tenant index coverage stats and exit")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.status:
            print_status(db)
            return

        tenant_ids = [args.tenant_id] if args.tenant_id else get_all_tenant_ids(db)
        if not tenant_ids:
            print("No tenants found in database.")
            return

        print(f"Embedding model : {settings.EMBEDDING_MODEL}")
        print(f"Embedding version: {settings.EMBEDDING_VERSION}")
        print(f"Tenants to process: {tenant_ids}")

        for tid in tenant_ids:
            print(f"\n── Tenant {tid} ──────────────────────────────────")

            if args.dry_run:
                dry_run(db, tid)
                continue

            from app.services.embedding_service import (
                upsert_menu_item_embeddings,
                reindex_tenant_menu_embeddings,
            )

            if args.full_rebuild:
                print(f"  Full rebuild requested — deleting existing embeddings...")
                result = reindex_tenant_menu_embeddings(db, tid)
            else:
                result = upsert_menu_item_embeddings(db, tid)

            print(
                f"  total={result['total']}  "
                f"skipped={result['skipped']}  "
                f"upserted={result['upserted']}  "
                f"failed={result['failed']}"
            )
            if result["failed"] > 0:
                print(f"  WARNING: {result['failed']} items failed — check logs for details")

    finally:
        db.close()


if __name__ == "__main__":
    main()
