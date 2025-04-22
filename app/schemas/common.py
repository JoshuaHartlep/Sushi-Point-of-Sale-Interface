from typing import TypeVar, Generic, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

T = TypeVar('T')

class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response model"""
    items: List[T]
    total: int = Field(..., description="Total number of items")
    page: int = Field(..., description="Current page number")
    size: int = Field(..., description="Number of items per page")
    pages: int = Field(..., description="Total number of pages")

class ErrorResponse(BaseModel):
    """Standard error response model"""
    code: str = Field(..., description="Error code")
    message: str = Field(..., description="Human readable error message")
    details: Optional[dict] = Field(None, description="Additional error details")

class FilterParams(BaseModel):
    """Base filter parameters"""
    skip: int = Field(0, ge=0, description="Number of items to skip")
    limit: int = Field(10, ge=1, le=100, description="Number of items to return")
    sort_by: Optional[str] = Field(None, description="Field to sort by")
    sort_order: Optional[str] = Field("asc", pattern="^(asc|desc)$", description="Sort order (asc/desc)")

class OrderFilterParams(FilterParams):
    """Filter parameters for orders"""
    status: Optional[str] = Field(None, description="Filter by order status")
    start_date: Optional[datetime] = Field(None, description="Filter by start date")
    end_date: Optional[datetime] = Field(None, description="Filter by end date")
    table_id: Optional[int] = Field(None, description="Filter by table ID")
    server_id: Optional[int] = Field(None, description="Filter by server ID")

class MenuItemFilterParams(FilterParams):
    """Filter parameters for menu items"""
    category_id: Optional[int] = Field(None, description="Filter by category ID")
    search: Optional[str] = Field(None, description="Search in name and description")
    min_price: Optional[float] = Field(None, ge=0, description="Minimum price")
    max_price: Optional[float] = Field(None, ge=0, description="Maximum price")
    available_only: Optional[bool] = Field(False, description="Show only available items")

# Error codes
class ErrorCodes:
    """Standard error codes"""
    # General errors (1000-1999)
    INVALID_INPUT = "E1000"
    NOT_FOUND = "E1001"
    ALREADY_EXISTS = "E1002"
    INVALID_STATUS = "E1003"
    
    # Order errors (2000-2999)
    ORDER_NOT_FOUND = "E2000"
    ORDER_ALREADY_COMPLETED = "E2001"
    ORDER_ITEM_NOT_FOUND = "E2002"
    INVALID_ORDER_STATUS = "E2003"
    
    # Table errors (3000-3999)
    TABLE_NOT_FOUND = "E3000"
    TABLE_NOT_AVAILABLE = "E3001"
    TABLE_ALREADY_OCCUPIED = "E3002"
    
    # Menu errors (4000-4999)
    MENU_ITEM_NOT_FOUND = "E4000"
    CATEGORY_NOT_FOUND = "E4001"
    INVALID_PRICE = "E4002"
    
    # Database errors (5000-5999)
    DATABASE_ERROR = "E5000"
    TRANSACTION_ERROR = "E5001"
    
    # Authentication errors (6000-6999)
    UNAUTHORIZED = "E6000"
    FORBIDDEN = "E6001"
    INVALID_TOKEN = "E6002" 