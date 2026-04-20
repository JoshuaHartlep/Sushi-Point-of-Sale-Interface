"""
Tests for the Ask Shari LLM explanation layer.

Coverage:
  - Cache: hit/miss, invalidation, tenant isolation, query normalization
  - Service: LLM fallback on failure, hallucination filtering, backfill,
    tenant-scoped retrieval, schema shape
  - Response schema (Pydantic round-trip) with `llm_used`, `cache_hit`,
    `more_count`, and `recommendations`/`results`
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch


# ── Fakes ─────────────────────────────────────────────────────────────────────

def _make_item(
    *,
    id: int,
    tenant_id: int = 1,
    name: str = "Spicy Tuna Roll",
    description: str = "Fresh tuna with a kick",
    price: float = 12.0,
    tags: list[str] | None = None,
    meal_period: str = "BOTH",
    category_id: int = 1,
) -> SimpleNamespace:
    tag_objs = [SimpleNamespace(name=t, slug=t, tag_group="flavor") for t in (tags or [])]
    return SimpleNamespace(
        id=id,
        tenant_id=tenant_id,
        name=name,
        description=description,
        price=price,
        ayce_surcharge=0.0,
        category_id=category_id,
        is_available=True,
        meal_period=SimpleNamespace(value=meal_period),
        image_url=None,
        image_position_x=50.0,
        image_position_y=50.0,
        image_zoom=1.0,
        tags=tag_objs,
        category=SimpleNamespace(name="Specialty Rolls"),
    )


def _retrieval_result(items: list, scoring_method: str = "hybrid") -> dict:
    """Mimic what hybrid_search returns."""
    return {
        "results": [
            {"item": item, "hybrid_score": 1.0 - (i * 0.05), "semantic_score": None, "keyword_score": None}
            for i, item in enumerate(items)
        ],
        "total_candidates": len(items),
        "scoring_method": scoring_method,
        "model": "text-embedding-3-small" if scoring_method == "hybrid" else None,
        "version": "v1" if scoring_method == "hybrid" else None,
    }


# ── Cache ─────────────────────────────────────────────────────────────────────

class TestAskShariCache(unittest.TestCase):

    def setUp(self):
        from app.services import ask_shari_cache
        ask_shari_cache.reset_for_tests()

    def test_normalize_query_whitespace_and_case(self):
        from app.services.ask_shari_cache import normalize_query
        self.assertEqual(normalize_query("  Spicy   Tuna  "), "spicy tuna")
        self.assertEqual(normalize_query("SPICY tuna"), "spicy tuna")

    def test_set_then_get_hits(self):
        from app.services import ask_shari_cache
        ask_shari_cache.set_cached(1, "spicy tuna", {"ok": True})
        self.assertEqual(ask_shari_cache.get_cached(1, "spicy tuna"), {"ok": True})

    def test_miss_returns_none(self):
        from app.services import ask_shari_cache
        self.assertIsNone(ask_shari_cache.get_cached(1, "nothing cached"))

    def test_normalization_makes_queries_equivalent(self):
        from app.services import ask_shari_cache
        ask_shari_cache.set_cached(1, "Spicy Tuna", {"ok": True})
        # Different casing + whitespace should still hit the same entry
        self.assertEqual(ask_shari_cache.get_cached(1, "  spicy   tuna "), {"ok": True})

    def test_tenant_isolation(self):
        from app.services import ask_shari_cache
        ask_shari_cache.set_cached(1, "spicy tuna", {"tenant": 1})
        ask_shari_cache.set_cached(2, "spicy tuna", {"tenant": 2})
        # Each tenant sees only its own entry
        self.assertEqual(ask_shari_cache.get_cached(1, "spicy tuna"), {"tenant": 1})
        self.assertEqual(ask_shari_cache.get_cached(2, "spicy tuna"), {"tenant": 2})

    def test_bump_menu_version_invalidates(self):
        from app.services import ask_shari_cache
        ask_shari_cache.set_cached(1, "spicy tuna", {"stale": True})
        ask_shari_cache.bump_menu_version(1)
        self.assertIsNone(ask_shari_cache.get_cached(1, "spicy tuna"))
        # Other tenants untouched
        ask_shari_cache.set_cached(2, "vegan", {"fresh": True})
        ask_shari_cache.bump_menu_version(1)
        self.assertEqual(ask_shari_cache.get_cached(2, "vegan"), {"fresh": True})

    def test_ttl_expiry(self):
        from app.services import ask_shari_cache
        ask_shari_cache.set_cached(1, "q", {"v": 1}, ttl_s=1)
        with patch("app.services.ask_shari_cache.time.time", return_value=9_999_999_999):
            self.assertIsNone(ask_shari_cache.get_cached(1, "q"))


# ── Service: LLM fallback + hallucination guard ───────────────────────────────

class TestAskShariService(unittest.TestCase):

    def setUp(self):
        from app.services import ask_shari_cache
        ask_shari_cache.reset_for_tests()

    def test_falls_back_when_llm_returns_none(self):
        """If the LLM call fails (timeout, no key, bad JSON), we backfill from retrieval."""
        from app.services import ask_shari_service

        items = [
            _make_item(id=1, name="Spicy Tuna Roll", tags=["spicy", "tuna"]),
            _make_item(id=2, name="Salmon Nigiri", tags=["salmon"]),
            _make_item(id=3, name="Cucumber Roll", tags=["vegetarian"]),
            _make_item(id=4, name="Dragon Roll", tags=["eel"]),
        ]

        with patch.object(ask_shari_service, "hybrid_search", return_value=_retrieval_result(items)), \
             patch.object(ask_shari_service, "_call_llm", return_value=None):
            result = ask_shari_service.ask_shari(db=None, tenant_id=1, query="spicy")

        self.assertFalse(result["llm_used"])
        # Backfilled with at least 3 recommendations from top retrieval results
        self.assertGreaterEqual(len(result["recommendations"]), 3)
        # All recommendations reference items that actually came from retrieval
        rec_ids = {r["id"] for r in result["recommendations"]}
        self.assertTrue(rec_ids.issubset({i.id for i in items}))
        # Full ranked list preserved for "more suggestions"
        self.assertEqual(len(result["results"]), 4)
        self.assertFalse(result["cache_hit"])

    def test_drops_hallucinated_items(self):
        """Recommendations whose name isn't in the provided list are dropped."""
        from app.services import ask_shari_service

        items = [
            _make_item(id=1, name="Spicy Tuna Roll"),
            _make_item(id=2, name="Salmon Nigiri"),
            _make_item(id=3, name="Dragon Roll"),
        ]
        fake_llm_response = {
            "recommendations": [
                {"name": "Spicy Tuna Roll", "reason": "Matches spicy", "highlights": ["spicy"]},
                {"name": "Made-Up Phantom Roll", "reason": "Invented", "highlights": []},
                {"name": "Salmon Nigiri", "reason": "Classic", "highlights": ["salmon"]},
            ],
            "follow_up": "Want more?",
        }

        with patch.object(ask_shari_service, "hybrid_search", return_value=_retrieval_result(items)), \
             patch.object(ask_shari_service, "_call_llm", return_value=fake_llm_response):
            result = ask_shari_service.ask_shari(db=None, tenant_id=1, query="spicy")

        rec_names = [r["name"] for r in result["recommendations"]]
        self.assertIn("Spicy Tuna Roll", rec_names)
        self.assertIn("Salmon Nigiri", rec_names)
        self.assertNotIn("Made-Up Phantom Roll", rec_names)
        self.assertTrue(result["llm_used"])
        self.assertEqual(result["follow_up"], "Want more?")

    def test_zero_retrieval_skips_llm(self):
        from app.services import ask_shari_service

        with patch.object(ask_shari_service, "hybrid_search", return_value=_retrieval_result([])), \
             patch.object(ask_shari_service, "_call_llm") as mock_llm:
            result = ask_shari_service.ask_shari(db=None, tenant_id=1, query="nonsense")

        mock_llm.assert_not_called()
        self.assertEqual(result["recommendations"], [])
        self.assertEqual(result["results"], [])
        self.assertEqual(result["more_count"], 0)
        self.assertFalse(result["llm_used"])

    def test_cache_hit_skips_retrieval_and_llm(self):
        from app.services import ask_shari_service

        items = [_make_item(id=1), _make_item(id=2), _make_item(id=3), _make_item(id=4)]

        with patch.object(ask_shari_service, "hybrid_search", return_value=_retrieval_result(items)) as mock_ret, \
             patch.object(ask_shari_service, "_call_llm", return_value=None) as mock_llm:
            # First call populates the cache
            first = ask_shari_service.ask_shari(db=None, tenant_id=1, query="spicy")
            # Second call with the same (normalized) query must return the cached dict
            second = ask_shari_service.ask_shari(db=None, tenant_id=1, query="  SPICY  ")

        self.assertEqual(mock_ret.call_count, 1)
        self.assertEqual(mock_llm.call_count, 1)
        self.assertTrue(second["cache_hit"])
        self.assertFalse(first["cache_hit"])
        # Payload identity preserved
        self.assertEqual(first["recommendations"], second["recommendations"])

    def test_tenant_cache_isolation(self):
        """Two tenants querying the same string get independent cache entries."""
        from app.services import ask_shari_service

        items_a = [_make_item(id=101, tenant_id=1, name="Tenant A Roll")] * 1
        items_b = [_make_item(id=202, tenant_id=2, name="Tenant B Roll")] * 1
        # Pad so retrieval layer has at least 3 items per tenant
        items_a += [_make_item(id=102, tenant_id=1, name="A2"), _make_item(id=103, tenant_id=1, name="A3")]
        items_b += [_make_item(id=203, tenant_id=2, name="B2"), _make_item(id=204, tenant_id=2, name="B3")]

        def fake_search(db, tenant_id, query, **kwargs):
            return _retrieval_result(items_a if tenant_id == 1 else items_b)

        with patch.object(ask_shari_service, "hybrid_search", side_effect=fake_search), \
             patch.object(ask_shari_service, "_call_llm", return_value=None):
            a = ask_shari_service.ask_shari(db=None, tenant_id=1, query="rolls")
            b = ask_shari_service.ask_shari(db=None, tenant_id=2, query="rolls")

        a_ids = {r["id"] for r in a["recommendations"]}
        b_ids = {r["id"] for r in b["recommendations"]}
        self.assertTrue(a_ids.issubset({101, 102, 103}))
        self.assertTrue(b_ids.issubset({202, 203, 204}))
        # Nothing leaks across tenants
        self.assertFalse(a_ids & b_ids)


