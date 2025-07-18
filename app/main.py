"""
Sushi POS API Application

This is the main FastAPI application for the Sushi POS system.
It provides a comprehensive API for managing a sushi restaurant's operations,
including menu items, orders, tables, and user management.

The application includes:
- Menu management (items, categories)
- Order processing
- Table management
- Bulk operations support
- Error handling and logging
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import menu, order, dashboard
from app.core.config import settings
from app.core.database import engine, Base, init_db
from app.core.logging import setup_logging
import logging

# Set up logging
logger = setup_logging()

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Sushi POS API",
    description="API for managing a sushi restaurant's operations",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(menu.router, prefix="/api/v1/menu", tags=["Menu"])
app.include_router(order.router, prefix="/api/v1/orders", tags=["Orders"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["Dashboard"])

@app.get("/")
async def root():
    """
    Root endpoint that provides basic API information.
    
    Returns:
        dict: Basic API information including name and version
    """
    return {
        "name": "Sushi POS API",
        "version": "1.0.0",
        "status": "running"
    }

@app.on_event("startup")
async def startup_event():
    """
    Startup event handler that runs when the application starts.
    Performs any necessary initialization tasks.
    """
    logger.info("Starting Sushi POS API...")
    # Initialize the database
    init_db()

@app.on_event("shutdown")
async def shutdown_event():
    """
    Shutdown event handler that runs when the application shuts down.
    Performs any necessary cleanup tasks.
    """
    logger.info("Shutting down Sushi POS API...")
    # Add any cleanup tasks here
