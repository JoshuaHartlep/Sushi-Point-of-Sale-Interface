"""
Settings model for the Sushi POS system.

This module defines the database model for application settings.
It includes:
- Settings model for global application configuration
- AYCE pricing for lunch and dinner periods
- Restaurant information and timezone
- Timestamps for tracking changes
"""

from sqlalchemy import Column, Integer, String, Numeric, DateTime, Enum as SQLEnum
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class MealPeriod(str, enum.Enum):
    """Enum for current meal period"""
    LUNCH = "LUNCH"
    DINNER = "DINNER"


class Settings(Base):
    """
    Database model for application settings.
    
    This model stores global configuration settings for the POS system.
    It includes:
    - AYCE pricing for lunch and dinner periods
    - Restaurant name and timezone configuration
    - Timestamps for tracking changes
    - Single row design (only one settings record exists)
    
    Attributes:
        id (int): Primary key (always 1 for singleton pattern)
        restaurant_name (str): Name of the restaurant
        timezone (str): Restaurant's timezone (e.g., 'America/New_York')
        ayce_lunch_price (Numeric): All-you-can-eat price for lunch period
        ayce_dinner_price (Numeric): All-you-can-eat price for dinner period
        created_at (datetime): Record creation timestamp
        updated_at (datetime): Record update timestamp
    """
    __tablename__ = "settings"

    # primary key - should always be 1 for singleton settings
    id = Column(Integer, primary_key=True, index=True, default=1)
    
    # restaurant information
    restaurant_name = Column(String(255), nullable=False, default="Sushi Restaurant")  # restaurant name
    timezone = Column(String(100), nullable=False, default="America/New_York")  # restaurant timezone
    current_meal_period = Column(SQLEnum(MealPeriod), nullable=False, default=MealPeriod.DINNER)  # current meal period
    
    # AYCE pricing for different meal periods
    ayce_lunch_price = Column(Numeric(10, 2), nullable=False, default=20.00)  # lunch AYCE price
    ayce_dinner_price = Column(Numeric(10, 2), nullable=False, default=25.00)  # dinner AYCE price

    # when settings were created and last updated
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())