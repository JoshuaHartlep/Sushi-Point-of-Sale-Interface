"""
Logging configuration for the Sushi POS system.

This module provides centralized logging configuration for the application.
It sets up logging with proper formatting, handlers, and log levels based
on the environment (development/production).
"""

import logging
import sys
from logging.handlers import RotatingFileHandler
from app.core.config import settings
import os

def setup_logging() -> logging.Logger:
    """
    Set up logging configuration for the application.
    
    This function configures logging with:
    - Console output for development
    - File output with rotation for production
    - Proper formatting and log levels
    - Environment-specific settings
    
    Returns:
        logging.Logger: Configured logger instance
    """
    # Create logs directory if it doesn't exist
    if not os.path.exists("logs"):
        os.makedirs("logs")
    
    # Create logger
    logger = logging.getLogger("sushi_pos")
    logger.setLevel(logging.DEBUG if settings.ENVIRONMENT == "development" else logging.INFO)
    
    # Create formatters
    console_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    file_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s - [%(filename)s:%(lineno)d]'
    )
    
    # Console handler (always active)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)
    
    # File handler (for production)
    if settings.ENVIRONMENT == "production":
        file_handler = RotatingFileHandler(
            "logs/sushi_pos.log",
            maxBytes=10*1024*1024,  # 10MB
            backupCount=5,
            encoding='utf-8'
        )
        file_handler.setFormatter(file_formatter)
        logger.addHandler(file_handler)
    
    # Set log level based on environment
    if settings.ENVIRONMENT == "development":
        logger.setLevel(logging.DEBUG)
    else:
        logger.setLevel(logging.INFO)
    
    return logger

def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance with the specified name.
    
    This function provides a convenient way to get a logger instance
    that inherits the application's logging configuration.
    
    Args:
        name (str): Name for the logger (typically __name__)
        
    Returns:
        logging.Logger: Configured logger instance
    """
    return logging.getLogger(f"sushi_pos.{name}") 