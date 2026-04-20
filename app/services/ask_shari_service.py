"""
Ask Shari — LLM explanation + formatting layer.

Design philosophy:
  * The retrieval system (hybrid_search) is the source of truth.
  * The LLM's only job is to write ONE short paragraph recommending 3 items
    from the ranked slice we hand it, using markdown bold (**Item Name**) to
    reference each item so the frontend can linkify them into modal openers.
  * If anything goes wrong (no API key, timeout, bad JSON, hallucinated names
    inside **...**), we fall back to a template narrative built from the
    top-ranked retrieval results so the UI stays fast and correct.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Optional

from app.core.config import settings
from app.models.menu import MenuItem
from app.services import ask_shari_cache
from app.services.embedding_service import hybrid_search

logger = logging.getLogger(__name__)


# ── LLM prompt ───────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = (
    "You are Shari, a warm and concise sushi restaurant recommender. "
    "You are given a customer query and a short list of menu items the "
    "retrieval system has already selected. Write ONE short, friendly "
    "paragraph (2-4 sentences, max ~70 words total) that recommends up to 3 "
    "items from the list and briefly explains why each one fits the query.\n\n"
    "Strict rules:\n"
    "1. Reference items using markdown bold: **Item Name**. The text inside "
    "the ** markers MUST match a name from the provided list EXACTLY (same "
    "spelling and casing). Do not invent, rename, combine, or abbreviate items.\n"
    "2. Mention up to 3 items, ordered best-fit first. Prefer 3 when possible.\n"
    "3. Ground each reason in the item's tags / description — do not fabricate "
    "ingredients, heat levels, or claims.\n"
    "4. Write flowing prose, not a bulleted list. Vary sentence structure.\n"
    "5. Also return a short `follow_up` line (one sentence) hinting that more "
    "items are available (e.g. \"Want a few more suggestions?\").\n"
    "6. Output MUST be valid JSON: {\"narrative\": \"...\", \"follow_up\": \"...\"} — "
    "nothing else."
)

_SCHEMA_HINT = (
    "Schema:\n"
    "{\n"
    '  "narrative": "<one short paragraph using **Item Name** for each pick>",\n'
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
        # Retrieval signal — lets the LLM know how confident the system is, but
        # it must not invent anything on top.
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


# ── Narrative parsing ────────────────────────────────────────────────────────

_BOLD_TOKEN_RE = re.compile(r"\*\*([^*\n]+?)\*\*")


def _extract_bold_tokens(narrative: str) -> list[str]:
    """Return every `**...**` span in `narrative`, preserving order."""
    return [m.group(1).strip() for m in _BOLD_TOKEN_RE.finditer(narrative) if m.group(1).strip()]


def _build_fallback_narrative(items: list[dict]) -> str:
    """
    Template narrative used when the LLM is disabled / times out / produces bad
    output.  Always mentions its items with `**Name**` so the frontend renders
    them identically to an LLM-authored narrative.
    """
    top = items[:3]
    if not top:
        return ""
    if len(top) == 1:
        return f"Try the **{top[0]['name']}** — our top match for what you're looking for."
    if len(top) == 2:
        return (
            f"Two picks worth trying: **{top[0]['name']}** and **{top[1]['name']}** — "
            f"both match your search closely."
        )
    return (
        f"A few picks for you: **{top[0]['name']}**, **{top[1]['name']}**, "
        f"and **{top[2]['name']}** — each one lines up well with what you're after."
    )


def _build_featured(narrative: str, allowed_by_lower: dict[str, dict]) -> list[dict]:
    """
    Extract the `**...**` tokens from `narrative` (in order, deduplicated) and
    resolve each to the corresponding public item dict.  Tokens that don't
    match an allowed name are skipped — but `_validate_narrative` should have
    already rejected such narratives, so this is belt-and-suspenders.
    """
    featured: list[dict] = []
    seen_ids: set[int] = set()
    for token in _extract_bold_tokens(narrative):
        item = allowed_by_lower.get(token.lower())
        if item is None or item["id"] in seen_ids:
            continue
        seen_ids.add(item["id"])
        featured.append({"id": item["id"], "name": item["name"], "item": item})
    return featured


def _validate_narrative(narrative: str, allowed_by_lower: dict[str, dict]) -> bool:
    """
    The no-hallucination guard for free-text output.

    Accepts the narrative only when:
      * there's at least one `**...**` token, and
      * every `**...**` token maps to an item we actually handed the LLM.

    Anything else and we discard the LLM output and use the template fallback.
    """
    tokens = _extract_bold_tokens(narrative)
    if not tokens:
        return False
    unknown = [t for t in tokens if t.lower() not in allowed_by_lower]
    if unknown:
        logger.info("Ask Shari dropping narrative with unknown items: %r", unknown)
        return False
    return True


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
        "narrative": "<one paragraph with **Item Name** for each pick>",
        "featured": [{id, name, item}, ...],  # items mentioned in narrative order
        "follow_up": "...",
        "results": [item, ...],               # full ranked list (top_k)
        "more_count": int,                    # len(results) - len(featured)
        "scoring_method": "hybrid" | "keyword_only",
        "llm_used": bool,
        "cache_hit": bool,
      }
    """
    # ── Cache lookup ────────────────────────────────────────────────────────
    cached = ask_shari_cache.get_cached(tenant_id, query)
    if cached is not None:
        return {**cached, "cache_hit": True}

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
            "narrative": "",
            "featured": [],
            "follow_up": "I couldn't find anything matching that — try describing it differently?",
            "results": [],
            "more_count": 0,
            "scoring_method": retrieval["scoring_method"],
            "llm_used": False,
            "cache_hit": False,
        }
        ask_shari_cache.set_cached(tenant_id, query, response)
        return response

    # ── LLM call on the top slice ───────────────────────────────────────────
    llm_slice_entries = entries[: settings.ASK_SHARI_LLM_ITEMS]
    llm_input = [_item_for_llm(e) for e in llm_slice_entries]
    allowed_by_lower = {
        item["name"].lower(): item for item in public_items[: settings.ASK_SHARI_LLM_ITEMS]
    }

    llm_raw = _call_llm(query, llm_input)

    narrative = ""
    follow_up = "Would you like a few more suggestions?"
    llm_used = False

    if llm_raw is not None:
        candidate_narrative = str(llm_raw.get("narrative") or "").strip()
        candidate_follow_up = str(llm_raw.get("follow_up") or "").strip()

        if candidate_narrative and _validate_narrative(candidate_narrative, allowed_by_lower):
            narrative = candidate_narrative
            llm_used = True
            if candidate_follow_up:
                follow_up = candidate_follow_up

    # Fallback to a template narrative when the LLM was skipped, failed, or
    # produced a hallucinated response.
    if not narrative:
        narrative = _build_fallback_narrative(public_items)

    featured = _build_featured(narrative, allowed_by_lower)
    more_count = max(0, len(public_items) - len(featured))

    response = {
        "narrative": narrative,
        "featured": featured,
        "follow_up": follow_up,
        "results": public_items,
        "more_count": more_count,
        "scoring_method": retrieval["scoring_method"],
        "llm_used": llm_used,
        "cache_hit": False,
    }

    ask_shari_cache.set_cached(tenant_id, query, response)
    return response
