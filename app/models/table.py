"""
Table management models for the Sushi POS system.

This module defines the database models for tables and table status.
It includes:
- Table model for physical tables
- TableStatus model for tracking table availability
- Relationships between tables and orders
"""

# all the database stuff we need
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime
import enum

# different states a table can be in
class TableStatus(str, enum.Enum):
    AVAILABLE = "available"  # table is empty and ready
    OCCUPIED = "occupied"  # customers are sitting here
    RESERVED = "reserved"  # someone reserved this table
    CLEANING = "cleaning"  # staff is cleaning the table

# a table where customers can sit
class Table(Base):
    __tablename__ = "tables"

    # basic table info
    id = Column(Integer, primary_key=True, index=True)  # unique number for each table
    table_number = Column(String, unique=True, nullable=False)  # what number is on the table
    capacity = Column(Integer, nullable=False)  # how many people can sit here
    status = Column(Enum(TableStatus), default=TableStatus.AVAILABLE)  # current state
    location = Column(String, nullable=True)  # where in the restaurant this table is
    is_active = Column(Boolean, default=True)  # whether this table is being used

    # when this table was created and last updated
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # connect this table to its orders
    orders = relationship("Order", back_populates="table")

    # change the table's status
    def update_status(self, new_status: TableStatus):
        # update the status and record when it changed
        self.status = new_status
        self.updated_at = datetime.utcnow()

    # check if we can take an order at this table
    def is_available_for_order(self) -> bool:
        # table must be active and available
        return self.is_active and self.status == TableStatus.AVAILABLE

    # check if we can reserve this table
    def can_be_reserved(self) -> bool:
        # table must be active and either available or being cleaned
        return self.is_active and self.status in [TableStatus.AVAILABLE, TableStatus.CLEANING] 