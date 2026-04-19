"""
Order management API endpoints.

This module provides endpoints for managing orders in the Sushi POS system.
It includes functionality for creating, retrieving, updating, and managing orders,
including bulk operations and status management.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
from app.core.database import get_db
from app.core.tenant import get_tenant_id
from app.models.order import Order, OrderItem, Table, TableStatus, OrderStatus, Discount
from app.models.menu import MenuItem, menu_item_modifiers
from app.models.settings import Settings, MealPeriod
from app.schemas.order import (
    OrderCreate,
    OrderUpdate,
    OrderResponse,
    OrderItemCreate,
    OrderItemResponse,
    TableCreate,
    TableUpdate,
    TableResponse,
    DiscountCreate,
    DiscountResponse,
    OrderTotalResponse
)
from app.schemas.bulk_operations import BulkOrderOperation
from app.core.error_handling import RecordNotFoundError
import logging
from pydantic import BaseModel
from enum import Enum

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()


def _to_decimal(value: Optional[object]) -> Decimal:
    return Decimal(str(value or 0))


def _get_leftover_charge_amount(order: Order) -> Decimal:
    return _to_decimal(getattr(order, "leftover_charge_amount", 0))


def _calculate_ayce_surcharge_total(order: Order) -> Decimal:
    surcharge_total = Decimal("0.00")
    for item in order.items:
        surcharge = _to_decimal(getattr(item.menu_item, "ayce_surcharge", 0))
        surcharge_total += surcharge * Decimal(str(item.quantity))
    return surcharge_total


def get_current_ayce_price(db: Session, tenant_id: int) -> Decimal:
    """
    Get the current AYCE price based on the meal period setting for a tenant.

    Args:
        db: Database session
        tenant_id: Current tenant (restaurant) ID

    Returns:
        Decimal: Current AYCE price (lunch or dinner)
    """
    try:
        # Get settings scoped to this tenant (one settings row per tenant)
        settings = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
        
        if not settings:
            logger.warning("No settings found, using default dinner price")
            return Decimal('25.00')
        
        # Return appropriate price based on current meal period
        if settings.current_meal_period == MealPeriod.LUNCH:
            return settings.ayce_lunch_price
        else:  # DINNER
            return settings.ayce_dinner_price
            
    except Exception as e:
        logger.error(f"Error getting AYCE price: {str(e)}")
        # Fallback to default dinner price
        return Decimal('25.00')


def _get_party_size(order: Order) -> int:
    """Return the party size for an order. Prefers order.party_size, falls back to table, then 1."""
    if order.party_size is not None and order.party_size > 0:
        return order.party_size
    table_size = getattr(order.table, "party_size", None)
    if table_size is not None and table_size > 0:
        logger.warning(f"Order {order.id} has no party_size — falling back to table.party_size={table_size}")
        return table_size
    logger.warning(f"Order {order.id} has no party_size and table has no party_size — defaulting to 1")
    return 1


def _calculate_order_subtotal(order: Order, db: Session, tenant_id: int) -> Decimal:
    if order.ayce_order:
        party_size = Decimal(str(_get_party_size(order)))
        return (get_current_ayce_price(db, tenant_id) * party_size) + _calculate_ayce_surcharge_total(order)

    subtotal = Decimal("0.00")
    for item in order.items:
        item_total = Decimal(str(item.unit_price)) * Decimal(str(item.quantity))
        for modifier in item.modifiers:
            item_total += Decimal(str(modifier.price)) * Decimal(str(item.quantity))
        subtotal += item_total
    return subtotal


def _calculate_order_total_amount(order: Order, db: Session, tenant_id: int) -> Decimal:
    return _calculate_order_subtotal(order, db, tenant_id) + _get_leftover_charge_amount(order)


class OrderItemsCreate(BaseModel):
    """Schema for creating multiple order items."""
    items: List[OrderItemCreate]

class DiscountType(str, Enum):
    PERCENT = "percent"
    FIXED = "fixed"

# Table endpoints
@router.post("/tables/", response_model=TableResponse)
def create_table(table: TableCreate, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    """
    Create a new table.

    Args:
        table: Table data
        db: Database session
        tenant_id: Current tenant

    Returns:
        Created table

    Raises:
        HTTPException: If table number already exists within this tenant
    """
    # Check if table number already exists within this tenant
    existing_table = db.query(Table).filter(Table.number == table.number, Table.tenant_id == tenant_id).first()
    if existing_table:
        raise HTTPException(
            status_code=409,
            detail=f"Table number {table.number} already exists"
        )

    db_table = Table(**table.model_dump(), tenant_id=tenant_id)
    db.add(db_table)
    db.commit()
    db.refresh(db_table)
    return db_table

@router.get("/tables/", response_model=List[TableResponse])
def get_tables(db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    """
    Get all tables for the current tenant.

    Args:
        db: Database session
        tenant_id: Current tenant

    Returns:
        List of tables
    """
    return db.query(Table).filter(Table.tenant_id == tenant_id).order_by(Table.number).all()

@router.get("/tables/{table_id}", response_model=TableResponse)
def get_table(table_id: int, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    """
    Get a specific table by ID.

    Args:
        table_id: ID of the table
        db: Database session
        tenant_id: Current tenant

    Returns:
        Table details

    Raises:
        HTTPException: If table not found
    """
    table = db.query(Table).filter(Table.id == table_id, Table.tenant_id == tenant_id).first()
    if not table:
        raise RecordNotFoundError("Table", table_id)
    return table

@router.patch("/tables/{table_id}", response_model=TableResponse)
def update_table(table_id: int, data: TableUpdate, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    """Update a table's number and/or capacity."""
    table = db.query(Table).filter(Table.id == table_id, Table.tenant_id == tenant_id).first()
    if not table:
        raise RecordNotFoundError("Table", table_id)
    if data.number is not None:
        existing = db.query(Table).filter(Table.number == data.number, Table.id != table_id, Table.tenant_id == tenant_id).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Table number {data.number} already exists")
        table.number = data.number
    if data.capacity is not None:
        table.capacity = data.capacity
    if data.party_size is not None:
        table.party_size = data.party_size
    db.commit()
    db.refresh(table)
    return table

