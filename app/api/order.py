"""
Order management API endpoints.

This module provides endpoints for managing orders in the Sushi POS system.
It includes functionality for creating, retrieving, updating, and managing orders,
including bulk operations and status management.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
from app.core.database import get_db
from app.models.order import Order, OrderItem, Table, TableStatus, OrderStatus, Discount
from app.models.menu import MenuItem, menu_item_modifiers
from app.schemas.order import (
    OrderCreate,
    OrderUpdate,
    OrderResponse,
    OrderItemCreate,
    OrderItemResponse,
    TableCreate,
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

class OrderItemsCreate(BaseModel):
    """Schema for creating multiple order items."""
    items: List[OrderItemCreate]

class DiscountType(str, Enum):
    PERCENT = "percent"
    FIXED = "fixed"

# Table endpoints
@router.post("/tables/", response_model=TableResponse)
def create_table(table: TableCreate, db: Session = Depends(get_db)):
    """
    Create a new table.
    
    Args:
        table: Table data
        db: Database session
        
    Returns:
        Created table
        
    Raises:
        HTTPException: If table number already exists
    """
    # Check if table number already exists
    existing_table = db.query(Table).filter(Table.number == table.number).first()
    if existing_table:
        raise HTTPException(
            status_code=409,
            detail=f"Table number {table.number} already exists"
        )
        
    db_table = Table(**table.model_dump())
    db.add(db_table)
    db.commit()
    db.refresh(db_table)
    return db_table

@router.get("/tables/", response_model=List[TableResponse])
def get_tables(db: Session = Depends(get_db)):
    """
    Get all tables.
    
    Args:
        db: Database session
        
    Returns:
        List of tables
    """
    return db.query(Table).order_by(Table.number).all()

@router.get("/tables/{table_id}", response_model=TableResponse)
def get_table(table_id: int, db: Session = Depends(get_db)):
    """
    Get a specific table by ID.
    
    Args:
        table_id: ID of the table
        db: Database session
        
    Returns:
        Table details
        
    Raises:
        HTTPException: If table not found
    """
    table = db.query(Table).filter(Table.id == table_id).first()
    if not table:
        raise RecordNotFoundError("Table", table_id)
    return table

@router.put("/tables/{table_id}/status", response_model=TableResponse)
def update_table_status(
    table_id: int, 
    status: str = Query(..., description="Table status. Valid values: available, occupied, reserved, cleaning"), 
    db: Session = Depends(get_db)
):
    """
    Update a table's status.
    
    Args:
        table_id: ID of the table
        status: New status (available, occupied, reserved, cleaning)
        db: Database session
        
    Returns:
        Updated table
        
    Raises:
        HTTPException: If table not found or invalid status
    """
    table = db.query(Table).filter(Table.id == table_id).first()
    if not table:
        raise RecordNotFoundError("Table", table_id)
        
    try:
        # Convert string to TableStatus enum
        table_status = TableStatus(status.lower())
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
def delete_table(table_id: int, db: Session = Depends(get_db)):
    """
    Delete a table.
    
    Args:
        table_id: ID of the table
        db: Database session
        
    Returns:
        Success message
        
    Raises:
        HTTPException: If table not found or has active orders
    """
    table = db.query(Table).filter(Table.id == table_id).first()
    if not table:
        raise RecordNotFoundError("Table", table_id)
        
    # Check if table has any active orders
    active_orders = db.query(Order).filter(
        Order.table_id == table_id,
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
def clear_table(table_id: int, db: Session = Depends(get_db)):
    """
    Clear all orders from a table.
    
    Args:
        table_id: ID of the table
        db: Database session
        
    Returns:
        Success message
        
    Raises:
        HTTPException: If table not found
    """
    table = db.query(Table).filter(Table.id == table_id).first()
    if not table:
        raise RecordNotFoundError("Table", table_id)
        
    # Get all orders for this table
    orders = db.query(Order).filter(Order.table_id == table_id).all()
    
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
def get_table_orders(table_id: int, db: Session = Depends(get_db)):
    """
    Get all orders for a specific table.
    
    Args:
        table_id: ID of the table
        db: Database session
        
    Returns:
        List of orders
    """
    return db.query(Order).filter(Order.table_id == table_id).order_by(Order.created_at.desc()).all()

# Order endpoints
@router.get("/", response_model=List[OrderResponse])
def get_orders(
    skip: int = Query(0, description="Number of records to skip"),
    limit: int = Query(10, description="Maximum number of records to return"),
    status: Optional[str] = Query(None, description="Filter by order status. Valid values: pending, preparing, ready, delivered, cancelled, completed"),
    table_id: Optional[int] = Query(None, description="Filter by table ID"),
    db: Session = Depends(get_db)
):
    """
    Get a list of orders with optional filtering.
    
    Args:
        skip: Number of records to skip (for pagination)
        limit: Maximum number of records to return
        status: Filter by order status
        table_id: Filter by table ID
        db: Database session
        
    Returns:
        List of orders
        
    Raises:
        HTTPException: If invalid status is provided
    """
    try:
        query = db.query(Order)
        
        # Apply filters if provided
        if status:
            try:
                order_status = OrderStatus(status.lower())
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
def get_order(order_id: int, db: Session = Depends(get_db)):
    """
    Get a specific order by ID.
    
    Args:
        order_id: ID of the order
        db: Database session
        
    Returns:
        Order details
        
    Raises:
        HTTPException: If order not found
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise RecordNotFoundError("Order", order_id)
    return order

