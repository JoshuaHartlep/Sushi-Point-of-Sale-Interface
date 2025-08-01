"""
Settings management endpoints.

This module provides endpoints for managing application settings.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.settings import Settings, MealPeriod
from app.schemas.settings import SettingsResponse, SettingsUpdate
from app.core.error_handling import RecordNotFoundError
import logging

# set up logging so we can see what's going wrong
logger = logging.getLogger(__name__)

# this is where we define all our settings-related routes
router = APIRouter()

# get current settings (always returns the single settings record)
@router.get("/settings/", response_model=SettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    """
    Get current application settings.
    
    Returns the current settings including AYCE prices, restaurant name, and timezone.
    If no settings exist, creates default settings first.
    """
    try:
        # try to get the settings record (should be id=1)
        settings = db.query(Settings).filter(Settings.id == 1).first()
        
        # if no settings exist, create default ones
        if not settings:
            logger.info("No settings found, creating default settings")
            settings = Settings(
                id=1,
                restaurant_name="Sushi Restaurant",
                timezone="America/New_York",
                ayce_lunch_price=20.00,
                ayce_dinner_price=25.00
            )
            db.add(settings)
            db.commit()
            db.refresh(settings)
            
        return settings
        
    except Exception as e:
        logger.error(f"Error getting settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


# update settings (always updates the single settings record)
@router.patch("/settings/", response_model=SettingsResponse)
def update_settings(settings_update: SettingsUpdate, db: Session = Depends(get_db)):
    """
    Update application settings.
    
    Updates the current settings with provided values. Only provided fields will be updated.
    Creates default settings if none exist.
    """
    try:
        # get the current settings record
        settings = db.query(Settings).filter(Settings.id == 1).first()
        
        # if no settings exist, create default ones first
        if not settings:
            logger.info("No settings found, creating default settings before update")
            settings = Settings(
                id=1,
                restaurant_name="Sushi Restaurant", 
                timezone="America/New_York",
                ayce_lunch_price=20.00,
                ayce_dinner_price=25.00
            )
            db.add(settings)
            db.commit()
            db.refresh(settings)
        
        # update only the fields that were provided
        update_data = settings_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(settings, field, value)
        
        # save the changes
        db.commit()
        db.refresh(settings)
        
        logger.info(f"Settings updated successfully: {update_data}")
        return settings
        
    except ValueError as e:
        logger.error(f"Validation error updating settings: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.patch("/settings/meal-period", response_model=SettingsResponse)
def update_meal_period(meal_period: MealPeriod, db: Session = Depends(get_db)):
    """
    Update the current meal period setting.
    
    This endpoint allows quick switching between lunch and dinner periods
    without needing to update other settings.
    
    Args:
        meal_period: The new meal period (LUNCH or DINNER)
        db: Database session
        
    Returns:
        Updated settings with new meal period
        
    Raises:
        HTTPException: If settings not found or update fails
    """
    try:
        # Get the current settings record
        settings = db.query(Settings).filter(Settings.id == 1).first()
        
        # If no settings exist, create default ones with the specified meal period
        if not settings:
            logger.info("No settings found, creating default settings with specified meal period")
            settings = Settings(
                id=1,
                restaurant_name="Sushi Restaurant", 
                timezone="America/New_York",
                current_meal_period=meal_period,
                ayce_lunch_price=20.00,
                ayce_dinner_price=25.00
            )
            db.add(settings)
        else:
            # Update the meal period
            settings.current_meal_period = meal_period
        
        # Save the changes
        db.commit()
        db.refresh(settings)
        
        logger.info(f"Meal period updated to: {meal_period}")
        return settings
        
    except ValueError as e:
        logger.error(f"Validation error updating meal period: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating meal period: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")