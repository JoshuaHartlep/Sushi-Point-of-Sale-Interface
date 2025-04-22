"""
Order schemas for the Sushi POS API.

This module defines the Pydantic models for order-related data structures,
including orders, order items, and tables.
"""

from typing import Optional, List, Literal
from datetime import datetime
from pydantic import BaseModel, Field, validator
from app.models.order import TableStatus, OrderStatus
from decimal import Decimal
from enum import Enum

class DiscountType(str, Enum):
    """Discount type enum."""
    FIXED = "fixed"
    PERCENT = "percent"

class DiscountBase(BaseModel):
    """Base schema for discounts."""
    type: DiscountType
    value: Decimal = Field(..., ge=0)
    
    @validator('value')
    def validate_discount_value(cls, v, values):
        if 'type' in values and values['type'] == DiscountType.PERCENT and v > 100:
            raise ValueError('Percentage discount must be between 0 and 100')
        return v

class DiscountCreate(DiscountBase):
    """Schema for creating a discount."""
    pass

class DiscountResponse(DiscountBase):
    """Schema for discount responses."""
    id: int
    order_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class OrderItemBase(BaseModel):
    """Base schema for order items."""
    menu_item_id: int
    quantity: int = 1
    notes: Optional[str] = None

class OrderItemCreate(BaseModel):
    """Schema for creating an order item."""
    menu_item_id: int
    quantity: int
    notes: Optional[str] = None

class OrderItemResponse(OrderItemBase):
    """Schema for order item responses."""
    id: int
    order_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class OrderBase(BaseModel):
    """Base schema for orders."""
    table_id: Optional[int] = None
    status: OrderStatus = OrderStatus.PENDING
    notes: Optional[str] = None
    total_amount: Optional[float] = 0.00
    ayce_order: bool = False
    ayce_price: Decimal = Field(default=25.00, ge=0)
    price: Optional[float] = 0.00

class OrderStatus(str, Enum):
    """Order status enum."""
    PENDING = "pending"
    PREPARING = "preparing"
    READY = "ready"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    COMPLETED = "completed"

class OrderCreate(BaseModel):
    """Schema for creating an order."""
    table_id: int
    status: OrderStatus = OrderStatus.PENDING
    notes: Optional[str] = None
    ayce_order: bool = False
    ayce_price: Optional[Decimal] = None
    items: List[OrderItemCreate]

class OrderUpdate(BaseModel):
    """Schema for updating an order."""
    table_id: Optional[int] = None
    status: Optional[OrderStatus] = None
    notes: Optional[str] = None
    ayce_order: Optional[bool] = None
    ayce_price: Optional[Decimal] = None

class OrderResponse(OrderBase):
    """Schema for order responses."""
    id: int
    status: str
    total_amount: Decimal
    discount: Optional[DiscountResponse] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    items: List[OrderItemResponse]

    class Config:
        from_attributes = True

class OrderTotalResponse(BaseModel):
    """Schema for order total responses."""
    subtotal: Decimal
    discount_amount: Optional[Decimal] = None
    total: Decimal
    ayce_price: Optional[Decimal] = None
    is_ayce: bool

class TableBase(BaseModel):
    """Base schema for tables."""
    number: int
    capacity: int
    status: TableStatus = TableStatus.AVAILABLE
    reservation_time: Optional[datetime] = None
    party_size: Optional[int] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    notes: Optional[str] = None

class TableCreate(TableBase):
    """Schema for creating a table."""
    pass

class TableResponse(TableBase):
    """Schema for table responses."""
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True 