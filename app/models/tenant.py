"""
Tenant model for the Sushi POS system.

Multi-tenant design: each Tenant represents one restaurant installation.
All business data (menu, orders, tables, settings) is scoped to a tenant_id FK.

Currently the system operates in single-tenant mode using DEFAULT_TENANT_ID
from config. Full tenant resolution (subdomain, JWT claim, etc.) is NOT yet
implemented — this model exists so the schema is ready to scale.
"""

from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    # unique identifier for each tenant (restaurant)
    id = Column(Integer, primary_key=True, index=True)

    # human-readable name shown in admin tools and logs
    name = Column(String(255), nullable=False)

    # when this tenant was created
    created_at = Column(DateTime(timezone=True), server_default=func.now())
