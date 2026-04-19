"""
Embedding service for semantic menu search.

Responsibilities:
  1. build_menu_item_embedding_text — deterministic canonical text per item
  2. embed_texts — batch OpenAI embedding call with retry + backoff
  3. compute_keyword_score — 0-1 keyword relevance score (tag-aware)
  4. upsert_menu_item_embeddings — hash-gated upsert for one tenant
  5. reindex_tenant_menu_embeddings — full rebuild (delete + re-embed)
  6. hybrid_search — combine semantic + keyword scores for a query

All operations that touch the database accept a `tenant_id` argument and
filter by it unconditionally — there is no path that leaks cross-tenant data.
"""

import hashlib
import logging
import time
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.models.embeddings import MenuItemEmbedding
from app.models.menu import MenuItem

logger = logging.getLogger(__name__)


# ── Canonical text ────────────────────────────────────────────────────────────

def build_menu_item_embedding_text(item: MenuItem) -> str:
    """
    Build a stable, human-readable text payload for an item.

    Field order and casing are fixed so the same item always produces the same
    text (and therefore the same content_hash) regardless of query ordering.
    """
    price = float(item.price)
    if price < 10:
        price_bucket = "budget"
    elif price < 20:
        price_bucket = "mid"
    else:
        price_bucket = "premium"

    # Sort tags alphabetically for stable ordering
    tag_names = ", ".join(sorted(t.name.lower() for t in (item.tags or []))) or "none"
    category_name = (item.category.name if item.category else "uncategorized").strip()
    description = (item.description or "").strip()
    meal_period = (
        item.meal_period.value if hasattr(item.meal_period, "value") else str(item.meal_period)
    )

    return (
        f"Name: {item.name.strip()}\n"
        f"Category: {category_name}\n"
        f"Description: {description}\n"
        f"Tags: {tag_names}\n"
        f"PriceBucket: {price_bucket}\n"
        f"MealPeriod: {meal_period}"
    )


