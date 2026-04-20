"""
Application configuration management.

This module provides configuration management for the Sushi POS system.
It uses Pydantic's BaseSettings to handle environment variables and
application settings in a type-safe manner.

The configuration includes:
- Database connection settings
- API settings
- Logging settings
"""

from pydantic_settings import BaseSettings
from typing import Optional
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Settings(BaseSettings):
    """
    Application settings.
    
    This class defines all configuration settings for the application.
    It uses Pydantic's BaseSettings to automatically load values from
    environment variables with proper type validation.
    
    Attributes:
        PROJECT_NAME (str): Name of the project
        API_V1_STR (str): API version prefix
        DATABASE_URL (str): Database connection URL
        SQL_ECHO (bool): Enable SQL query logging
        ENVIRONMENT (str): Current environment (development/production)
    """
    
    # Project settings
    PROJECT_NAME: str = "Sushi POS API"
    API_V1_STR: str = "/api/v1"
    
    # Database settings
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:5v4n7wA!@localhost:5432/sushi_pos"
    )
    
    # Development settings
    SQL_ECHO: bool = os.getenv("SQL_ECHO", "False").lower() == "true"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # Multi-tenant: ID of the default (and currently only) tenant.
    # All data is scoped to this tenant in single-tenant mode.
    # Override via DEFAULT_TENANT_ID env var when running multiple tenants.
    DEFAULT_TENANT_ID: int = int(os.getenv("DEFAULT_TENANT_ID", "1"))

    # AWS S3 settings for uploaded images
    AWS_ACCESS_KEY_ID: Optional[str] = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: Optional[str] = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME", "sushi-pos-uploads")

    # Semantic search — OpenAI embeddings
    # Set OPENAI_API_KEY to enable; leave blank to fall back to keyword-only search.
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
    # Embedding model name.  Changing this requires a new migration + full reindex.
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
    # Logical version tag — bump to force a full reindex without changing the model.
    EMBEDDING_VERSION: str = os.getenv("EMBEDDING_VERSION", "v1")
    # Vector dimensionality — must match the model above (text-embedding-3-small → 1536).
    EMBEDDING_DIM: int = int(os.getenv("EMBEDDING_DIM", "1536"))
    # Hybrid ranking weights (must sum to 1.0).
    SEARCH_SEMANTIC_WEIGHT: float = float(os.getenv("SEARCH_SEMANTIC_WEIGHT", "0.6"))
    SEARCH_KEYWORD_WEIGHT: float = float(os.getenv("SEARCH_KEYWORD_WEIGHT", "0.4"))
    # How many semantic candidates to fetch before keyword re-ranking.
    SEARCH_FETCH_CANDIDATES: int = int(os.getenv("SEARCH_FETCH_CANDIDATES", "100"))

    # ── Ask Shari (LLM explanation layer) ────────────────────────────────────
    # Chat model used to explain / format retrieval results.
    ASK_SHARI_MODEL: str = os.getenv("ASK_SHARI_MODEL", "gpt-4o-mini")
    # How many retrieved items to pass to the LLM (top slice of the ranked list).
    ASK_SHARI_LLM_ITEMS: int = int(os.getenv("ASK_SHARI_LLM_ITEMS", "6"))
    # How many candidates to fetch from the retrieval layer overall.
    ASK_SHARI_TOP_K: int = int(os.getenv("ASK_SHARI_TOP_K", "20"))
    # Per-request LLM timeout in seconds — falls back to retrieval-only on expiry.
    ASK_SHARI_TIMEOUT_S: float = float(os.getenv("ASK_SHARI_TIMEOUT_S", "8.0"))
    # Max output tokens — hard ceiling on response size and cost.
    ASK_SHARI_MAX_TOKENS: int = int(os.getenv("ASK_SHARI_MAX_TOKENS", "500"))
    # Cache TTL in seconds — default 15 min balances freshness against cost.
    ASK_SHARI_CACHE_TTL_S: int = int(os.getenv("ASK_SHARI_CACHE_TTL_S", "900"))
    # Optional Redis URL — when unset, an in-memory cache is used instead.
    ASK_SHARI_REDIS_URL: Optional[str] = os.getenv("ASK_SHARI_REDIS_URL")

    class Config:
        """
        Pydantic configuration.
        
        This class configures how Pydantic should handle the settings:
        - case_sensitive: Whether to be case-sensitive when matching env vars
        - env_file: The .env file to load settings from
        """
        case_sensitive = True
        env_file = ".env"

# Create global settings instance
settings = Settings()

def get_settings() -> Settings:
    """
    Get the global settings instance.
    
    This function is used as a FastAPI dependency to provide access to
    application settings throughout the application.
    
    Returns:
        Settings: The global settings instance
    """
    return settings
