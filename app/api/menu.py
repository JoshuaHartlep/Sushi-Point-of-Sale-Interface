"""
Menu management endpoints.

This module provides endpoints for managing menu items and categories.
"""

# all the stuff we need to make the API work
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.tenant import get_tenant_id
from app.models.menu import MenuItem, Category, Modifier
from app.schemas.menu import (
    MenuItemCreate,
    MenuItemUpdate,
    MenuItemResponse,
    CategoryCreate,
    CategoryResponse,
    ModifierCreate,
    ModifierResponse,
    ModifierUpdate,
    CategoryUpdate,
    ItemModifiersResponse,
    ItemModifiersUpdate,
)
from app.schemas.bulk_operations import BulkMenuItemOperation, BulkMenuItemResponse, BulkOperationType
from app.core.error_handling import RecordNotFoundError
import logging
import os
import uuid
import shutil

# set up logging so we can see what's going wrong
logger = logging.getLogger(__name__)

# this is where we define all our menu-related routes
router = APIRouter()


def _normalize_menu_item_meal_period_values(db: Session) -> None:
    """
    Normalize legacy lowercase meal_period values to current uppercase enum values.
    """
    db.execute(
        text(
            """
            UPDATE menu_items
            SET meal_period = CAST(UPPER(CAST(meal_period AS TEXT)) AS mealperiodenum)
            WHERE LOWER(CAST(meal_period AS TEXT)) IN ('lunch', 'dinner', 'both')
            """
        )
    )
    db.commit()