def _content_hash(text: str) -> str:
    """SHA-256 hex digest of the canonical embedding text."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ── OpenAI embedding call ─────────────────────────────────────────────────────

def _get_openai_client():
    """Return an OpenAI client, or None if the package/key is unavailable."""
    if not settings.OPENAI_API_KEY:
        return None
    try:
        from openai import OpenAI
        return OpenAI(api_key=settings.OPENAI_API_KEY)
    except ImportError:
        logger.warning("openai package not installed — semantic search disabled")
        return None


def embed_texts(texts: list[str]) -> Optional[list[list[float]]]:
    """
    Embed a list of texts via the configured OpenAI model.

    Returns a list of float vectors in the same order as `texts`, or None if
    the embedding service is unavailable after 3 attempts.

    Retries with exponential back-off (1s, 2s, 4s) on transient failures.
    """
    client = _get_openai_client()
    if client is None:
        return None

    for attempt in range(3):
        try:
            response = client.embeddings.create(
                model=settings.EMBEDDING_MODEL,
                input=texts,
            )
            return [e.embedding for e in response.data]
        except Exception as exc:
            wait = 2 ** attempt
            logger.warning(
                "Embedding attempt %d/%d failed: %s — retrying in %ds",
                attempt + 1, 3, exc, wait,
            )
            if attempt < 2:
                time.sleep(wait)

    logger.error("All embedding attempts failed for batch of %d texts", len(texts))
    return None


# ── Keyword scoring ───────────────────────────────────────────────────────────

def compute_keyword_score(item: MenuItem, query: str) -> float:
    """
    Compute a 0-1 keyword relevance score for `item` against `query`.

    Scoring tiers (highest applicable wins, additive for tags):
      1.0  exact name match
      0.9  name contains entire query substring
      0.7  name contains all individual query words
      0.5+ proportional name word overlap
      0.4+ proportional description word overlap
      0.3+ proportional tag word overlap
    """
    q = query.lower().strip()
    if not q:
        return 0.0

    q_words = q.split()
    n_words = len(q_words)

    name_lower = item.name.lower()
    desc_lower = (item.description or "").lower()
    tag_names = [t.name.lower() for t in (item.tags or [])]

    # Exact name match
    if q == name_lower:
        return 1.0

    score = 0.0

    # Full substring in name
    if q in name_lower:
        score = max(score, 0.9)

    # All query words in name
    name_words_matched = sum(1 for w in q_words if w in name_lower)
    if name_words_matched == n_words:
        score = max(score, 0.7)
    elif name_words_matched > 0:
        score = max(score, 0.5 * name_words_matched / n_words)

    # Description overlap
    desc_words_matched = sum(1 for w in q_words if w in desc_lower)
    if desc_words_matched > 0:
        score = max(score, 0.4 * desc_words_matched / n_words)

    # Tag overlap — reward queries that hit tag text (e.g. "vegetarian", "spicy")
    tag_words_matched = sum(
        1 for w in q_words if any(w in tag for tag in tag_names)
    )
    if tag_words_matched > 0:
        score = max(score, 0.35 * tag_words_matched / n_words)

    return min(score, 1.0)


# ── Upsert pipeline ───────────────────────────────────────────────────────────

def upsert_menu_item_embeddings(
    db: Session,
    tenant_id: int,
    item_ids: Optional[list[int]] = None,
) -> dict:
    """
    Embed and upsert embeddings for active menu items belonging to `tenant_id`.

    If `item_ids` is provided, only those items are processed (used for
    incremental updates triggered by individual CRUD operations).

    Skips items whose content_hash hasn't changed — safe to call repeatedly.

    Returns a summary dict: {skipped, upserted, failed, total}.
    """
    model = settings.EMBEDDING_MODEL
    version = settings.EMBEDDING_VERSION

    query = (
        db.query(MenuItem)
        .options(joinedload(MenuItem.category), joinedload(MenuItem.tags))
        .filter(MenuItem.tenant_id == tenant_id, MenuItem.is_available == True)
    )
    if item_ids:
        query = query.filter(MenuItem.id.in_(item_ids))

    items = query.all()
    if not items:
        return {"skipped": 0, "upserted": 0, "failed": 0, "total": 0}

    # Determine which items actually need re-embedding
    to_embed: list[tuple[MenuItem, str, str]] = []  # (item, canonical_text, content_hash)
    skipped = 0

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
        if existing and existing.content_hash == chash:
            skipped += 1
            continue

        to_embed.append((item, text, chash))

    if not to_embed:
        return {"skipped": skipped, "upserted": 0, "failed": 0, "total": len(items)}

    # Batch embed in chunks of 100 to respect API token limits
    BATCH_SIZE = 100
    upserted = 0
    failed = 0

    for i in range(0, len(to_embed), BATCH_SIZE):
        batch = to_embed[i : i + BATCH_SIZE]
        texts = [text for _, text, _ in batch]

        vectors = embed_texts(texts)
        if vectors is None:
            for item, _, _ in batch:
                logger.error(
                    "Embedding failed for item id=%d name=%r tenant=%d",
                    item.id, item.name, tenant_id,
                )
            failed += len(batch)
            continue

        for (item, _, chash), vector in zip(batch, vectors):
            try:
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
                if existing:
                    existing.embedding = vector
                    existing.content_hash = chash
                else:
                    db.add(
                        MenuItemEmbedding(
                            tenant_id=tenant_id,
                            menu_item_id=item.id,
                            embedding=vector,
                            embedding_model=model,
                            embedding_version=version,
                            content_hash=chash,
                        )
                    )
                upserted += 1
            except Exception as exc:
                logger.error(
                    "DB upsert failed for item id=%d: %s", item.id, exc
                )
                failed += 1

        db.commit()

    logger.info(
        "Embedding upsert complete — tenant=%d total=%d skipped=%d upserted=%d failed=%d",
        tenant_id, len(items), skipped, upserted, failed,
    )
    return {"skipped": skipped, "upserted": upserted, "failed": failed, "total": len(items)}


def reindex_tenant_menu_embeddings(db: Session, tenant_id: int) -> dict:
    """
    Full rebuild: delete all existing embeddings for this tenant/model/version,
    then re-embed every active item.

    Use this when:
      - Bumping EMBEDDING_VERSION to force-regenerate all vectors
      - Switching EMBEDDING_MODEL (also requires a new migration for the dimension)
      - Recovering from a partial or corrupt index
    """
    model = settings.EMBEDDING_MODEL
    version = settings.EMBEDDING_VERSION

    deleted = (
        db.query(MenuItemEmbedding)
        .filter(
            MenuItemEmbedding.tenant_id == tenant_id,
            MenuItemEmbedding.embedding_model == model,
            MenuItemEmbedding.embedding_version == version,
        )
        .delete()
    )
    db.commit()
    logger.info(
        "Deleted %d embeddings for tenant=%d model=%s version=%s",
        deleted, tenant_id, model, version,
    )

    return upsert_menu_item_embeddings(db, tenant_id)


# ── Hybrid search ─────────────────────────────────────────────────────────────

def hybrid_search(
    db: Session,
    tenant_id: int,
    query: str,
    *,
    category_id: Optional[int] = None,
    meal_period: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    top_k: int = 20,
    debug: bool = False,
) -> dict:
    """
    Return ranked menu items for `query` using hybrid semantic + keyword scoring.

    Pipeline:
      1. Compute query embedding.
      2. Fetch top-N candidates for this tenant by cosine similarity.
      3. Load MenuItem objects and apply optional filters.
      4. Compute keyword score for each candidate.
      5. Combine: hybrid = SEMANTIC_WEIGHT * sem + KEYWORD_WEIGHT * kw.
      6. Sort by hybrid score and return top_k.

    Falls back gracefully to keyword-only search if:
      - OPENAI_API_KEY is not set
      - The embeddings table has no rows for this tenant
      - The embedding service is unavailable

    Returns:
      {
        "results": [{"item": MenuItem, "hybrid_score", "semantic_score", "keyword_score"}, ...],
        "total_candidates": int,
        "scoring_method": "hybrid" | "keyword_only",
        "model": str | None,
        "version": str | None,
      }
    """
    model = settings.EMBEDDING_MODEL
    version = settings.EMBEDDING_VERSION
    sem_w = settings.SEARCH_SEMANTIC_WEIGHT
    kw_w = settings.SEARCH_KEYWORD_WEIGHT
    fetch_limit = settings.SEARCH_FETCH_CANDIDATES

    # ── Step 1: try semantic path ─────────────────────────────────────────────
    semantic_scores: dict[int, float] = {}  # menu_item_id → cosine similarity
    scoring_method = "keyword_only"
    active_model = None
    active_version = None

    query_vectors = embed_texts([query])
    if query_vectors is not None:
        query_vec = query_vectors[0]
        vec_str = "[" + ",".join(f"{x:.8f}" for x in query_vec) + "]"

        try:
            from sqlalchemy import text as sa_text
            rows = db.execute(
                sa_text("""
                    SELECT menu_item_id,
                           1.0 - (embedding <=> CAST(:vec AS vector)) AS cosine_sim
                    FROM menu_item_embeddings
                    WHERE tenant_id   = :tenant_id
                      AND embedding_model   = :model
                      AND embedding_version = :version
                    ORDER BY embedding <=> CAST(:vec AS vector)
                    LIMIT :lim
                """),
                {
                    "vec": vec_str,
                    "tenant_id": tenant_id,
                    "model": model,
                    "version": version,
                    "lim": fetch_limit,
                },
            ).fetchall()

            if rows:
                for row in rows:
                    # cosine_sim is already 0-1 for normalised text embeddings
                    semantic_scores[row.menu_item_id] = max(0.0, float(row.cosine_sim))
                scoring_method = "hybrid"
                active_model = model
                active_version = version
            else:
                logger.info(
                    "No embeddings found for tenant=%d model=%s version=%s — keyword-only",
                    tenant_id, model, version,
                )
        except Exception as exc:
            logger.warning("Vector search failed, falling back to keyword-only: %s", exc)

    # ── Step 2: load candidate items ─────────────────────────────────────────
    # When we have semantic scores, restrict to those item IDs.
    # When keyword-only, query the full tenant table (applying price/category filters
    # in SQL to avoid loading thousands of rows).
    item_query = (
        db.query(MenuItem)
        .options(joinedload(MenuItem.category), joinedload(MenuItem.tags))
        .filter(MenuItem.tenant_id == tenant_id)
    )

    if semantic_scores:
        item_query = item_query.filter(MenuItem.id.in_(list(semantic_scores.keys())))
    else:
        # keyword-only: apply keyword pre-filter in SQL using ilike to shrink the
        # candidate pool, then rank in Python.
        kw_pat = f"%{query}%"
        item_query = item_query.filter(
            MenuItem.name.ilike(kw_pat) | MenuItem.description.ilike(kw_pat)
        )

    # Optional hard filters (applied in SQL regardless of scoring path)
    if category_id is not None:
        item_query = item_query.filter(MenuItem.category_id == category_id)
    if meal_period is not None:
        from app.models.menu import MealPeriodEnum
        try:
            mp_enum = MealPeriodEnum(meal_period.upper())
            item_query = item_query.filter(
                (MenuItem.meal_period == mp_enum) |
                (MenuItem.meal_period == MealPeriodEnum.BOTH)
            )
        except ValueError:
            pass  # invalid meal_period value — skip filter
    if min_price is not None:
        item_query = item_query.filter(MenuItem.price >= min_price)
    if max_price is not None:
        item_query = item_query.filter(MenuItem.price <= max_price)

    candidates = item_query.all()
    total_candidates = len(candidates)

    # ── Step 3: score + rank ──────────────────────────────────────────────────
    results = []
    for item in candidates:
        sem_score = semantic_scores.get(item.id, 0.0)
        kw_score = compute_keyword_score(item, query)

        if scoring_method == "hybrid":
            hybrid_score = sem_w * sem_score + kw_w * kw_score
        else:
            hybrid_score = kw_score

        results.append({
            "item": item,
            "hybrid_score": round(hybrid_score, 4),
            "semantic_score": round(sem_score, 4) if debug else None,
            "keyword_score": round(kw_score, 4) if debug else None,
        })

    results.sort(key=lambda r: r["hybrid_score"], reverse=True)

    return {
        "results": results[:top_k],
        "total_candidates": total_candidates,
        "scoring_method": scoring_method,
        "model": active_model,
        "version": active_version,
    }
