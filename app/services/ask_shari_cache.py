"""
Ask Shari response cache.

Keyed by (tenant_id, menu_version, normalized_query). The cache returns the
full JSON response that should be sent back to the client, so a hit is just
one dict lookup — no LLM call, no retrieval.

Backend selection:
  * If ASK_SHARI_REDIS_URL is set AND the `redis` package is importable, Redis
    is used.  Otherwise we fall back to an in-memory TTL cache guarded by a
    lock so concurrent requests can't corrupt it.

Invalidation strategy:
  A per-tenant `menu_version` counter is part of the cache key.  Bumping the
  version (via `bump_menu_version`) instantly invalidates every cached entry
  for that tenant without having to walk the cache.  Menu CRUD endpoints call
  `bump_menu_version` so stale items never surface after an edit.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


# ── Query normalisation ──────────────────────────────────────────────────────

_WS = re.compile(r"\s+")


def normalize_query(query: str) -> str:
    """Lowercase + collapse whitespace — so "Spicy   Tuna" and "spicy tuna" hit the same cache entry."""
    return _WS.sub(" ", query.strip().lower())


# ── Menu version registry (cheap invalidation token) ─────────────────────────

_version_lock = threading.Lock()
_menu_versions: dict[int, int] = {}


def get_menu_version(tenant_id: int) -> int:
    """Return the current menu version for `tenant_id` (creating it lazily)."""
    with _version_lock:
        return _menu_versions.setdefault(tenant_id, 1)


def bump_menu_version(tenant_id: int) -> int:
    """
    Invalidate every cached Ask Shari response for `tenant_id` by rotating the
    version token that is baked into the cache key.  O(1) — no scanning.
    """
    with _version_lock:
        _menu_versions[tenant_id] = _menu_versions.get(tenant_id, 1) + 1
        new = _menu_versions[tenant_id]
    logger.info("Ask Shari cache invalidated for tenant=%d (version → %d)", tenant_id, new)
    return new


# ── Cache backend ────────────────────────────────────────────────────────────

class _BaseCache:
    def get(self, key: str) -> Optional[dict]: ...
    def set(self, key: str, value: dict, ttl_s: int) -> None: ...


class _InMemoryCache(_BaseCache):
    """Thread-safe TTL cache used when Redis is unavailable."""

    def __init__(self, max_entries: int = 1024) -> None:
        self._store: dict[str, tuple[float, dict]] = {}
        self._lock = threading.Lock()
        self._max_entries = max_entries

    def get(self, key: str) -> Optional[dict]:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if expires_at < time.time():
                # Evict expired entry lazily.
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: dict, ttl_s: int) -> None:
        with self._lock:
            # Simple LRU-ish bound: when full, drop the oldest item by insertion order.
            if len(self._store) >= self._max_entries:
                oldest_key = next(iter(self._store))
                self._store.pop(oldest_key, None)
            self._store[key] = (time.time() + ttl_s, value)


class _RedisCache(_BaseCache):
    """Redis-backed cache — used when ASK_SHARI_REDIS_URL is set."""

    def __init__(self, url: str) -> None:
        import redis  # local import so the package is optional
        self._client = redis.Redis.from_url(url, socket_timeout=1.0, socket_connect_timeout=1.0)

    def get(self, key: str) -> Optional[dict]:
        try:
            raw = self._client.get(key)
        except Exception as exc:
            logger.warning("Ask Shari Redis GET failed (%s) — treating as miss", exc)
            return None
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except Exception:
            logger.warning("Ask Shari Redis value corrupt for key=%s — discarding", key)
            return None

    def set(self, key: str, value: dict, ttl_s: int) -> None:
        try:
            self._client.setex(key, ttl_s, json.dumps(value))
        except Exception as exc:
            logger.warning("Ask Shari Redis SET failed (%s) — continuing without cache write", exc)


_backend_lock = threading.Lock()
_backend: Optional[_BaseCache] = None


def _get_backend() -> _BaseCache:
    """Lazy-construct the cache backend on first use."""
    global _backend
    if _backend is not None:
        return _backend
    with _backend_lock:
        if _backend is not None:
            return _backend
        if settings.ASK_SHARI_REDIS_URL:
            try:
                _backend = _RedisCache(settings.ASK_SHARI_REDIS_URL)
                logger.info("Ask Shari cache backend: Redis")
                return _backend
            except Exception as exc:
                logger.warning("Failed to init Redis cache (%s) — using in-memory fallback", exc)
        _backend = _InMemoryCache()
        logger.info("Ask Shari cache backend: in-memory")
        return _backend


# ── Public API ───────────────────────────────────────────────────────────────

def _make_key(tenant_id: int, query: str) -> str:
    version = get_menu_version(tenant_id)
    return f"ask_shari:v{version}:t{tenant_id}:{normalize_query(query)}"


def get_cached(tenant_id: int, query: str) -> Optional[dict]:
    """Return a cached response dict or None."""
    key = _make_key(tenant_id, query)
    value = _get_backend().get(key)
    if value is not None:
        logger.info("Ask Shari cache hit tenant=%d query=%r", tenant_id, query)
    else:
        logger.info("Ask Shari cache miss tenant=%d query=%r", tenant_id, query)
    return value


def set_cached(tenant_id: int, query: str, value: dict, ttl_s: Optional[int] = None) -> None:
    """Store `value` under the (tenant_id, query) key with the configured TTL."""
    key = _make_key(tenant_id, query)
    _get_backend().set(key, value, ttl_s or settings.ASK_SHARI_CACHE_TTL_S)


def reset_for_tests() -> None:
    """Test helper: clear the cache backend and menu version registry."""
    global _backend
    with _backend_lock:
        _backend = None
    with _version_lock:
        _menu_versions.clear()