@router.put("/tables/{table_id}/status", response_model=TableResponse)
def update_table_status(
    table_id: int,
    status: str = Query(..., description="Table status. Valid values: available, occupied, reserved, cleaning"),
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    """
    Update a table's status.

    Args:
        table_id: ID of the table
        status: New status (available, occupied, reserved, cleaning)
        db: Database session
        tenant_id: Current tenant

    Returns:
        Updated table

    Raises:
        HTTPException: If table not found or invalid status
    """
    table = db.query(Table).filter(Table.id == table_id, Table.tenant_id == tenant_id).first()
    if not table:
        raise RecordNotFoundError("Table", table_id)
        
    try:
        # Convert string to TableStatus enum
        table_status = TableStatus(status.upper())
        table.status = table_status
        db.commit()
        db.refresh(table)
        return table
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join([s.value for s in TableStatus])}"
        )

@router.delete("/tables/{table_id}")
def delete_table(table_id: int, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    """
    Delete a table.

    Args:
        table_id: ID of the table
        db: Database session
        tenant_id: Current tenant

    Returns:
        Success message

    Raises:
        HTTPException: If table not found or has active orders
    """
    table = db.query(Table).filter(Table.id == table_id, Table.tenant_id == tenant_id).first()
    if not table:
        raise RecordNotFoundError("Table", table_id)

    # Check if table has any active orders (scoped to tenant via table FK)
    active_orders = db.query(Order).filter(
        Order.table_id == table_id,
        Order.tenant_id == tenant_id,
        Order.status.in_(["pending", "preparing", "ready", "served"])
    ).first()
    
    if active_orders:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete table with active orders. Clear the table first."
        )
        
    db.delete(table)
    db.commit()
    return {"message": "Table deleted successfully"}

