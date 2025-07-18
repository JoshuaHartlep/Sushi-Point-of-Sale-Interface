"""
Manual database migration script to add meal_period column to menu_items table.

This script should be run to add the meal_period column to existing menu items.
Since this is a manual migration, you'll need to run it carefully.

For a proper Alembic migration, run:
alembic revision --autogenerate -m "Add meal_period column to menu_items"
alembic upgrade head
"""

import sys
import os

# Add the app directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from app.core.config import settings

def add_meal_period_column():
    """Add meal_period column to menu_items table if it doesn't exist."""
    
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='menu_items' AND column_name='meal_period'
        """))
        
        if result.fetchone():
            print("meal_period column already exists")
            return
        
        # Add the column
        conn.execute(text("""
            ALTER TABLE menu_items 
            ADD COLUMN meal_period VARCHAR(20) NOT NULL DEFAULT 'both'
        """))
        
        # Update any existing records to have 'both' as default
        conn.execute(text("""
            UPDATE menu_items 
            SET meal_period = 'both' 
            WHERE meal_period IS NULL
        """))
        
        conn.commit()
        print("Successfully added meal_period column to menu_items table")

if __name__ == "__main__":
    add_meal_period_column()