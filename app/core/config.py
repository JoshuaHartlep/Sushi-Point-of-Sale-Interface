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
