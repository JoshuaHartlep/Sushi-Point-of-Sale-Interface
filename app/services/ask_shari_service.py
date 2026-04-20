"""
Ask Shari — LLM explanation + formatting layer.

Design philosophy:
  * The retrieval system (hybrid_search) is the source of truth.
  * The LLM's only job is to *choose* and *explain* 3-5 items from the
    top-ranked slice we hand it.  It never invents items.
  * If anything goes wrong (no API key, timeout, bad JSON, hallucinated names),
    we return a retrieval-only response so the UI stays fast and correct.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

from app.core.config import settings
from app.models.menu import MenuItem
from app.services import ask_shari_cache
from app.services.embedding_service import hybrid_search

logger = logging.getLogger(__name__)


# ── LLM prompt ───────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = (
    "You are Shari, a concise sushi restaurant recommender. "
    "You are given a customer query and a short list of menu items that the "
    "retrieval system has already selected. Your job is to pick the 3-5 best "
    "items for the customer and explain, briefly, why.\n\n"
    "Strict rules:\n"
    "1. Only recommend items whose name appears EXACTLY in the provided list. "
    "Do not invent, rename, or combine items.\n"
    "2. Return at least 3 recommendations and at most 5, always in ranked order "
    "(best first).\n"
    "3. For each item, write one short reason (max 20 words) that references "
    "the query. Use the item's tags / description for grounding; do not fabricate "
    "ingredients.\n"
    "4. Each item's `highlights` must be 1-3 short tags/phrases copied or "
    "lightly paraphrased from the item's own tags / description.\n"
    "5. Close with a single `follow_up` line that hints more items are "
    "available (e.g. \"Want a few more suggestions?\").\n"
    "6. Output MUST be valid JSON matching the schema provided. No extra prose."
)

_SCHEMA_HINT = (
    "Schema:\n"
    "{\n"
    '  "recommendations": [\n'
    '    {"name": "<exact menu item name>", "reason": "<=20 words>", '
    '"highlights": ["<tag or phrase>", ...]}\n'
    "  ],\n"
    '  "follow_up": "<short sentence>"\n'
    "}"
)


def _build_user_prompt(query: str, items_payload: list[dict]) -> str:
    """Compact payload string for the user turn — small, stable, JSON-parseable."""
    return (
        f"Customer query: {query!r}\n\n"
        f"Available menu items (only these are valid):\n"
        f"{json.dumps(items_payload, ensure_ascii=False)}\n\n"
        f"{_SCHEMA_HINT}"
    )


# ── LLM input shaping ────────────────────────────────────────────────────────

def _price_bucket(price: float) -> str:
    if price < 10:
        return "budget"
    if price < 20:
        return "mid"
    return "premium"


def _item_for_llm(entry: dict) -> dict:
    """
    Build a compact dict describing one item for the LLM.

    Pulls structured signals straight off the MenuItem ORM object so the prompt
    stays small (roughly 80-120 tokens per item).
    """
    item: MenuItem = entry["item"]
    price = float(item.price)
    tag_names = sorted(t.name for t in (item.tags or []))
    return {
        "name": item.name,
        "description": (item.description or "").strip() or None,
        "tags": tag_names,
        "price_bucket": _price_bucket(price),
        "price": round(price, 2),
        # Retrieval signals the LLM can use to justify a pick, but must not invent.
        "retrieval_score": entry.get("hybrid_score"),
    }


def _public_item(entry: dict) -> dict:
    """Trim the hybrid_search entry to a JSON-safe shape for the wire response."""
    item: MenuItem = entry["item"]
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "price": float(item.price),
        "ayce_surcharge": float(item.ayce_surcharge) if item.ayce_surcharge is not None else 0.0,
        "category_id": item.category_id,
        "is_available": item.is_available,
        "meal_period": (
            item.meal_period.value if hasattr(item.meal_period, "value") else str(item.meal_period)
        ),
        "image_url": item.image_url,
        "image_position_x": item.image_position_x,
        "image_position_y": item.image_position_y,
        "image_zoom": item.image_zoom,
        "hybrid_score": entry.get("hybrid_score"),
    }


# ── LLM call ─────────────────────────────────────────────────────────────────

def _call_llm(query: str, llm_items: list[dict]) -> Optional[dict]:
    """
    Call the chat model with a tight timeout + JSON response format.

    Returns the parsed JSON dict on success, None on any failure.  All failure
    paths are treated equivalently — the caller falls back to retrieval-only.
    """
    if not settings.OPENAI_API_KEY:
        logger.info("Ask Shari LLM disabled (OPENAI_API_KEY missing)")
        return None
    try:
        from openai import OpenAI
    except ImportError:
        logger.warning("openai package not installed — Ask Shari LLM disabled")
        return None

    client = OpenAI(
        api_key=settings.OPENAI_API_KEY,
        timeout=settings.ASK_SHARI_TIMEOUT_S,
    )

    started = time.monotonic()
    try:
        response = client.chat.completions.create(
            model=settings.ASK_SHARI_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": _build_user_prompt(query, llm_items)},
            ],
            # Deterministic output — same query + same items → same explanation.
            temperature=0.0,
            max_tokens=settings.ASK_SHARI_MAX_TOKENS,
            response_format={"type": "json_object"},
        )
    except Exception as exc:
        elapsed_ms = (time.monotonic() - started) * 1000
        logger.warning("Ask Shari LLM call failed after %.0fms: %s", elapsed_ms, exc)
        return None

    elapsed_ms = (time.monotonic() - started) * 1000
    content = response.choices[0].message.content or ""
    logger.info(
        "Ask Shari LLM ok — latency=%.0fms model=%s tokens=%s",
        elapsed_ms,
        settings.ASK_SHARI_MODEL,
        getattr(response, "usage", None),
    )

    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        logger.warning("Ask Shari LLM returned invalid JSON (%s): %s", exc, content[:200])
        return None


# ── Response validation ──────────────────────────────────────────────────────

def _sanitize_recommendations(
    raw: Any,
    allowed_names: dict[str, dict],  # name → public item dict
) -> list[dict]:
    """
    Enforce the no-hallucination rule.

    Accepts only recommendations whose `name` exists verbatim (case-insensitive)
    in the list we handed the LLM.  Each valid recommendation is enriched with
    the item's id / price / image so the frontend can render it without a
    second lookup.
    """
    if not isinstance(raw, list):
        return []

    # Lookup is case-insensitive because OpenAI sometimes normalises casing.
    by_lower = {name.lower(): item for name, item in allowed_names.items()}
    cleaned: list[dict] = []
    seen: set[int] = set()

    for rec in raw:
        if not isinstance(rec, dict):
            continue
        name = str(rec.get("name", "")).strip()
        item = by_lower.get(name.lower())
        if item is None:
            logger.info("Dropping hallucinated recommendation: %r", name)
            continue
        if item["id"] in seen:
            continue  # LLM occasionally duplicates a name; keep first only
        seen.add(item["id"])

        reason = str(rec.get("reason", "")).strip()
        highlights_raw = rec.get("highlights") or []
        if not isinstance(highlights_raw, list):
            highlights_raw = []
        highlights = [str(h).strip() for h in highlights_raw if str(h).strip()][:3]

        cleaned.append({
            "id": item["id"],
            "name": item["name"],
            "reason": reason,
            "highlights": highlights,
            "item": item,
        })

    # Schema says 3-5 — cap at 5; if fewer than 3 survived we'll backfill later.
    return cleaned[:5]


# ── Public entry point ───────────────────────────────────────────────────────

def ask_shari(
    db,
    tenant_id: int,
    query: str,
    *,
    category_id: Optional[int] = None,
    meal_period: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
) -> dict:
    """
    Run the full Ask Shari pipeline and return a response dict ready for the API.

    Shape:
      {
        "recommendations": [{id, name, reason, highlights, item}, ...],
        "follow_up": "...",
        "results": [item, ...],          # full ranked list (top_k)
        "more_count": int,               # len(results) - len(recommendations)
        "scoring_method": "hybrid" | "keyword_only",
        "llm_used": bool,
        "cache_hit": bool,               # set by the endpoint wrapper on return
      }
    """
    # ── Cache lookup ────────────────────────────────────────────────────────
    cached = ask_shari_cache.get_cached(tenant_id, query)
    if cached is not None:
        cached = {**cached, "cache_hit": True}
        return cached

    # ── Retrieval (always runs — source of truth) ───────────────────────────
    retrieval = hybrid_search(
        db,
        tenant_id,
        query,
        category_id=category_id,
        meal_period=meal_period,
        min_price=min_price,
        max_price=max_price,
        top_k=settings.ASK_SHARI_TOP_K,
    )

    entries = retrieval["results"]
    public_items = [_public_item(e) for e in entries]

    # Zero-result case — skip the LLM entirely.
    if not entries:
        response = {
            "recommendations": [],
            "follow_up": "I couldn't find anything matching that — try describing it differently?",
            "results": [],
            "more_count": 0,
            "scoring_method": retrieval["scoring_method"],
            "llm_used": False,
            "cache_hit": False,
        }
        ask_shari_cache.set_cached(tenant_id, query, {**response, "cache_hit": False})
        return response

    # ── LLM call on the top slice ───────────────────────────────────────────
    llm_slice_entries = entries[: settings.ASK_SHARI_LLM_ITEMS]
    llm_input = [_item_for_llm(e) for e in llm_slice_entries]
    allowed_names = {item["name"]: item for item in public_items[: settings.ASK_SHARI_LLM_ITEMS]}

    llm_raw = _call_llm(query, llm_input)

    recommendations: list[dict] = []
    follow_up = "Would you like more suggestions?"
    llm_used = False

    if llm_raw is not None:
        recommendations = _sanitize_recommendations(
            llm_raw.get("recommendations"), allowed_names
        )
        if recommendations:
            llm_used = True
            fu = str(llm_raw.get("follow_up", "")).strip()
            if fu:
                follow_up = fu

    # Fallback / backfill: if the LLM produced fewer than 3 valid recs (or was
    # skipped entirely), use the top retrieval results in their ranked order.
    if len(recommendations) < 3:
        existing_ids = {r["id"] for r in recommendations}
        for item in public_items[: settings.ASK_SHARI_LLM_ITEMS]:
            if len(recommendations) >= 3:
                break
            if item["id"] in existing_ids:
                continue
            recommendations.append({
                "id": item["id"],
                "name": item["name"],
                "reason": "Top match for your query based on our retrieval ranking.",
                "highlights": [],
                "item": item,
            })

    rec_ids = {r["id"] for r in recommendations}
    more_count = max(0, len(public_items) - len(rec_ids))

    response = {
        "recommendations": recommendations,
        "follow_up": follow_up,
        "results": public_items,
        "more_count": more_count,
        "scoring_method": retrieval["scoring_method"],
        "llm_used": llm_used,
        "cache_hit": False,
    }

    ask_shari_cache.set_cached(tenant_id, query, response)
    return response