@router.post("/", response_model=OrderResponse)
def create_order(order: OrderCreate, db: Session = Depends(get_db)):
    """
    Create a new order.
    
    Args:
        order: Order data
        db: Database session
        
    Returns:
        Created order
        
    Raises:
        HTTPException: If menu item not found
    """
    try:
        # Create the order
        db_order = Order(
            table_id=order.table_id,
            status=order.status,  # Use the status from the request
            notes=order.notes,
            ayce_order=order.ayce_order,
            ayce_price=order.ayce_price or Decimal('25.00'),
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
                notes=item.notes
            )
            db.add(db_item)
        
        # Calculate initial total
        if db_order.ayce_order:
            db_order.total_amount = db_order.ayce_price
        else:
            # Calculate total from items
            total = Decimal('0.00')
            for item in db_order.items:
                total += Decimal(str(item.unit_price)) * Decimal(str(item.quantity))
            db_order.total_amount = total
        
        db.commit()
        db.refresh(db_order)
        return db_order
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating order: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="An error occurred while creating the order"
        )

@router.put("/{order_id}", response_model=OrderResponse)
def update_order(order_id: int, order: OrderUpdate, db: Session = Depends(get_db)):
    """
    Update an order.
    
    Args:
        order_id: ID of the order
        order: Updated order data
        db: Database session
        
    Returns:
        Updated order
        
    Raises:
        HTTPException: If order not found, table not found, or invalid status
    """
    try:
        # Get the order
        db_order = db.query(Order).filter(Order.id == order_id).first()
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
                order_status = OrderStatus(order.status.lower())
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
def delete_order(order_id: int, db: Session = Depends(get_db)):
    """
    Delete an order.
    
    Args:
        order_id: ID of the order
        db: Database session
        
    Returns:
        Success message
        
    Raises:
        HTTPException: If order not found
    """
    order = db.query(Order).filter(Order.id == order_id).first()
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
    db: Session = Depends(get_db)
):
    """
    Update an order's status.
    
    Args:
        order_id: ID of the order
        status: New status
        db: Database session
        
    Returns:
        Updated order
        
    Raises:
        HTTPException: If order not found
    """
    order = db.query(Order).filter(Order.id == order_id).first()
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
    db: Session = Depends(get_db)
):
    """
    Bulk update order statuses.
    
    Args:
        order_ids: List of order IDs
        status: New status
        notes: Optional notes about the status change
        db: Database session
        
    Returns:
        Operation results
    """
    orders = db.query(Order).filter(Order.id.in_(order_ids)).all()
    if not orders:
        raise HTTPException(status_code=404, detail="No orders found")
        
    try:
        # Convert the status string to an OrderStatus enum
        order_status = OrderStatus(status.lower())
        
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
    db: Session = Depends(get_db)
):
    """
    Apply a discount to an order.
    
    Args:
        order_id: ID of the order
        discount: Discount details
        db: Database session
        
    Returns:
        Applied discount
        
    Raises:
        HTTPException: If order not found or discount is invalid
    """
    try:
        # Get the order
        order = db.query(Order).filter(Order.id == order_id).first()
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
    db: Session = Depends(get_db)
):
    """
    Calculate the total for an order.
    
    Args:
        order_id: ID of the order
        db: Database session
        
    Returns:
        Order total details
        
    Raises:
        HTTPException: If order not found
    """
    try:
        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise RecordNotFoundError("Order", order_id)
            
        # Calculate subtotal based on order type
        if order.ayce_order:
            # AYCE orders have a fixed price of $25.00
            subtotal = Decimal('25.00')
        else:
            # Regular orders calculate from items and modifiers
            subtotal = Decimal('0')
            for item in order.items:
                # Calculate item total
                item_total = Decimal(str(item.unit_price)) * Decimal(str(item.quantity))
                
                # Add modifier costs
                for modifier in item.modifiers:
                    item_total += Decimal(str(modifier.price)) * Decimal(str(item.quantity))
                
                subtotal += item_total
        
        # Calculate discount amount
        discount_amount = None
        if order.discount:
            if order.discount.type == 'fixed':
                discount_amount = Decimal(str(order.discount.value))
            else:  # percent
                discount_amount = (subtotal * Decimal(str(order.discount.value))) / Decimal('100')
        
        # Calculate final total
        total = subtotal
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
            ayce_price=Decimal('25.00') if order.ayce_order else None,
            is_ayce=order.ayce_order
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
    db: Session = Depends(get_db)
):
    """
    Add items to an existing order.
    
    Args:
        order_id: ID of the order
        order_items: List of items to add
        db: Database session
        
    Returns:
        Updated order
        
    Raises:
        HTTPException: If order not found, menu items not found, or order is completed
    """
    try:
        # Get the order
        order = db.query(Order).filter(Order.id == order_id).first()
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
    db: Session = Depends(get_db)
):
    """
    Remove a discount from an order.
    
    Args:
        order_id: ID of the order
        db: Database session
        
    Returns:
        Success message
        
    Raises:
        HTTPException: If order not found or no discount exists
    """
    try:
        # Get the order
        order = db.query(Order).filter(Order.id == order_id).first()
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
    db: Session = Depends(get_db)
):
    """
    Delete an item from an order.
    
    Args:
        order_id: ID of the order
        item_id: ID of the item to delete
        db: Database session
        
    Returns:
        Success message
        
    Raises:
        HTTPException: If order or item not found, or order is completed
    """
    try:
        # Get the order
        order = db.query(Order).filter(Order.id == order_id).first()
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