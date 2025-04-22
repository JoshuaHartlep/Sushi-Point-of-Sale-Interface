"""
Bulk operation schemas for the Sushi POS API.

This module defines the Pydantic models for bulk operations,
such as creating, updating, or deleting multiple items at once.
"""

from typing import List, Optional, Union, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum

class BulkOperationType(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"

class BulkMenuItemOperation(BaseModel):
    """Schema for bulk menu item operations."""
    operation_type: str  # create, update, delete
    item_ids: Optional[List[int]] = None
    data: Dict[str, Any]

class BulkOrderOperation(BaseModel):
    """Schema for bulk order operations."""
    operation_type: str  # update-status, delete
    order_ids: List[int]
    data: Optional[Dict[str, Any]] = None

class BulkMenuItemResponse(BaseModel):
    """Response model for bulk menu item operations"""
    success: bool = Field(..., description="Whether the operation was successful")
    operation: BulkOperationType = Field(..., description="Type of operation performed")
    affected_items: List[int] = Field(..., description="List of affected item IDs")
    errors: Optional[List[dict]] = Field(None, description="List of errors if any")

class BulkOrderStatusUpdate(BaseModel):
    """
    Schema for bulk status updates on orders.
    
    Allows updating the status of multiple orders at once, with optional notes
    for tracking the reason for the status change.
    
    Attributes:
        order_ids (List[int]): List of order IDs to update
        status (str): New status for the orders
        notes (Optional[str]): Optional notes about the status change
    """
    order_ids: List[int] = Field(..., description="List of order IDs to update")
    status: str = Field(..., description="New status for the orders")
    notes: Optional[str] = Field(None, description="Optional notes about the status change")

class BulkPriceUpdate(BaseModel):
    """Model for bulk price updates"""
    item_ids: List[int] = Field(..., description="List of menu item IDs to update")
    price_adjustment: float = Field(..., description="Amount to adjust price by")
    adjustment_type: str = Field(..., pattern="^(fixed|percentage)$", description="Type of price adjustment")

class BulkAvailabilityUpdate(BaseModel):
    """Model for bulk availability updates"""
    item_ids: List[int] = Field(..., description="List of menu item IDs to update")
    is_available: bool = Field(..., description="New availability status")

class BulkOperationResponse(BaseModel):
    """Generic response model for bulk operations"""
    success: bool = Field(..., description="Whether the operation was successful")
    affected_count: int = Field(..., description="Number of items affected")
    errors: Optional[List[dict]] = Field(None, description="List of errors if any")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Timestamp of the operation")

class BulkMenuItemPriceUpdate(BaseModel):
    """
    Schema for bulk price updates on menu items.
    
    Supports two types of price adjustments:
    - Fixed amount (add/subtract a specific amount)
    - Percentage-based (increase/decrease by a percentage)
    
    Attributes:
        item_ids (List[int]): List of menu item IDs to update
        price_adjustment (float): Amount to adjust the price by
        adjustment_type (str): Type of adjustment ('fixed' or 'percentage')
    """
    item_ids: List[int] = Field(..., description="List of menu item IDs to update")
    price_adjustment: float = Field(..., description="Amount to adjust the price by")
    adjustment_type: str = Field(..., description="Type of adjustment: 'fixed' or 'percentage'")

class BulkMenuItemAvailabilityUpdate(BaseModel):
    """
    Schema for bulk availability updates on menu items.
    
    Allows updating the availability status of multiple menu items at once.
    
    Attributes:
        item_ids (List[int]): List of menu item IDs to update
        is_available (bool): New availability status
    """
    item_ids: List[int] = Field(..., description="List of menu item IDs to update")
    is_available: bool = Field(..., description="New availability status") 