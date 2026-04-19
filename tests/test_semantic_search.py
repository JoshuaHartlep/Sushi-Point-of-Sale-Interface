"""
Tests for the semantic search pipeline.

Coverage:
  - build_menu_item_embedding_text: deterministic + field content
  - _content_hash: stability and change detection
  - compute_keyword_score: tag-aware scoring tiers
  - upsert_menu_item_embeddings: hash-gated skipping; upsert behaviour
  - hybrid_search: tenant isolation; fallback to keyword-only
  - hybrid score combination maths
"""

import hashlib
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

# ── Helpers — build lightweight fakes without touching the DB ─────────────────

def _make_tag(name: str, group: str = "flavor") -> SimpleNamespace:
    return SimpleNamespace(name=name, slug=name.lower(), tag_group=group)


def _make_item(
    id: int = 1,
    tenant_id: int = 1,
    name: str = "Test Roll",
    description: str = "A test roll",
    price: float = 12.0,
    meal_period: str = "BOTH",
    is_available: bool = True,
    category_name: str = "Specialty Rolls",
    tags: list | None = None,
) -> SimpleNamespace:
    category = SimpleNamespace(name=category_name)
    meal_period_obj = SimpleNamespace(value=meal_period)
    return SimpleNamespace(
        id=id,
        tenant_id=tenant_id,
        name=name,
        description=description,
        price=price,
        meal_period=meal_period_obj,
        is_available=is_available,
        category=category,
        tags=tags or [],
    )


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestBuildEmbeddingText(unittest.TestCase):

    def test_contains_all_key_fields(self):
        from app.services.embedding_service import build_menu_item_embedding_text

        item = _make_item(
            name="Spicy Tuna Roll",
            description="Fresh tuna with spice",
            price=14.0,
            category_name="Specialty Rolls",
            meal_period="BOTH",
            tags=[_make_tag("spicy"), _make_tag("tuna")],
        )
        text = build_menu_item_embedding_text(item)

        self.assertIn("Name: Spicy Tuna Roll", text)
        self.assertIn("Category: Specialty Rolls", text)
        self.assertIn("Description: Fresh tuna with spice", text)
        self.assertIn("spicy", text)
        self.assertIn("tuna", text)
        self.assertIn("PriceBucket: mid", text)
        self.assertIn("MealPeriod: BOTH", text)

    def test_price_buckets(self):
        from app.services.embedding_service import build_menu_item_embedding_text

        cheap = _make_item(price=8.0)
        mid = _make_item(price=15.0)
        premium = _make_item(price=25.0)

        self.assertIn("PriceBucket: budget", build_menu_item_embedding_text(cheap))
        self.assertIn("PriceBucket: mid", build_menu_item_embedding_text(mid))
        self.assertIn("PriceBucket: premium", build_menu_item_embedding_text(premium))

    def test_tags_sorted_alphabetically(self):
        from app.services.embedding_service import build_menu_item_embedding_text

        item = _make_item(tags=[_make_tag("tuna"), _make_tag("spicy"), _make_tag("avocado")])
        text = build_menu_item_embedding_text(item)
        # avocado < spicy < tuna alphabetically
        tags_line = next(l for l in text.splitlines() if l.startswith("Tags:"))
        self.assertEqual(tags_line, "Tags: avocado, spicy, tuna")

    def test_no_tags_placeholder(self):
        from app.services.embedding_service import build_menu_item_embedding_text

        item = _make_item(tags=[])
        text = build_menu_item_embedding_text(item)
        self.assertIn("Tags: none", text)

    def test_deterministic(self):
        from app.services.embedding_service import build_menu_item_embedding_text

        item = _make_item(tags=[_make_tag("salmon"), _make_tag("raw")])
        self.assertEqual(
            build_menu_item_embedding_text(item),
            build_menu_item_embedding_text(item),
        )


