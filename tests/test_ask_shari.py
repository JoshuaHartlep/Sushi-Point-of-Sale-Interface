"""
Tests for the Ask Shari LLM explanation layer.

Coverage:
  - Cache: hit/miss, invalidation, tenant isolation, query normalization
  - Service: LLM fallback on failure, hallucination rejection, narrative
    parsing, featured-item extraction, tenant-scoped retrieval
  - Response schema (Pydantic round-trip) with the new narrative / featured
    / llm_used / cache_hit / more_count fields
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
        self.assertEqual(ask_shari_cache.get_cached(1, "  spicy   tuna "), {"ok": True})

    def test_tenant_isolation(self):
        from app.services import ask_shari_cache
        ask_shari_cache.set_cached(1, "spicy tuna", {"tenant": 1})
        ask_shari_cache.set_cached(2, "spicy tuna", {"tenant": 2})
        self.assertEqual(ask_shari_cache.get_cached(1, "spicy tuna"), {"tenant": 1})
        self.assertEqual(ask_shari_cache.get_cached(2, "spicy tuna"), {"tenant": 2})

    def test_bump_menu_version_invalidates(self):
        from app.services import ask_shari_cache
        ask_shari_cache.set_cached(1, "spicy tuna", {"stale": True})
        ask_shari_cache.bump_menu_version(1)
        self.assertIsNone(ask_shari_cache.get_cached(1, "spicy tuna"))
        ask_shari_cache.set_cached(2, "vegan", {"fresh": True})
        ask_shari_cache.bump_menu_version(1)
        self.assertEqual(ask_shari_cache.get_cached(2, "vegan"), {"fresh": True})

    def test_ttl_expiry(self):
        from app.services import ask_shari_cache
        ask_shari_cache.set_cached(1, "q", {"v": 1}, ttl_s=1)
        with patch("app.services.ask_shari_cache.time.time", return_value=9_999_999_999):
            self.assertIsNone(ask_shari_cache.get_cached(1, "q"))


# ── Narrative parsing helpers ────────────────────────────────────────────────

class TestNarrativeHelpers(unittest.TestCase):

    def test_extract_bold_tokens_preserves_order(self):
        from app.services.ask_shari_service import _extract_bold_tokens
        narrative = "Try the **Spicy Tuna Roll**, then the **Dragon Roll**, and maybe **Salmon Nigiri**."
        self.assertEqual(
            _extract_bold_tokens(narrative),
            ["Spicy Tuna Roll", "Dragon Roll", "Salmon Nigiri"],
        )

    def test_extract_bold_tokens_empty(self):
        from app.services.ask_shari_service import _extract_bold_tokens
        self.assertEqual(_extract_bold_tokens("No bold here at all."), [])

    def test_validate_narrative_accepts_when_all_known(self):
        from app.services.ask_shari_service import _validate_narrative
        allowed = {"spicy tuna roll": {"id": 1, "name": "Spicy Tuna Roll"}}
        self.assertTrue(_validate_narrative("Try the **Spicy Tuna Roll**.", allowed))

    def test_validate_narrative_rejects_unknown_bold(self):
        from app.services.ask_shari_service import _validate_narrative
        allowed = {"spicy tuna roll": {"id": 1, "name": "Spicy Tuna Roll"}}
        self.assertFalse(_validate_narrative("Try the **Phantom Roll**.", allowed))

    def test_validate_narrative_rejects_when_no_bold(self):
        from app.services.ask_shari_service import _validate_narrative
        allowed = {"spicy tuna roll": {"id": 1, "name": "Spicy Tuna Roll"}}
        self.assertFalse(_validate_narrative("Just a plain sentence.", allowed))

    def test_fallback_narrative_mentions_top_three(self):
        from app.services.ask_shari_service import _build_fallback_narrative
        items = [
            {"id": 1, "name": "Alpha Roll"},
            {"id": 2, "name": "Bravo Roll"},
            {"id": 3, "name": "Charlie Roll"},
            {"id": 4, "name": "Delta Roll"},
        ]
        text = _build_fallback_narrative(items)
        self.assertIn("**Alpha Roll**", text)
        self.assertIn("**Bravo Roll**", text)
        self.assertIn("**Charlie Roll**", text)
        # Fourth item is not referenced.
        self.assertNotIn("Delta Roll", text)


# ── Service: LLM fallback + hallucination guard ───────────────────────────────

class TestAskShariService(unittest.TestCase):

    def setUp(self):
        from app.services import ask_shari_cache
        ask_shari_cache.reset_for_tests()

    def test_falls_back_to_template_when_llm_returns_none(self):
        """If the LLM call fails, the narrative is filled from a template."""
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
        self.assertIn("**Spicy Tuna Roll**", result["narrative"])
        # Featured should mirror the items bolded in the narrative.
        featured_ids = [f["id"] for f in result["featured"]]
        self.assertEqual(featured_ids[:3], [1, 2, 3])
        self.assertEqual(len(result["results"]), 4)
        self.assertFalse(result["cache_hit"])

    def test_uses_llm_narrative_when_all_bolds_are_valid(self):
        from app.services import ask_shari_service

        items = [
            _make_item(id=1, name="Spicy Tuna Roll"),
            _make_item(id=2, name="Salmon Nigiri"),
            _make_item(id=3, name="Dragon Roll"),
        ]
        llm_response = {
            "narrative": (
                "If you're after something spicy, the **Spicy Tuna Roll** is a great "
                "pick, with **Salmon Nigiri** and **Dragon Roll** close behind."
            ),
            "follow_up": "Want a few more suggestions?",
        }

        with patch.object(ask_shari_service, "hybrid_search", return_value=_retrieval_result(items)), \
             patch.object(ask_shari_service, "_call_llm", return_value=llm_response):
            result = ask_shari_service.ask_shari(db=None, tenant_id=1, query="spicy")

        self.assertTrue(result["llm_used"])
        self.assertEqual(result["narrative"], llm_response["narrative"])
        self.assertEqual(result["follow_up"], "Want a few more suggestions?")
        self.assertEqual([f["id"] for f in result["featured"]], [1, 2, 3])

    def test_rejects_llm_narrative_with_hallucinated_item(self):
        """If any **...** token isn't in the retrieved set, fall back to template."""
        from app.services import ask_shari_service

        items = [
            _make_item(id=1, name="Spicy Tuna Roll"),
            _make_item(id=2, name="Salmon Nigiri"),
            _make_item(id=3, name="Dragon Roll"),
        ]
        llm_response = {
            "narrative": "Try the **Spicy Tuna Roll** or the made-up **Phantom Roll**.",
            "follow_up": "Want more?",
        }

        with patch.object(ask_shari_service, "hybrid_search", return_value=_retrieval_result(items)), \
             patch.object(ask_shari_service, "_call_llm", return_value=llm_response):
            result = ask_shari_service.ask_shari(db=None, tenant_id=1, query="spicy")

        # LLM output was rejected — we should have fallen back to the template.
        self.assertFalse(result["llm_used"])
        self.assertNotIn("Phantom Roll", result["narrative"])
        # Featured items are all real.
        for f in result["featured"]:
            self.assertIn(f["id"], {1, 2, 3})

    def test_zero_retrieval_skips_llm(self):
        from app.services import ask_shari_service

        with patch.object(ask_shari_service, "hybrid_search", return_value=_retrieval_result([])), \
             patch.object(ask_shari_service, "_call_llm") as mock_llm:
            result = ask_shari_service.ask_shari(db=None, tenant_id=1, query="nonsense")

        mock_llm.assert_not_called()
        self.assertEqual(result["narrative"], "")
        self.assertEqual(result["featured"], [])
        self.assertEqual(result["results"], [])
        self.assertEqual(result["more_count"], 0)
        self.assertFalse(result["llm_used"])

    def test_cache_hit_skips_retrieval_and_llm(self):
        from app.services import ask_shari_service

        items = [_make_item(id=1), _make_item(id=2), _make_item(id=3), _make_item(id=4)]

        with patch.object(ask_shari_service, "hybrid_search", return_value=_retrieval_result(items)) as mock_ret, \
             patch.object(ask_shari_service, "_call_llm", return_value=None) as mock_llm:
            first = ask_shari_service.ask_shari(db=None, tenant_id=1, query="spicy")
            second = ask_shari_service.ask_shari(db=None, tenant_id=1, query="  SPICY  ")

        self.assertEqual(mock_ret.call_count, 1)
        self.assertEqual(mock_llm.call_count, 1)
        self.assertTrue(second["cache_hit"])
        self.assertFalse(first["cache_hit"])
        self.assertEqual(first["narrative"], second["narrative"])
        self.assertEqual(first["featured"], second["featured"])

    def test_tenant_cache_isolation(self):
        """Two tenants querying the same string get independent cache entries."""
        from app.services import ask_shari_service

        items_a = [_make_item(id=101, tenant_id=1, name="Tenant A Roll")]
        items_b = [_make_item(id=202, tenant_id=2, name="Tenant B Roll")]
        items_a += [_make_item(id=102, tenant_id=1, name="A2"), _make_item(id=103, tenant_id=1, name="A3")]
        items_b += [_make_item(id=203, tenant_id=2, name="B2"), _make_item(id=204, tenant_id=2, name="B3")]

        def fake_search(db, tenant_id, query, **kwargs):
            return _retrieval_result(items_a if tenant_id == 1 else items_b)

        with patch.object(ask_shari_service, "hybrid_search", side_effect=fake_search), \
             patch.object(ask_shari_service, "_call_llm", return_value=None):
            a = ask_shari_service.ask_shari(db=None, tenant_id=1, query="rolls")
            b = ask_shari_service.ask_shari(db=None, tenant_id=2, query="rolls")

        a_ids = {f["id"] for f in a["featured"]}
        b_ids = {f["id"] for f in b["featured"]}
        self.assertTrue(a_ids.issubset({101, 102, 103}))
        self.assertTrue(b_ids.issubset({202, 203, 204}))
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
            "narrative": "Try the **Spicy Tuna Roll** — a light bite with medium heat.",
            "featured": [{"id": 1, "name": "Spicy Tuna Roll", "item": item}],
            "follow_up": "Want more?",
            "results": [item],
            "more_count": 0,
            "scoring_method": "hybrid",
            "llm_used": True,
            "cache_hit": False,
        }

        parsed = AskShariResponse(**payload)
        self.assertEqual(parsed.featured[0].name, "Spicy Tuna Roll")
        self.assertIn("**Spicy Tuna Roll**", parsed.narrative)
        self.assertEqual(parsed.scoring_method, "hybrid")
        self.assertTrue(parsed.llm_used)


if __name__ == "__main__":
    unittest.main()
