"""
Order and OrderItem models for the Sushi POS system.

This module defines the database models for orders and order items.
It includes:
- Order model with status tracking and timestamps
- OrderItem model for individual items in an order
- Relationships between orders, items, and tables
- Status management and validation
"""

# all the database stuff we need
from sqlalchemy import Boolean, Column, Integer, String, Text, Numeric, ForeignKey, DateTime, Table, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
from datetime import datetime
from enum import Enum
from decimal import Decimal

# this table connects order items with their modifiers (like extra sauce, no onions, etc)
order_item_modifiers = Table(
    'order_item_modifiers',
    Base.metadata,
    Column('order_item_id', Integer, ForeignKey('order_items.id'), primary_key=True),
    Column('modifier_id', Integer, ForeignKey('modifiers.id'), primary_key=True)
)

# different stages an order can be in
class OrderStatus(str, Enum):
    PENDING = "pending"  # just placed, waiting to be made
    PREPARING = "preparing"  # kitchen is making it
    READY = "ready"  # done cooking, waiting to be delivered
    DELIVERED = "delivered"  # given to the customer
    CANCELLED = "cancelled"  # customer cancelled it
    COMPLETED = "completed"  # paid for and done

# different states a table can be in
class TableStatus(str, Enum):
    AVAILABLE = "available"  # ready for customers
    OCCUPIED = "occupied"  # has customers
    RESERVED = "reserved"  # booked for later
    CLEANING = "cleaning"  # being cleaned

# a table where customers can sit
class Table(Base):
    __tablename__ = "tables"

    # basic table info
    id = Column(Integer, primary_key=True, index=True)  # unique number for each table
    number = Column(Integer, nullable=False, unique=True)  # table number
    capacity = Column(Integer, nullable=False)  # how many people can sit here
    status = Column(SQLEnum(TableStatus), nullable=False, default=TableStatus.AVAILABLE)  # current state
    reservation_time = Column(DateTime(timezone=True), nullable=True)  # when it's reserved for
    party_size = Column(Integer, nullable=True)  # how many people are sitting here
    customer_name = Column(String(255), nullable=True)  # who reserved the table
    customer_phone = Column(String(20), nullable=True)  # their phone number
    notes = Column(Text, nullable=True)  # any special requests

    # when this table was created and last updated
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # connect this table to its orders
    orders = relationship("Order", back_populates="table")

# a discount applied to an order
class Discount(Base):
    __tablename__ = "discounts"

    # basic discount info
    id = Column(Integer, primary_key=True, index=True)  # unique number for each discount
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)  # which order this is for
    type = Column(String(10), nullable=False)  # 'fixed' or 'percent' discount
    value = Column(Numeric(10, 2), nullable=False)  # how much to take off
    created_at = Column(DateTime(timezone=True), server_default=func.now())  # when the discount was added

    # connect this discount to its order
    order = relationship("Order", back_populates="discount")

# an order from a table
class Order(Base):
    __tablename__ = "orders"

    # basic order info
    id = Column(Integer, primary_key=True, index=True)  # unique number for each order
    table_id = Column(Integer, ForeignKey("tables.id"), nullable=False)  # which table ordered this
    status = Column(SQLEnum(OrderStatus), nullable=False, default=OrderStatus.PENDING)  # current state
    total_amount = Column(Numeric(10, 2), nullable=False, default=0)  # total cost
    notes = Column(Text)  # any special instructions
    ayce_order = Column(Boolean, default=False)  # is this all-you-can-eat?
    ayce_price = Column(Numeric(10, 2), default=25.00)  # price for all-you-can-eat
    price = Column(Numeric(10, 2), default=0.00)  # regular price

    # when this order was created and last updated
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # connect this order to its table, items, and discount
    table = relationship("Table", back_populates="orders")
    items = relationship("OrderItem", back_populates="order")
    discount = relationship("Discount", back_populates="order", uselist=False)

# an item in an order (like one California Roll)
class OrderItem(Base):
    __tablename__ = "order_items"

    # basic item info
    id = Column(Integer, primary_key=True, index=True)  # unique number for each item
    order_id = Column(Integer, ForeignKey("orders.id"))  # which order this is part of
    menu_item_id = Column(Integer, ForeignKey("menu_items.id"))  # which menu item this is
    quantity = Column(Integer, nullable=False, default=1)  # how many they ordered
    unit_price = Column(Numeric(10, 2), nullable=False)  # price for one
    notes = Column(Text)  # any special requests

    # when this item was added and last updated
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # connect this item to its order, menu item, and modifiers
    order = relationship("Order", back_populates="items")
    menu_item = relationship("MenuItem", back_populates="order_items")
    modifiers = relationship("Modifier", secondary=order_item_modifiers) 