# ── Schema (Pydantic round-trip) ──────────────────────────────────────────────

class TestAskShariSchema(unittest.TestCase):

    def test_response_schema_accepts_service_dict(self):
        """The Pydantic response model must accept the raw dict the service returns."""
        from app.schemas.menu import AskShariResponse

        item = {
            "id": 1,
            "name": "Spicy Tuna Roll",
            "description": "Fresh tuna",
            "price": 12.0,
            "ayce_surcharge": 0.0,
            "category_id": 1,
            "is_available": True,
            "meal_period": "BOTH",
            "image_url": None,
            "image_position_x": 50.0,
            "image_position_y": 50.0,
            "image_zoom": 1.0,
            "hybrid_score": 0.95,
        }
        payload = {
            "recommendations": [
                {"id": 1, "name": "Spicy Tuna Roll", "reason": "spicy", "highlights": ["spicy"], "item": item}
            ],
            "follow_up": "Want more?",
            "results": [item],
            "more_count": 0,
            "scoring_method": "hybrid",
            "llm_used": True,
            "cache_hit": False,
        }

        parsed = AskShariResponse(**payload)
        self.assertEqual(parsed.recommendations[0].name, "Spicy Tuna Roll")
        self.assertEqual(parsed.scoring_method, "hybrid")
        self.assertTrue(parsed.llm_used)


if __name__ == "__main__":
    unittest.main()
