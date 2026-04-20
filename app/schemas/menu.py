"""
Menu schemas for the Sushi POS API.

This module defines the Pydantic models for menu-related data structures,
including menu items, categories, and modifiers.
"""

from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Literal, Any
from datetime import datetime
from app.models.menu import MealPeriodEnum, ImageStatusEnum

class MenuItemBase(BaseModel):
    """Base schema for menu items."""
    name: str
    description: Optional[str] = None
    price: float
    ayce_surcharge: Optional[float] = Field(default=0.0, ge=0.0)
    category_id: Optional[int] = None
    is_available: bool = True
    meal_period: MealPeriodEnum = MealPeriodEnum.BOTH
    image_url: Optional[str] = None
    image_position_x: float = Field(default=50.0, ge=0.0, le=100.0)
    image_position_y: float = Field(default=50.0, ge=0.0, le=100.0)
    image_zoom: float = Field(default=1.0, ge=1.0, le=3.0)

class MenuItemCreate(MenuItemBase):
    """Schema for creating a menu item."""
    pass

class MenuItemUpdate(MenuItemBase):
    """Schema for updating a menu item."""
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    ayce_surcharge: Optional[float] = Field(default=None, ge=0.0)
    category_id: Optional[int] = None
    is_available: Optional[bool] = None
    meal_period: Optional[MealPeriodEnum] = None
    image_url: Optional[str] = None
    image_position_x: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    image_position_y: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    image_zoom: Optional[float] = Field(default=None, ge=1.0, le=3.0)

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


class ItemModifiersResponse(BaseModel):
    """Schema for returning a menu item's assigned modifiers."""
    item_id: int
    modifier_ids: List[int]

    class Config:
        from_attributes = True


class ItemModifiersUpdate(BaseModel):
    """Schema for updating a menu item's assigned modifiers."""
    modifier_ids: List[int]


class ImageStatusUpdate(BaseModel):
    """Schema for approving an image."""
    status: ImageStatusEnum


class MenuItemImageResponse(BaseModel):
    """Schema for user-uploaded menu item image responses."""
    id: int
    menu_item_id: int
    menu_item_name: Optional[str] = None
    image_url: str
    uploaded_at: datetime
    reviewed_at: Optional[datetime] = None
    report_count: int
    status: ImageStatusEnum

    @model_validator(mode='before')
    @classmethod
    def populate_menu_item_name(cls, data: Any) -> Any:
        # when built from an ORM object, pull the related menu item name
        if hasattr(data, 'menu_item') and data.menu_item is not None:
            try:
                data.menu_item_name = data.menu_item.name
            except Exception:
                pass
        return data

    class Config:
        from_attributes = True


class TagResponse(BaseModel):
    """Schema for returning a single tag."""
    id: int
    name: str
    slug: str
    tag_group: Optional[str] = None

    class Config:
        from_attributes = True


class TagCreate(BaseModel):
    """Schema for creating a new tag."""
    name: str
    tag_group: Optional[str] = None


class ItemTagsUpdate(BaseModel):
    """Schema for replacing all tags on a menu item."""
    tag_ids: List[int]


class ImageReportCreate(BaseModel):
    """Schema for creating an image report."""
    reason: Optional[str] = None


class ImageReportResponse(BaseModel):
    """Schema for image report responses."""
    id: int
    image_id: int
    created_at: datetime
    reason: Optional[str] = None

    class Config:
        from_attributes = True


# ── Semantic search schemas ───────────────────────────────────────────────────

class MenuSearchItem(MenuItemBase):
    """
    A single result from the hybrid search endpoint.

    Inherits all menu item fields from MenuItemBase.
    The score fields are only populated when `debug=true` is passed to the
    search endpoint (except hybrid_score which is always present).
    """
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Scores — present on every result; semantic/keyword only when debug=True
    hybrid_score: float = 0.0
    semantic_score: Optional[float] = None
    keyword_score: Optional[float] = None

    class Config:
        from_attributes = True


class MenuSearchResponse(BaseModel):
    """Response envelope from GET /menu-items/search."""
    results: List[MenuSearchItem]
    # Total items that matched before top_k slicing (useful for UI feedback)
    total_candidates: int
    # "hybrid" when semantic path succeeded; "keyword_only" on fallback
    scoring_method: Literal["hybrid", "keyword_only"]
    # The model/version used (None when keyword-only)
    model: Optional[str] = None
    version: Optional[str] = None


# ── Ask Shari schemas (LLM explanation layer) ────────────────────────────────

class AskShariRequest(BaseModel):
    """Body for POST /menu-items/ask-shari."""
    query: str = Field(..., min_length=1, max_length=500)
    category_id: Optional[int] = None
    meal_period: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None


class AskShariItem(MenuItemBase):
    """Slim item payload bundled inside an Ask Shari response."""
    id: int
    hybrid_score: Optional[float] = None

    class Config:
        from_attributes = True


class AskShariRecommendation(BaseModel):
    """A single LLM-chosen (or retrieval-backfilled) recommendation."""
    id: int
    name: str
    reason: str
    highlights: List[str] = []
    item: AskShariItem


class AskShariResponse(BaseModel):
    """Response envelope from POST /menu-items/ask-shari."""
    recommendations: List[AskShariRecommendation]
    follow_up: str
    # Full ranked list — UI uses this for "more suggestions" without another LLM call.
    results: List[AskShariItem]
    more_count: int = 0
    scoring_method: Literal["hybrid", "keyword_only"]
    llm_used: bool = False
    cache_hit: bool = False