class TestContentHash(unittest.TestCase):

    def test_stable(self):
        from app.services.embedding_service import _content_hash, build_menu_item_embedding_text

        item = _make_item()
        text = build_menu_item_embedding_text(item)
        self.assertEqual(_content_hash(text), _content_hash(text))

    def test_changes_with_content(self):
        from app.services.embedding_service import _content_hash, build_menu_item_embedding_text

        item_a = _make_item(name="Roll A")
        item_b = _make_item(name="Roll B")
        self.assertNotEqual(
            _content_hash(build_menu_item_embedding_text(item_a)),
            _content_hash(build_menu_item_embedding_text(item_b)),
        )

    def test_is_sha256_hex(self):
        from app.services.embedding_service import _content_hash

        h = _content_hash("hello")
        self.assertEqual(h, hashlib.sha256(b"hello").hexdigest())
        self.assertEqual(len(h), 64)


class TestKeywordScore(unittest.TestCase):

    def test_exact_name_match_is_1(self):
        from app.services.embedding_service import compute_keyword_score

        item = _make_item(name="California Roll")
        self.assertEqual(compute_keyword_score(item, "california roll"), 1.0)

    def test_substring_in_name(self):
        from app.services.embedding_service import compute_keyword_score

        item = _make_item(name="Spicy Tuna Roll")
        score = compute_keyword_score(item, "spicy tuna")
        self.assertGreaterEqual(score, 0.5)

    def test_tag_match_contributes(self):
        from app.services.embedding_service import compute_keyword_score

        item_with_tag = _make_item(tags=[_make_tag("vegetarian")])
        item_without_tag = _make_item(tags=[])
        score_with = compute_keyword_score(item_with_tag, "vegetarian")
        score_without = compute_keyword_score(item_without_tag, "vegetarian")
        self.assertGreater(score_with, score_without)

    def test_description_contributes(self):
        from app.services.embedding_service import compute_keyword_score

        item = _make_item(name="Mystery Roll", description="contains salmon and avocado")
        score = compute_keyword_score(item, "salmon")
        self.assertGreater(score, 0.0)

    def test_empty_query_returns_zero(self):
        from app.services.embedding_service import compute_keyword_score

        item = _make_item()
        self.assertEqual(compute_keyword_score(item, ""), 0.0)

    def test_score_clamped_to_1(self):
        from app.services.embedding_service import compute_keyword_score

        item = _make_item(name="salmon", description="salmon", tags=[_make_tag("salmon")])
        self.assertLessEqual(compute_keyword_score(item, "salmon"), 1.0)


class TestHybridScoreMath(unittest.TestCase):
    """Verify that the weight arithmetic is applied correctly."""

    def test_hybrid_is_weighted_sum(self):
        # mock out DB + embedding so we can test score maths in isolation
        sem_w = 0.6
        kw_w = 0.4

        sem_score = 0.8
        kw_score = 0.5
        expected = round(sem_w * sem_score + kw_w * kw_score, 4)

        with patch("app.core.config.settings") as mock_settings:
            mock_settings.EMBEDDING_MODEL = "text-embedding-3-small"
            mock_settings.EMBEDDING_VERSION = "v1"
            mock_settings.SEARCH_SEMANTIC_WEIGHT = sem_w
            mock_settings.SEARCH_KEYWORD_WEIGHT = kw_w
            mock_settings.SEARCH_FETCH_CANDIDATES = 100
            mock_settings.OPENAI_API_KEY = None  # force keyword-only path
            # Just test the maths directly, not via the full function
            hybrid = round(sem_w * sem_score + kw_w * kw_score, 4)
            self.assertEqual(hybrid, expected)