@router.post("/tables/{table_id}/clear")
def clear_table(table_id: int, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    """
    Clear all orders from a table.

    Args:
        table_id: ID of the table
        db: Database session
        tenant_id: Current tenant

    Returns:
        Success message

    Raises:
        HTTPException: If table not found
    """
    table = db.query(Table).filter(Table.id == table_id, Table.tenant_id == tenant_id).first()
    if not table:
        raise RecordNotFoundError("Table", table_id)

    # Get all orders for this table (already tenant-scoped via table ownership)
    orders = db.query(Order).filter(Order.table_id == table_id, Order.tenant_id == tenant_id).all()
    
    # Delete all order items first
    for order in orders:
        db.query(OrderItem).filter(OrderItem.order_id == order.id).delete()
    
    # Delete all orders
    for order in orders:
        db.delete(order)
    
    # Reset table status
    table.status = "available"
    
    db.commit()
    return {"message": "Table cleared successfully"}

@router.get("/tables/{table_id}/orders/", response_model=List[OrderResponse])
def get_table_orders(table_id: int, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    """
    Get all orders for a specific table.

    Args:
        table_id: ID of the table
        db: Database session
        tenant_id: Current tenant

    Returns:
        List of orders
    """
    return db.query(Order).filter(Order.table_id == table_id, Order.tenant_id == tenant_id).order_by(Order.created_at.desc()).all()

# Order endpoints
@router.get("/", response_model=List[OrderResponse])
def get_orders(
    skip: int = Query(0, description="Number of records to skip"),
    limit: int = Query(10, description="Maximum number of records to return"),
    status: Optional[str] = Query(None, description="Filter by order status. Valid values: pending, preparing, ready, delivered, cancelled, completed"),
    table_id: Optional[int] = Query(None, description="Filter by table ID"),
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    """
    Get a list of orders with optional filtering.

    Args:
        skip: Number of records to skip (for pagination)
        limit: Maximum number of records to return
        status: Filter by order status
        table_id: Filter by table ID
        db: Database session
        tenant_id: Current tenant

    Returns:
        List of orders

    Raises:
        HTTPException: If invalid status is provided
    """
    try:
        # scope to current tenant — never return another restaurant's orders
        query = db.query(Order).filter(Order.tenant_id == tenant_id)
        
        # Apply filters if provided
        if status:
            try:
                order_status = OrderStatus(status.upper())
                query = query.filter(Order.status == order_status)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid status. Must be one of: {', '.join([s.value for s in OrderStatus])}"
                )
                
        if table_id is not None:
            query = query.filter(Order.table_id == table_id)
            
        # Apply pagination and ordering
        orders = query.order_by(Order.created_at.desc()).offset(skip).limit(limit).all()
        
        return orders
    except Exception as e:
        logger.error(f"Error fetching orders: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="An error occurred while fetching orders"
        )

@router.get("/{order_id}", response_model=OrderResponse)
def get_order(order_id: int, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    """
    Get a specific order by ID.

    Args:
        order_id: ID of the order
        db: Database session
        tenant_id: Current tenant

    Returns:
        Order details

    Raises:
        HTTPException: If order not found
    """
    order = db.query(Order).filter(Order.id == order_id, Order.tenant_id == tenant_id).first()
    if not order:
        raise RecordNotFoundError("Order", order_id)
    return order

@router.post("/", response_model=OrderResponse)
def create_order(order: OrderCreate, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    """
    Create a new order.

    Args:
        order: Order data
        db: Database session
        tenant_id: Current tenant

    Returns:
        Created order

    Raises:
        HTTPException: If menu item not found
    """
    def _build_order() -> Order:
        # Create the order — inject tenant_id so it's scoped to this restaurant
        db_order = Order(
            tenant_id=tenant_id,
            table_id=order.table_id,
            status=order.status,  # Use the status from the request
            notes=order.notes,
            ayce_order=order.ayce_order,
            ayce_price=get_current_ayce_price(db, tenant_id) if order.ayce_order else Decimal('0.00'),
            party_size=order.party_size,  # stored on the order — single source of truth for AYCE math
            leftover_charge_amount=getattr(order, 'leftover_charge_amount', None) or Decimal('0.00'),
            leftover_charge_note=getattr(order, 'leftover_charge_note', None),
            total_amount=Decimal('0.00')  # Will be calculated after items are added
        )
        db.add(db_order)
        db.flush()  # Get the order ID

        # Create order items
        for item in order.items:
            # Get the menu item to get its price
            menu_item = db.query(MenuItem).filter(MenuItem.id == item.menu_item_id).first()
            if not menu_item:
                raise HTTPException(
                    status_code=404,
                    detail=f"Menu item with ID {item.menu_item_id} not found"
                )

            # Create order item with menu item's price
            db_item = OrderItem(
                order_id=db_order.id,
                menu_item_id=item.menu_item_id,
                quantity=item.quantity,
                unit_price=menu_item.price,  # Set the unit price from the menu item
                notes=item.notes,
                menu_item=menu_item,
            )
            db.add(db_item)

        # Calculate initial total
        db_order.total_amount = _calculate_order_total_amount(db_order, db, tenant_id)

        db.commit()
        db.refresh(db_order)
        return db_order

    try:
        return _build_order()
    except IntegrityError as e:
        # Auto-heal sequence drift after manual data imports/seeding.
        if "orders_pkey" in str(e):
            logger.warning("orders.id sequence out of sync; resyncing and retrying order create once")
            db.rollback()
            db.execute(
                text(
                    "SELECT setval(pg_get_serial_sequence('orders', 'id'), "
                    "COALESCE((SELECT MAX(id) FROM orders), 0) + 1, false)"
                )
            )
            db.commit()
            try:
                return _build_order()
            except Exception:
                db.rollback()
                raise
        db.rollback()
        raise
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating order: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="An error occurred while creating the order"
        )

@router.put("/{order_id}", response_model=OrderResponse)
def update_order(order_id: int, order: OrderUpdate, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    """
    Update an order.

    Args:
        order_id: ID of the order
        order: Updated order data
        db: Database session
        tenant_id: Current tenant

    Returns:
        Updated order

    Raises:
        HTTPException: If order not found, table not found, or invalid status
    """
    try:
        # Tenant filter prevents updating another restaurant's order
        db_order = db.query(Order).filter(Order.id == order_id, Order.tenant_id == tenant_id).first()
        if not db_order:
            raise RecordNotFoundError("Order", order_id)
            
        # Validate table if being updated
        if order.table_id is not None:
            table = db.query(Table).filter(Table.id == order.table_id).first()
            if not table:
                raise HTTPException(
                    status_code=404,
                    detail=f"Table ID {order.table_id} does not exist"
                )
            
        # Validate order status if being updated
        if order.status:
            try:
                # Convert string to OrderStatus enum
                order_status = OrderStatus(order.status.upper())
                db_order.status = order_status
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid status. Must be one of: {', '.join([s.value for s in OrderStatus])}"
                )
            
        # Update basic order fields
        update_data = order.model_dump(exclude={'status'}, exclude_unset=True)
        for key, value in update_data.items():
            if value is not None:  # Only update non-None values
                setattr(db_order, key, value)

        if any(key in update_data for key in ["ayce_order", "ayce_price", "party_size", "leftover_charge_amount", "leftover_charge_note"]):
            db_order.total_amount = _calculate_order_total_amount(db_order, db, tenant_id)
        
        db.commit()
        db.refresh(db_order)
        return db_order
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating order {order_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while updating the order: {str(e)}"
        )

@router.delete("/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    """
    Delete an order.

    Args:
        order_id: ID of the order
        db: Database session
        tenant_id: Current tenant

    Returns:
        Success message

    Raises:
        HTTPException: If order not found
    """
    order = db.query(Order).filter(Order.id == order_id, Order.tenant_id == tenant_id).first()
    if not order:
        raise RecordNotFoundError("Order", order_id)
        
    # Delete order items first
    db.query(OrderItem).filter(OrderItem.order_id == order_id).delete()
    
    # Delete the order
    db.delete(order)
    db.commit()
    return {"message": "Order deleted successfully"}

@router.put("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    status: OrderStatus = Query(..., description="Order status. Valid values: pending, preparing, ready, delivered, cancelled, completed"),
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    """
    Update an order's status.

    Args:
        order_id: ID of the order
        status: New status
        db: Database session
        tenant_id: Current tenant

    Returns:
        Updated order

    Raises:
        HTTPException: If order not found
    """
    order = db.query(Order).filter(Order.id == order_id, Order.tenant_id == tenant_id).first()
    if not order:
        raise RecordNotFoundError("Order", order_id)
        
    order.status = status
    if status == OrderStatus.COMPLETED:
        order.completion_time = datetime.utcnow()
        
    db.commit()
    db.refresh(order)
    return order

@router.post("/bulk-status", response_model=dict)
def bulk_update_order_status(
    order_ids: List[int],
    status: str = Query(..., description="Order status. Valid values: pending, preparing, ready, delivered, cancelled, completed"),
    notes: Optional[str] = None,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    """
    Bulk update order statuses.

    Args:
        order_ids: List of order IDs
        status: New status
        notes: Optional notes about the status change
        db: Database session
        tenant_id: Current tenant

    Returns:
        Operation results
    """
    # tenant filter prevents bulk-updating another restaurant's orders
    orders = db.query(Order).filter(Order.id.in_(order_ids), Order.tenant_id == tenant_id).all()
    if not orders:
        raise HTTPException(status_code=404, detail="No orders found")
        
    try:
        # Convert the status string to an OrderStatus enum
        order_status = OrderStatus(status.upper())
        
        for order in orders:
            order.status = order_status  # Store the enum directly
            if order_status == OrderStatus.COMPLETED:
                order.completion_time = datetime.utcnow()
            if notes:
                order.notes = notes
                
        db.commit()
        return {
            "message": f"Updated status for {len(orders)} orders",
            "affected_count": len(orders)
        }
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join([s.value for s in OrderStatus])}"
        )

@router.post("/{order_id}/discount", response_model=DiscountResponse)
def apply_discount(
    order_id: int,
    discount: DiscountCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    """
    Apply a discount to an order.

    Args:
        order_id: ID of the order
        discount: Discount details
        db: Database session
        tenant_id: Current tenant

    Returns:
        Applied discount

    Raises:
        HTTPException: If order not found or discount is invalid
    """
    try:
        # Tenant filter prevents applying discounts to another restaurant's orders
        order = db.query(Order).filter(Order.id == order_id, Order.tenant_id == tenant_id).first()
        if not order:
            raise RecordNotFoundError("Order", order_id)
            
        # Check if order already has a discount
        if order.discount:
            raise HTTPException(
                status_code=400,
                detail="Order already has a discount applied"
            )
            
        # Validate discount value
        if discount.type == DiscountType.PERCENT:
            if not 0 <= discount.value <= 100:
                raise HTTPException(
                    status_code=400,
                    detail="Percent discount must be between 0 and 100"
                )
        elif discount.value < 0:
            raise HTTPException(
                status_code=400,
                detail="Fixed discount cannot be negative"
            )
            
        # Create and apply the discount
        db_discount = Discount(
            order_id=order_id,
            type=discount.type,
            value=discount.value
        )
        db.add(db_discount)
        db.commit()
        db.refresh(db_discount)
        
        return db_discount
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error applying discount to order {order_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while applying the discount: {str(e)}"
        )

@router.get("/{order_id}/total", response_model=OrderTotalResponse)
def calculate_order_total(
    order_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    """
    Calculate the total for an order.

    Args:
        order_id: ID of the order
        db: Database session
        tenant_id: Current tenant

    Returns:
        Order total details

    Raises:
        HTTPException: If order not found
    """
    try:
        order = db.query(Order).filter(Order.id == order_id, Order.tenant_id == tenant_id).first()
        if not order:
            raise RecordNotFoundError("Order", order_id)

        subtotal = _calculate_order_subtotal(order, db, tenant_id)
        leftover_charge_amount = _get_leftover_charge_amount(order)
        ayce_base_total = None
        ayce_surcharge_total = None
        party_size = None
        if order.ayce_order:
            party_size = _get_party_size(order)
            ayce_base_total = get_current_ayce_price(db, tenant_id) * Decimal(str(party_size))
            ayce_surcharge_total = _calculate_ayce_surcharge_total(order)

        # Calculate discount amount
        discount_amount = None
        if order.discount:
            if order.discount.type == 'fixed':
                discount_amount = Decimal(str(order.discount.value))
            else:  # percent
                discount_amount = (subtotal * Decimal(str(order.discount.value))) / Decimal('100')
        
        # Calculate final total
        total = subtotal + leftover_charge_amount
        if discount_amount:
            total -= discount_amount
        
        # Round all monetary values to 2 decimal places
        subtotal = round(subtotal, 2)
        if discount_amount:
            discount_amount = round(discount_amount, 2)
        total = round(total, 2)
        
        return OrderTotalResponse(
            subtotal=subtotal,
            discount_amount=discount_amount,
            total=total,
            ayce_price=get_current_ayce_price(db, tenant_id) if order.ayce_order else None,
            ayce_base_total=round(ayce_base_total, 2) if ayce_base_total is not None else None,
            ayce_surcharge_total=round(ayce_surcharge_total, 2) if ayce_surcharge_total is not None else None,
            leftover_charge_amount=round(leftover_charge_amount, 2),
            is_ayce=order.ayce_order,
            party_size=party_size,
        )
    except Exception as e:
        logger.error(f"Error calculating order total for order {order_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while calculating the order total: {str(e)}"
        )

@router.post("/{order_id}/items", response_model=OrderResponse)
def add_items_to_order(
    order_id: int,
    order_items: OrderItemsCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    """
    Add items to an existing order.

    Args:
        order_id: ID of the order
        order_items: List of items to add
        db: Database session
        tenant_id: Current tenant

    Returns:
        Updated order

    Raises:
        HTTPException: If order not found, menu items not found, or order is completed
    """
    try:
        # Tenant filter prevents adding items to another restaurant's order
        order = db.query(Order).filter(Order.id == order_id, Order.tenant_id == tenant_id).first()
        if not order:
            raise RecordNotFoundError("Order", order_id)
            
        # Check if order is completed
        if order.status == OrderStatus.COMPLETED:
            raise HTTPException(
                status_code=400,
                detail="Cannot add items to a completed order"
            )
            
        # Add each item
        for item in order_items.items:
            try:
                # Validate menu item exists
                menu_item = db.query(MenuItem).filter(MenuItem.id == item.menu_item_id).first()
                if not menu_item:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Menu item with ID {item.menu_item_id} not found"
                    )
                    
                # Validate quantity
                if item.quantity <= 0:
                    raise HTTPException(
                        status_code=400,
                        detail="Quantity must be a positive integer"
                    )
                    
                # Create order item
                db_item = OrderItem(
                    order_id=order_id,
                    menu_item_id=item.menu_item_id,
                    quantity=item.quantity,
                    unit_price=menu_item.price,
                    notes=item.notes
                )
                db.add(db_item)
                
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Error adding item to order: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=500,
                    detail=f"Error adding item to order: {str(e)}"
                )
        
        # Update order status if needed
        if order.status == OrderStatus.PENDING:
            order.status = OrderStatus.PREPARING

        # Recalculate order total
        order.total_amount = _calculate_order_total_amount(order, db, tenant_id)

        db.commit()
        db.refresh(order)
        return order
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding items to order {order_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while adding items to the order: {str(e)}"
        )

@router.delete("/{order_id}/discount")
def remove_discount(
    order_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    """
    Remove a discount from an order.

    Args:
        order_id: ID of the order
        db: Database session
        tenant_id: Current tenant

    Returns:
        Success message

    Raises:
        HTTPException: If order not found or no discount exists
    """
    try:
        # Tenant filter prevents removing discounts from another restaurant's orders
        order = db.query(Order).filter(Order.id == order_id, Order.tenant_id == tenant_id).first()
        if not order:
            raise RecordNotFoundError("Order", order_id)
            
        # Check if order has a discount
        if not order.discount:
            raise HTTPException(
                status_code=404,
                detail="No discount found for this order"
            )
            
        # Delete the discount
        db.delete(order.discount)
        db.commit()
        
        return {"message": "Discount removed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing discount from order {order_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while removing the discount: {str(e)}"
        )

@router.delete("/{order_id}/items/{item_id}")
def delete_order_item(
    order_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    """
    Delete an item from an order.

    Args:
        order_id: ID of the order
        item_id: ID of the item to delete
        db: Database session
        tenant_id: Current tenant

    Returns:
        Success message

    Raises:
        HTTPException: If order or item not found, or order is completed
    """
    try:
        # Tenant filter prevents deleting items from another restaurant's order
        order = db.query(Order).filter(Order.id == order_id, Order.tenant_id == tenant_id).first()
        if not order:
            raise RecordNotFoundError("Order", order_id)
            
        # Check if order is completed
        if order.status == OrderStatus.COMPLETED:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete items from a completed order"
            )
            
        # Find and delete the item
        item = db.query(OrderItem).filter(
            OrderItem.id == item_id,
            OrderItem.order_id == order_id
        ).first()
        
        if not item:
            raise RecordNotFoundError("OrderItem", item_id)
            
        db.delete(item)
        db.flush()

        # Recalculate order total after item deletion
        order.total_amount = _calculate_order_total_amount(order, db, tenant_id)

        db.commit()
        
        return {"message": "Item deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting item {item_id} from order {order_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while deleting the item: {str(e)}"
        )