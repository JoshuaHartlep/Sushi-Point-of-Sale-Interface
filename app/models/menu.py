"""
Menu models for the Sushi POS system.

This module defines the database models for menu items, categories, and modifiers.
It includes:
- MenuItem model for individual menu items
- Category model for organizing menu items
- Modifier model for item customizations
- Relationships between models
"""

# all the database stuff we need
from sqlalchemy import Boolean, Column, Integer, String, Text, Numeric, ForeignKey, DateTime, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
from datetime import datetime

# this table connects menu items with their modifiers (like extra sauce, no onions, etc)
menu_item_modifiers = Table(
    'menu_item_modifiers',
    Base.metadata,
    Column('menu_item_id', Integer, ForeignKey('menu_items.id'), primary_key=True),
    Column('modifier_id', Integer, ForeignKey('modifiers.id'), primary_key=True)
)

# a category is like "Appetizers" or "Sushi Rolls"
class Category(Base):
    """
    Database model for menu categories.
    
    This model represents a category that groups related menu items.
    It includes:
    - Basic category information (name, description)
    - Timestamps for tracking
    - Relationship to menu items
    
    Attributes:
        id (int): Primary key
        name (str): Category name
        display_order (int): Order of the category in the menu
        created_at (datetime): Record creation timestamp
        updated_at (datetime): Record update timestamp
    """
    __tablename__ = "categories"

    # basic category info
    id = Column(Integer, primary_key=True, index=True)  # unique number for each category
    name = Column(String(100), nullable=False)  # category name
    description = Column(String, nullable=True)  # optional description
    display_order = Column(Integer, nullable=False, default=0)  # where to show this in the menu

    # when this category was created and last updated
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # connect this category to its menu items and modifiers
    menu_items = relationship("MenuItem", back_populates="category")
    modifiers = relationship("Modifier", back_populates="category")

# a modifier is like "extra sauce" or "no onions" that you can add to menu items
class Modifier(Base):
    """
    Database model for menu item modifiers.
    
    This model represents customization options for menu items.
    It includes:
    - Basic modifier information (name, price)
    - Category association (optional)
    - Availability status
    - Timestamps for tracking
    
    Attributes:
        id (int): Primary key
        name (str): Modifier name
        price (Numeric): Additional price for the modifier
        category_id (int): Optional foreign key to category
        is_available (bool): Whether the modifier is available
        created_at (datetime): Record creation timestamp
        updated_at (datetime): Record update timestamp
    """
    __tablename__ = "modifiers"

    # basic modifier info
    id = Column(Integer, primary_key=True, index=True)  # unique number for each modifier
    name = Column(String(100), nullable=False)  # modifier name
    description = Column(Text)  # what this modifier does
    price = Column(Numeric(10, 2), nullable=False)  # how much extra it costs
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)  # optional category this belongs to
    is_available = Column(Boolean, default=True)  # whether we can use this modifier right now
    display_order = Column(Integer, nullable=False, default=0)  # where to show this in the list

    # when this modifier was created and last updated
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # connect this modifier to its category and menu items
    category = relationship("Category", back_populates="modifiers")
    menu_items = relationship("MenuItem", secondary=menu_item_modifiers, back_populates="modifiers")

# a menu item is something you can order, like "California Roll"
class MenuItem(Base):
    """
    Database model for menu items.
    
    This model represents an individual item on the menu. It includes:
    - Basic item information (name, description, price)
    - Availability status
    - Category relationship
    - Modifier options
    - Timestamps for tracking
    
    Attributes:
        id (int): Primary key
        name (str): Item name
        description (str): Item description
        price (Numeric): Item price
        category_id (int): Foreign key to the category
        is_available (bool): Whether the item is available
        created_at (datetime): Record creation timestamp
        updated_at (datetime): Record update timestamp
    """
    __tablename__ = "menu_items"

    # basic item info
    id = Column(Integer, primary_key=True, index=True)  # unique number for each item
    name = Column(String(100), nullable=False)  # item name
    description = Column(Text)  # what's in this item
    price = Column(Numeric(10, 2), nullable=False)  # how much it costs
    category_id = Column(Integer, ForeignKey("categories.id"))  # which category this is in
    image_url = Column(String(255))  # picture of the item
    is_available = Column(Boolean, default=True)  # whether we can order this right now
    is_popular = Column(Boolean, default=False)  # whether this is a popular item
    display_order = Column(Integer, nullable=False, default=0)  # where to show this in the menu

    # when this item was created and last updated
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # connect this item to its category, modifiers, and orders
    category = relationship("Category", back_populates="menu_items")
    modifiers = relationship("Modifier", secondary=menu_item_modifiers, back_populates="menu_items")
    order_items = relationship("OrderItem", back_populates="menu_item") 