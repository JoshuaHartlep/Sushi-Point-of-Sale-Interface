"""
User management models for the Sushi POS system.

This module defines the database models for users and roles.
It includes:
- User model for system users
- Role model for user permissions
- Authentication and authorization support
"""

# all the database stuff we need
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime
import enum

# different types of users in the system
class UserRole(str, enum.Enum):
    ADMIN = "admin"  # can do everything
    MANAGER = "manager"  # can manage staff and menu
    SERVER = "server"  # can take orders and serve food
    KITCHEN = "kitchen"  # can only see and prepare orders

# a person who can use the system
class User(Base):
    __tablename__ = "users"

    # basic user info
    id = Column(Integer, primary_key=True, index=True)  # unique number for each user
    username = Column(String, unique=True, nullable=False)  # what they log in with
    email = Column(String, unique=True, nullable=False)  # their email address
    hashed_password = Column(String, nullable=False)  # their password (encrypted)
    full_name = Column(String, nullable=True)  # their real name
    role = Column(Enum(UserRole), default=UserRole.SERVER)  # what they can do
    is_active = Column(Boolean, default=True)  # whether they can log in
    is_superuser = Column(Boolean, default=False)  # whether they're an admin

    # when this user was created and last updated
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Note: Server-order relationship will be added later when needed
    # orders = relationship("Order", back_populates="server")

    # check if this user has permission to do something
    def has_permission(self, required_role: UserRole) -> bool:
        # admins can do everything, managers can do most things, etc.
        role_hierarchy = {
            UserRole.ADMIN: 4,  # highest level
            UserRole.MANAGER: 3,
            UserRole.SERVER: 2,
            UserRole.KITCHEN: 1  # lowest level
        }
        return role_hierarchy[self.role] >= role_hierarchy[required_role]

    # check if this user can handle orders
    def can_manage_orders(self) -> bool:
        # admins, managers, and servers can handle orders
        return self.role in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SERVER]

    # check if this user can change the menu
    def can_manage_menu(self) -> bool:
        # only admins and managers can change the menu
        return self.role in [UserRole.ADMIN, UserRole.MANAGER]

    # check if this user can manage other users
    def can_manage_users(self) -> bool:
        # only admins can manage users
        return self.role == UserRole.ADMIN 