"""
Tenant resolution for the Sushi POS system.

Multi-tenant design note:
  All business data is scoped to a tenant_id.  Every API route receives the
  current tenant via `Depends(get_tenant_id)` — a single FastAPI dependency —
  so tenant logic is centralized here and never duplicated across routes.

Current behaviour (single-tenant mode):
  Returns DEFAULT_TENANT_ID from settings (default 1).  The app behaves
  exactly as before; the tenant column is just always set to 1.

Future extension points:
  - JWT claim: extract tenant_id from the token sub/claim.
  - Subdomain: parse the Host header (e.g. "acme.sushipos.com" → tenant "acme").
  - API key: look up tenant from a key passed in X-Tenant-ID header.
  Only this file needs to change — no route code will need updating.
"""

from app.core.config import settings


def get_tenant_id() -> int:
    """
    FastAPI dependency: resolve the current tenant for this request.

    Inject with:  tenant_id: int = Depends(get_tenant_id)

    Log the resolved ID so tenant scoping is visible in request logs for
    debugging cross-tenant issues during development / migration.
    """
    # In single-tenant mode this is always DEFAULT_TENANT_ID (1).
    # Replace this line to add real tenant resolution logic.
    return settings.DEFAULT_TENANT_ID
