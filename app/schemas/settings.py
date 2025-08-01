"""
Settings schema models for the Sushi POS system.

This module defines the Pydantic models for settings-related operations.
It includes:
- Request and response models for settings API endpoints
- Validation and serialization for settings data
- Type annotations for better IDE support
"""

from pydantic import BaseModel, Field, validator
from decimal import Decimal
from datetime import datetime
from typing import Optional
from app.models.settings import MealPeriod


class SettingsBase(BaseModel):
    """Base settings model with common fields"""
    restaurant_name: str = Field(..., min_length=1, max_length=255, description="Restaurant name")
    timezone: str = Field(..., min_length=1, max_length=100, description="Restaurant timezone (e.g., 'America/New_York')")
    current_meal_period: MealPeriod = Field(..., description="Current meal period (LUNCH or DINNER)")
    ayce_lunch_price: Decimal = Field(..., ge=0, decimal_places=2, description="All-you-can-eat lunch price")
    ayce_dinner_price: Decimal = Field(..., ge=0, decimal_places=2, description="All-you-can-eat dinner price")

    @validator('ayce_lunch_price', 'ayce_dinner_price')
    def validate_price(cls, v):
        """Ensure prices are positive and have max 2 decimal places"""
        if v < 0:
            raise ValueError('Price must be non-negative')
        return round(v, 2)

    @validator('timezone')
    def validate_timezone(cls, v):
        """Basic timezone format validation"""
        if not v or not isinstance(v, str):
            raise ValueError('Timezone must be a non-empty string')
        return v.strip()

    @validator('restaurant_name')
    def validate_restaurant_name(cls, v):
        """Ensure restaurant name is not empty after stripping"""
        if not v or not v.strip():
            raise ValueError('Restaurant name cannot be empty')
        return v.strip()


class SettingsCreate(SettingsBase):
    """Schema for creating settings (not typically used as settings are singleton)"""
    pass


class SettingsUpdate(BaseModel):
    """Schema for updating settings - all fields are optional"""
    restaurant_name: Optional[str] = Field(None, min_length=1, max_length=255, description="Restaurant name")
    timezone: Optional[str] = Field(None, min_length=1, max_length=100, description="Restaurant timezone")
    current_meal_period: Optional[MealPeriod] = Field(None, description="Current meal period (LUNCH or DINNER)")
    ayce_lunch_price: Optional[Decimal] = Field(None, ge=0, decimal_places=2, description="All-you-can-eat lunch price")
    ayce_dinner_price: Optional[Decimal] = Field(None, ge=0, decimal_places=2, description="All-you-can-eat dinner price")

    @validator('ayce_lunch_price', 'ayce_dinner_price')
    def validate_price(cls, v):
        """Ensure prices are positive and have max 2 decimal places"""
        if v is not None:
            if v < 0:
                raise ValueError('Price must be non-negative')
            return round(v, 2)
        return v

    @validator('timezone')
    def validate_timezone(cls, v):
        """Basic timezone format validation"""
        if v is not None:
            if not v or not isinstance(v, str):
                raise ValueError('Timezone must be a non-empty string')
            return v.strip()
        return v

    @validator('restaurant_name')
    def validate_restaurant_name(cls, v):
        """Ensure restaurant name is not empty after stripping"""
        if v is not None:
            if not v or not v.strip():
                raise ValueError('Restaurant name cannot be empty')
            return v.strip()
        return v


class SettingsResponse(SettingsBase):
    """Schema for settings API responses"""
    id: int = Field(..., description="Settings ID (always 1)")
    created_at: datetime = Field(..., description="Settings creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Settings last update timestamp")

    class Config:
        from_attributes = True  # Enable ORM mode for SQLAlchemy models