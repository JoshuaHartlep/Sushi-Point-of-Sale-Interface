"""
Menu schemas for the Sushi POS API.

This module defines the Pydantic models for menu-related data structures,
including menu items, categories, and modifiers.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime
from app.models.menu import MealPeriodEnum

class MenuItemBase(BaseModel):
    """Base schema for menu items."""
    name: str
    description: Optional[str] = None
    price: float
    category_id: Optional[int] = None
    is_available: bool = True
    meal_period: MealPeriodEnum = MealPeriodEnum.BOTH

class MenuItemCreate(MenuItemBase):
    """Schema for creating a menu item."""
    pass

class MenuItemUpdate(MenuItemBase):
    """Schema for updating a menu item."""
    name: Optional[str] = None
    price: Optional[float] = None
    meal_period: Optional[MealPeriodEnum] = None

class MenuItemResponse(MenuItemBase):
    """Schema for menu item responses."""
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CategoryBase(BaseModel):
    """Base schema for categories."""
    name: str
    description: Optional[str] = None
    display_order: Optional[int] = 0

class CategoryCreate(CategoryBase):
    """Schema for creating a category."""
    pass

class CategoryUpdate(BaseModel):
    """Schema for updating a category."""
    name: Optional[str] = None
    description: Optional[str] = None
    display_order: Optional[int] = None

class CategoryResponse(CategoryBase):
    """Schema for category responses."""
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ModifierBase(BaseModel):
    """Base schema for modifiers."""
    name: str
    description: Optional[str] = None
    price: float
    category_id: Optional[int] = Field(None, ge=1)  # Only allow positive integers for category_id
    is_available: bool = True
    display_order: Optional[int] = 0

class ModifierCreate(ModifierBase):
    """Schema for creating a modifier."""
    pass

class ModifierUpdate(BaseModel):
    """Schema for updating a modifier."""
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    category_id: Optional[int] = None
    is_available: Optional[bool] = None
    display_order: Optional[int] = None

class ModifierResponse(ModifierBase):
    """Schema for modifier responses."""
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True 