# get a list of menu items, with options to filter/search
@router.get("/menu-items/", response_model=List[MenuItemResponse])
def get_menu_items(
    skip: int = Query(0, ge=0),  # how many items to skip (for pagination)
    limit: int = Query(12, ge=1, le=500),  # how many items to show per page
    category_id: Optional[int] = None,  # filter by category
    search: Optional[str] = None,  # search by name or description
    min_price: Optional[float] = None,  # minimum price filter
    max_price: Optional[float] = None,  # maximum price filter
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    # scope to the current tenant — never return another restaurant's items
    query = db.query(MenuItem).filter(MenuItem.tenant_id == tenant_id)
    
    # add filters one by one if they're provided
    if category_id:
        query = query.filter(MenuItem.category_id == category_id)
    if search:
        search = f"%{search}%"  # make it a wildcard search
        query = query.filter(
            (MenuItem.name.ilike(search)) |
            (MenuItem.description.ilike(search))
        )
    if min_price is not None:
        query = query.filter(MenuItem.price >= min_price)
    if max_price is not None:
        query = query.filter(MenuItem.price <= max_price)

    # predictable ordering: alphabetical by name (especially important for "All" / unpaginated customer menus)
    query = query.order_by(MenuItem.name.asc())

    # skip and limit for pagination, then get all matching items
    try:
        return query.offset(skip).limit(limit).all()
    except LookupError as e:
        # Auto-heal rows created before enum casing was standardized.
        if "mealperiodenum" in str(e).lower():
            logger.warning("Normalizing legacy meal_period enum values and retrying menu query once")
            db.rollback()
            _normalize_menu_item_meal_period_values(db)
            return query.offset(skip).limit(limit).all()
        raise

# get one specific menu item by its ID
@router.get("/menu-items/{item_id}", response_model=MenuItemResponse)
def get_menu_item(item_id: int, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    # look up the item — tenant filter prevents cross-tenant access
    item = db.query(MenuItem).filter(MenuItem.id == item_id, MenuItem.tenant_id == tenant_id).first()
    if not item:
        raise RecordNotFoundError("MenuItem", item_id)
    return item

# add a new menu item
@router.post("/menu-items/", response_model=MenuItemResponse)
def create_menu_item(item: MenuItemCreate, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    # inject tenant_id so the new item is scoped to the current restaurant
    db_item = MenuItem(**item.model_dump(), tenant_id=tenant_id)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

# update some fields of a menu item
@router.patch("/menu-items/{item_id}", response_model=MenuItemResponse)
def patch_menu_item(item_id: int, item: MenuItemUpdate, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    # tenant filter ensures we can't accidentally edit another restaurant's item
    db_item = db.query(MenuItem).filter(MenuItem.id == item_id, MenuItem.tenant_id == tenant_id).first()
    if not db_item:
        raise RecordNotFoundError("MenuItem", item_id)
        
    # only update the fields that were actually provided
    for key, value in item.model_dump(exclude_unset=True).items():
        setattr(db_item, key, value)
        
    db.commit()
    db.refresh(db_item)
    return db_item

# upload an image for a menu item and store it in S3
@router.post("/menu-items/{item_id}/upload-image", response_model=MenuItemResponse)
def upload_menu_item_image(
    item_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    from app.core.s3 import upload_image, delete_image

    # check the item exists within this tenant
    db_item = db.query(MenuItem).filter(MenuItem.id == item_id, MenuItem.tenant_id == tenant_id).first()
    if not db_item:
        raise RecordNotFoundError("MenuItem", item_id)

    # only allow common image types
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, and GIF images are allowed")

    from app.core.upload_limits import MANAGER_IMAGE_MAX_BYTES, buffer_upload_file

    buf = buffer_upload_file(file, MANAGER_IMAGE_MAX_BYTES, "manager")

    # delete old image from S3 if one exists
    if db_item.image_url:
        delete_image(db_item.image_url)

    # upload new image to S3
    s3_url = upload_image(buf, "menu-images", item_id, file.filename or "image.jpg", file.content_type)

    db_item.image_url = s3_url
    db.commit()
    db.refresh(db_item)
    return db_item


# remove the image from a menu item
@router.delete("/menu-items/{item_id}/image", response_model=MenuItemResponse)
def delete_menu_item_image(item_id: int, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    from app.core.s3 import delete_image

    db_item = db.query(MenuItem).filter(MenuItem.id == item_id, MenuItem.tenant_id == tenant_id).first()
    if not db_item:
        raise RecordNotFoundError("MenuItem", item_id)

    if db_item.image_url:
        delete_image(db_item.image_url)
        db_item.image_url = None
        db.commit()
        db.refresh(db_item)

    return db_item


# delete a menu item
@router.delete("/menu-items/{item_id}")
def delete_menu_item(item_id: int, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    # tenant filter prevents deleting another restaurant's items
    db_item = db.query(MenuItem).filter(MenuItem.id == item_id, MenuItem.tenant_id == tenant_id).first()
    if not db_item:
        raise RecordNotFoundError("MenuItem", item_id)
        
    db.delete(db_item)
    db.commit()
    return {"message": "Menu item deleted successfully"}

# do a bunch of operations on menu items at once
@router.post("/menu-items/bulk", response_model=BulkMenuItemResponse)
def bulk_menu_item_operation(operation: BulkMenuItemOperation, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    # keep track of what we changed and any errors
    affected_items = []
    errors = []

    try:
        # handle creating multiple items
        if operation.operation_type == "create":
            items = []
            for item_data in operation.data:
                try:
                    db_item = MenuItem(**item_data, tenant_id=tenant_id)
                    db.add(db_item)
                    items.append(db_item)
                except Exception as e:
                    errors.append({"item": item_data, "error": str(e)})
            db.commit()
            for item in items:
                db.refresh(item)
                affected_items.append(item.id)
            return BulkMenuItemResponse(
                success=True,
                operation=BulkOperationType.CREATE,
                affected_items=affected_items,
                errors=errors if errors else None
            )
            
        # handle updating multiple items
        elif operation.operation_type == "update":
            if not operation.item_ids:
                raise HTTPException(status_code=400, detail="item_ids required for update operation")

            items = db.query(MenuItem).filter(MenuItem.id.in_(operation.item_ids), MenuItem.tenant_id == tenant_id).all()
            if not items:
                raise HTTPException(status_code=404, detail="No items found")

            for item in items:
                try:
                    for key, value in operation.data.items():
                        setattr(item, key, value)
                    affected_items.append(item.id)
                except Exception as e:
                    errors.append({"item_id": item.id, "error": str(e)})

            db.commit()
            return BulkMenuItemResponse(
                success=True,
                operation=BulkOperationType.UPDATE,
                affected_items=affected_items,
                errors=errors if errors else None
            )

        # handle deleting multiple items
        elif operation.operation_type == "delete":
            if not operation.item_ids:
                raise HTTPException(status_code=400, detail="item_ids required for delete operation")

            items = db.query(MenuItem).filter(MenuItem.id.in_(operation.item_ids), MenuItem.tenant_id == tenant_id).all()
            if not items:
                raise HTTPException(status_code=404, detail="No items found")

            for item in items:
                try:
                    db.delete(item)
                    affected_items.append(item.id)
                except Exception as e:
                    errors.append({"item_id": item.id, "error": str(e)})
                    
            db.commit()
            return BulkMenuItemResponse(
                success=True,
                operation=BulkOperationType.DELETE,
                affected_items=affected_items,
                errors=errors if errors else None
            )
            
        else:
            raise HTTPException(status_code=400, detail="Invalid operation type")
            
    except Exception as e:
        return BulkMenuItemResponse(
            success=False,
            operation=BulkOperationType(operation.operation_type),
            affected_items=[],
            errors=[{"error": str(e)}]
        )

# update whether a bunch of items are available or not
@router.post("/menu-items/bulk-availability", response_model=dict)
def bulk_update_availability(
    item_ids: List[int],
    is_available: bool,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    # scope to current tenant before checking IDs
    items = db.query(MenuItem).filter(MenuItem.id.in_(item_ids), MenuItem.tenant_id == tenant_id).all()
    if not items:
        raise HTTPException(status_code=404, detail="No items found")
        
    # set their availability status
    for item in items:
        item.is_available = is_available
        
    db.commit()
    return {
        "message": f"Updated availability for {len(items)} items",
        "affected_count": len(items)
    }

# get all categories
@router.get("/categories/", response_model=List[CategoryResponse])
def get_categories(
    skip: int = Query(0, ge=0),  # how many to skip
    limit: int = Query(12, ge=1, le=100),  # how many to show
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    # scope to current tenant and return in display order
    query = db.query(Category).filter(Category.tenant_id == tenant_id).order_by(Category.display_order)
    return query.offset(skip).limit(limit).all()

# add a new category
@router.post("/categories/", response_model=CategoryResponse)
def create_category(
    category: CategoryCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    # inject tenant_id so this category is scoped to the current restaurant
    db_category = Category(**category.model_dump(), tenant_id=tenant_id)
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

# get one specific category
@router.get("/categories/{category_id}", response_model=CategoryResponse)
def get_category(
    category_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    # tenant filter prevents reading another restaurant's categories
    category = db.query(Category).filter(Category.id == category_id, Category.tenant_id == tenant_id).first()
    if not category:
        raise RecordNotFoundError(f"Category with ID {category_id} not found")
    return category

# update some fields of a category
@router.patch("/categories/{category_id}", response_model=CategoryResponse)
def patch_category(
    category_id: int,
    category: CategoryUpdate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    # tenant filter prevents patching another restaurant's category
    db_category = db.query(Category).filter(Category.id == category_id, Category.tenant_id == tenant_id).first()
    if not db_category:
        raise RecordNotFoundError(f"Category with ID {category_id} not found")
    
    # only update the fields that were provided
    update_data = category.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_category, key, value)
    
    db.commit()
    db.refresh(db_category)
    return db_category

# delete a category
@router.delete("/categories/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    # tenant filter prevents deleting another restaurant's category
    category = db.query(Category).filter(Category.id == category_id, Category.tenant_id == tenant_id).first()
    if not category:
        raise RecordNotFoundError(f"Category with ID {category_id} not found")
    
    db.delete(category)
    db.commit()
    return {"message": "Category deleted successfully"}

# get all modifiers (like extra sauce, no onions, etc)
@router.get("/modifiers/", response_model=List[ModifierResponse])
def get_modifiers(
    skip: int = Query(0, ge=0),  # how many to skip
    limit: int = Query(12, ge=1, le=100),  # how many to show
    category_id: Optional[int] = None,  # filter by category
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    # scope to current tenant first
    query = db.query(Modifier).filter(Modifier.tenant_id == tenant_id)

    if category_id is not None:
        # get modifiers that are either for this category or global (within tenant)
        query = query.filter(
            (Modifier.category_id == category_id) | (Modifier.category_id.is_(None))
        )
    
    # order them and apply pagination
    return query.order_by(Modifier.display_order).offset(skip).limit(limit).all()

# add a new modifier
@router.post("/modifiers/", response_model=ModifierResponse)
def create_modifier(
    modifier: ModifierCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    # inject tenant_id so this modifier is scoped to the current restaurant
    db_modifier = Modifier(**modifier.model_dump(), tenant_id=tenant_id)
    db.add(db_modifier)
    db.commit()
    db.refresh(db_modifier)
    return db_modifier

# get one specific modifier
@router.get("/modifiers/{modifier_id}", response_model=ModifierResponse)
def get_modifier(
    modifier_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    # tenant filter prevents reading another restaurant's modifiers
    modifier = db.query(Modifier).filter(Modifier.id == modifier_id, Modifier.tenant_id == tenant_id).first()
    if not modifier:
        raise RecordNotFoundError(f"Modifier with ID {modifier_id} not found")
    return modifier

# update a modifier completely
@router.put("/modifiers/{modifier_id}", response_model=ModifierResponse)
def update_modifier(
    modifier_id: int,
    modifier: ModifierCreate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    # tenant filter prevents updating another restaurant's modifier
    db_modifier = db.query(Modifier).filter(Modifier.id == modifier_id, Modifier.tenant_id == tenant_id).first()
    if not db_modifier:
        raise RecordNotFoundError(f"Modifier with ID {modifier_id} not found")
    
    # update all fields with the new values
    for key, value in modifier.model_dump().items():
        setattr(db_modifier, key, value)
    
    db.commit()
    db.refresh(db_modifier)
    return db_modifier

# update some fields of a modifier
@router.patch("/modifiers/{modifier_id}", response_model=ModifierResponse)
def patch_modifier(
    modifier_id: int,
    modifier: ModifierUpdate,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    # tenant filter prevents patching another restaurant's modifier
    db_modifier = db.query(Modifier).filter(Modifier.id == modifier_id, Modifier.tenant_id == tenant_id).first()
    if not db_modifier:
        raise RecordNotFoundError(f"Modifier with ID {modifier_id} not found")
    
    # only update the fields that were provided
    update_data = modifier.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_modifier, key, value)
    
    db.commit()
    db.refresh(db_modifier)
    return db_modifier

# delete a modifier
@router.delete("/modifiers/{modifier_id}")
def delete_modifier(
    modifier_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Depends(get_tenant_id),
):
    # tenant filter prevents deleting another restaurant's modifier
    modifier = db.query(Modifier).filter(Modifier.id == modifier_id, Modifier.tenant_id == tenant_id).first()
    if not modifier:
        raise RecordNotFoundError(f"Modifier with ID {modifier_id} not found")
    
    db.delete(modifier)
    db.commit()
    return {"message": "Modifier deleted successfully"}

# get the modifiers assigned to a specific menu item
@router.get("/menu-items/{item_id}/modifiers", response_model=ItemModifiersResponse)
def get_item_modifiers(item_id: int, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    item = db.query(MenuItem).filter(MenuItem.id == item_id, MenuItem.tenant_id == tenant_id).first()
    if not item:
        raise RecordNotFoundError("MenuItem", item_id)
    return ItemModifiersResponse(
        item_id=item.id,
        modifier_ids=[m.id for m in item.modifiers],
    )

# update which modifiers are assigned to a menu item
@router.put("/menu-items/{item_id}/modifiers", response_model=ItemModifiersResponse)
def update_item_modifiers(item_id: int, data: ItemModifiersUpdate, db: Session = Depends(get_db), tenant_id: int = Depends(get_tenant_id)):
    item = db.query(MenuItem).filter(MenuItem.id == item_id, MenuItem.tenant_id == tenant_id).first()
    if not item:
        raise RecordNotFoundError("MenuItem", item_id)

    # look up all requested modifiers — also scoped to current tenant
    modifiers = db.query(Modifier).filter(Modifier.id.in_(data.modifier_ids), Modifier.tenant_id == tenant_id).all()
    found_ids = {m.id for m in modifiers}
    missing = set(data.modifier_ids) - found_ids
    if missing:
        raise HTTPException(status_code=404, detail=f"Modifiers not found: {sorted(missing)}")

    item.modifiers = modifiers
    db.commit()
    db.refresh(item)
    return ItemModifiersResponse(
        item_id=item.id,
        modifier_ids=[m.id for m in item.modifiers],
    )