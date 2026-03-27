"""
Dashboard API endpoints.

This module provides endpoints for dashboard statistics and recent orders.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from app.core.database import get_db
from app.models.order import Order, OrderStatus
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
        # Single aggregation query for total orders and revenue
        row = db.query(
            func.count(Order.id),
            func.coalesce(func.sum(Order.total_amount), 0)
        ).one()
        total_orders = row[0]
        total_revenue = float(Decimal(str(row[1])).quantize(Decimal('0.01')))

        avg_time = 15  # Default value

        # Get active orders (orders not completed or cancelled)
        active_orders = db.query(func.count(Order.id)).filter(
            Order.status.in_([OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY])
        ).scalar() or 0

        return DashboardStats(
            total_orders=total_orders,
            total_revenue=total_revenue,
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
        
        recent_orders = [
            RecentOrder(
                id=order.id,
                table_id=order.table_id,
                status=order.status.value,
                total=float(Decimal(str(order.total_amount)).quantize(Decimal('0.01'))),
                created_at=order.created_at.isoformat()
            )
            for order in orders
        ]

        return recent_orders
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

