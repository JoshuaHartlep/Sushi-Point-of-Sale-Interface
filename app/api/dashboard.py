"""
Dashboard API endpoints.

This module provides endpoints for dashboard statistics and recent orders.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import List
from app.core.database import get_db
from app.models.order import Order, OrderStatus
from app.schemas.order import OrderTotalResponse
from pydantic import BaseModel
from decimal import Decimal

router = APIRouter()

class DashboardStats(BaseModel):
    total_orders: int
    total_revenue: float
    average_order_time: int
    active_orders: int

class RecentOrder(BaseModel):
    id: int
    table_id: int
    status: str
    total: float
    created_at: str

@router.get("/stats", response_model=DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """
    Get dashboard statistics including total orders, revenue, and active orders.
    """
    try:
        # Get total orders
        total_orders = db.query(func.count(Order.id)).scalar() or 0
        
        # Calculate total revenue by summing all order totals
        orders = db.query(Order).all()
        total_revenue = Decimal('0.00')
        
        for order in orders:
            # Calculate order total using the existing endpoint logic
            order_total = calculate_order_total(order.id, db)
            total_revenue += Decimal(str(order_total.total))
        
        # Calculate average order time (in minutes)
        # This is a simplified calculation - you might want to adjust based on your needs
        avg_time = 15  # Default value if no orders
        
        # Get active orders (orders not completed or cancelled)
        active_orders = db.query(func.count(Order.id)).filter(
            Order.status.in_([OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY])
        ).scalar() or 0
        
        return DashboardStats(
            total_orders=total_orders,
            total_revenue=float(total_revenue.quantize(Decimal('0.01'))),
            average_order_time=avg_time,
            active_orders=active_orders
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/recent-orders", response_model=List[RecentOrder])
def get_recent_orders(db: Session = Depends(get_db)):
    """
    Get recent orders for the dashboard.
    """
    try:
        # Get the last 10 orders
        orders = db.query(Order).order_by(Order.created_at.desc()).limit(10).all()
        
        # Calculate total for each order
        recent_orders = []
        for order in orders:
            # Calculate order total using the existing endpoint logic
            order_total = calculate_order_total(order.id, db)
            
            recent_orders.append(
                RecentOrder(
                    id=order.id,
                    table_id=order.table_id,
                    status=order.status.value,
                    total=float(order_total.total.quantize(Decimal('0.01'))),
                    created_at=order.created_at.isoformat()
                )
            )
        
        return recent_orders
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def calculate_order_total(order_id: int, db: Session) -> OrderTotalResponse:
    """
    Calculate the total for an order, including items, modifiers, AYCE pricing, and discounts.
    This function replicates the logic from the GET /orders/{order_id}/total endpoint.
    """
    from app.api.order import calculate_order_total as order_total_calc
    return order_total_calc(order_id, db) 