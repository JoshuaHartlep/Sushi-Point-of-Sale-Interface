"""
Database configuration and session management.

This module provides database connection and session management functionality
for the Sushi POS system. It includes:
- Database connection setup
- Session management
- Base model configuration
- Connection pooling
"""

from sqlalchemy import create_engine, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
import logging

# Configure logging
logger = logging.getLogger(__name__)

# Create SQLAlchemy engine with connection pooling
engine = create_engine(
    settings.DATABASE_URL,
    pool_size=5,  # Number of connections to keep in the pool
    max_overflow=10,  # Maximum number of connections that can be created beyond pool_size
    pool_timeout=30,  # Seconds to wait before giving up on getting a connection from the pool
    pool_recycle=1800,  # Recycle connections after 30 minutes
    echo=settings.SQL_ECHO  # Enable SQL query logging in development
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create declarative base for models
Base = declarative_base()

def get_db():
    """
    Dependency function to get a database session.
    
    This function is used as a FastAPI dependency to provide database sessions
    to route handlers. It ensures proper session cleanup after each request.
    
    Yields:
        Session: SQLAlchemy database session
        
    Example:
        @app.get("/items/")
        def read_items(db: Session = Depends(get_db)):
            return db.query(Item).all()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """
    Initialize the database by creating all tables.
    
    This function should be called during application startup to ensure
    all database tables are created. It's safe to call multiple times as
    SQLAlchemy will only create tables that don't already exist.
    """
    try:
        # Create an inspector to check existing tables
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()
        logger.info(f"Existing tables: {existing_tables}")
        
        # Create all tables
        Base.metadata.create_all(bind=engine)
        
        # Check which tables were created
        new_tables = inspector.get_table_names()
        created_tables = set(new_tables) - set(existing_tables)
        
        if created_tables:
            logger.info(f"Created new tables: {created_tables}")
        else:
            logger.info("All tables already exist")
            
        logger.info("Database initialization completed successfully")
    except Exception as e:
        logger.error(f"Error during database initialization: {str(e)}")
        raise 