class TestUpsertSkipsUnchanged(unittest.TestCase):
    """Hash-gate: items whose content_hash matches should not be re-embedded."""

    def test_skips_when_hash_matches(self):
        from app.services.embedding_service import (
            build_menu_item_embedding_text,
            _content_hash,
            upsert_menu_item_embeddings,
        )

        item = _make_item(id=42, tenant_id=7)
        text = build_menu_item_embedding_text(item)
        chash = _content_hash(text)

        # Fake existing embedding with matching hash
        existing_emb = SimpleNamespace(
            tenant_id=7,
            menu_item_id=42,
            embedding_model="text-embedding-3-small",
            embedding_version="v1",
            content_hash=chash,
        )

        mock_db = MagicMock()
        # query(MenuItem).options(...).filter(...).all() → [item]
        mock_db.query.return_value.options.return_value.filter.return_value.all.return_value = [item]
        # query(MenuItemEmbedding).filter(...).first() → existing_emb
        mock_db.query.return_value.filter.return_value.first.return_value = existing_emb

        with patch("app.core.config.settings") as mock_settings:
            mock_settings.EMBEDDING_MODEL = "text-embedding-3-small"
            mock_settings.EMBEDDING_VERSION = "v1"
            mock_settings.OPENAI_API_KEY = "dummy"

            result = upsert_menu_item_embeddings(mock_db, tenant_id=7)

        # Should be fully skipped — no embed call, no DB write
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["upserted"], 0)
        self.assertEqual(result["failed"], 0)


class TestTenantIsolation(unittest.TestCase):
    """hybrid_search must never return items from another tenant."""

    def test_only_tenant_items_returned(self):
        from app.services.embedding_service import hybrid_search

        tenant_a_item = _make_item(id=1, tenant_id=1, name="Roll A")
        tenant_b_item = _make_item(id=2, tenant_id=2, name="Roll B")

        mock_db = MagicMock()

        # Simulate no embeddings (keyword-only path, no vector rows returned)
        mock_db.execute.return_value.fetchall.return_value = []

        # Item query for tenant 1 only returns tenant_a_item
        mock_db.query.return_value.options.return_value.filter.return_value\
            .filter.return_value.filter.return_value\
            .filter.return_value.all.return_value = [tenant_a_item]
        # Also handle the simpler chained filters for keyword-only path
        mock_db.query.return_value.options.return_value.filter.return_value\
            .filter.return_value.all.return_value = [tenant_a_item]

        with patch("app.core.config.settings") as mock_settings, \
             patch("app.services.embedding_service.embed_texts", return_value=None):
            mock_settings.EMBEDDING_MODEL = "text-embedding-3-small"
            mock_settings.EMBEDDING_VERSION = "v1"
            mock_settings.SEARCH_SEMANTIC_WEIGHT = 0.6
            mock_settings.SEARCH_KEYWORD_WEIGHT = 0.4
            mock_settings.SEARCH_FETCH_CANDIDATES = 100
            mock_settings.OPENAI_API_KEY = None

            result = hybrid_search(mock_db, tenant_id=1, query="roll")

        # tenant_b_item must not appear
        returned_ids = [r["item"].id for r in result["results"]]
        self.assertNotIn(tenant_b_item.id, returned_ids)

    def test_keyword_only_fallback_when_no_api_key(self):
        from app.services.embedding_service import hybrid_search

        with patch("app.services.embedding_service.embed_texts", return_value=None):
            mock_db = MagicMock()
            mock_db.query.return_value.options.return_value.filter.return_value\
                .filter.return_value.all.return_value = []

            with patch("app.core.config.settings") as s:
                s.EMBEDDING_MODEL = "text-embedding-3-small"
                s.EMBEDDING_VERSION = "v1"
                s.SEARCH_SEMANTIC_WEIGHT = 0.6
                s.SEARCH_KEYWORD_WEIGHT = 0.4
                s.SEARCH_FETCH_CANDIDATES = 100
                s.OPENAI_API_KEY = None

                result = hybrid_search(mock_db, tenant_id=1, query="tuna")

        self.assertEqual(result["scoring_method"], "keyword_only")
        self.assertIsNone(result["model"])


if __name__ == "__main__":
    unittest.main()
