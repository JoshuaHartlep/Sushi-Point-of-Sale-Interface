"""
User-generated image endpoints.

Handles uploading, viewing, reporting, and deleting user photos for menu items.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from typing import List
from app.core.database import get_db
from app.models.menu import MenuItemImage, ImageReport, ImageStatusEnum, MenuItem
from app.schemas.menu import MenuItemImageResponse, ImageReportCreate, ImageReportResponse, ImageStatusUpdate
from app.core.error_handling import RecordNotFoundError
from datetime import datetime, timezone
import logging
import os
import uuid
import shutil

logger = logging.getLogger(__name__)

router = APIRouter()

# figure out the uploads directory relative to this file (app/api/ -> project root)
def _uploads_dir() -> str:
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "uploads", "user-images"
    )


# upload a user photo for a menu item
@router.post("/menu-items/{menu_item_id}/images", response_model=MenuItemImageResponse)
def upload_user_image(
    menu_item_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    from app.core.s3 import upload_image

    # make sure the menu item exists
    item = db.query(MenuItem).filter(MenuItem.id == menu_item_id).first()
    if not item:
        raise RecordNotFoundError("MenuItem", menu_item_id)

    # only allow common image types
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, and GIF images are allowed")

    from app.core.upload_limits import CUSTOMER_IMAGE_MAX_BYTES, buffer_upload_file

    buf = buffer_upload_file(file, CUSTOMER_IMAGE_MAX_BYTES, "customer")

    # upload to S3
    s3_url = upload_image(buf, "user-images", menu_item_id, file.filename or "image.jpg", file.content_type)

    # save the record in the database
    db_image = MenuItemImage(
        menu_item_id=menu_item_id,
        image_url=s3_url,
    )
    db.add(db_image)
    db.commit()
    db.refresh(db_image)
    return db_image


# get approved user-uploaded photos for a menu item (customer-facing), newest first
@router.get("/menu-items/{menu_item_id}/images", response_model=List[MenuItemImageResponse])
def get_user_images(menu_item_id: int, db: Session = Depends(get_db)):
    item = db.query(MenuItem).filter(MenuItem.id == menu_item_id).first()
    if not item:
        raise RecordNotFoundError("MenuItem", menu_item_id)

    images = (
        db.query(MenuItemImage)
        .filter(
            MenuItemImage.menu_item_id == menu_item_id,
            MenuItemImage.status == ImageStatusEnum.APPROVED,
        )
        .order_by(MenuItemImage.uploaded_at.desc())
        .all()
    )
    return images


# get all pending images waiting for review (manager view) — must come before /{image_id}
@router.get("/images/pending", response_model=List[MenuItemImageResponse])
def get_pending_images(db: Session = Depends(get_db)):
    images = (
        db.query(MenuItemImage)
        .options(joinedload(MenuItemImage.menu_item))
        .filter(MenuItemImage.status == ImageStatusEnum.PENDING)
        .order_by(MenuItemImage.uploaded_at.desc())
        .all()
    )
    return images


# get all images that have at least one report (manager view) — must come before /{image_id}
@router.get("/images/reported", response_model=List[MenuItemImageResponse])
def get_reported_images(db: Session = Depends(get_db)):
    images = (
        db.query(MenuItemImage)
        .options(joinedload(MenuItemImage.menu_item))
        .filter(MenuItemImage.report_count > 0)
        .order_by(MenuItemImage.report_count.desc())
        .all()
    )
    return images


# approve an image (manager only) — rejection is handled by the delete endpoint
@router.patch("/images/{image_id}/status", response_model=MenuItemImageResponse)
def update_image_status(image_id: int, update: ImageStatusUpdate, db: Session = Depends(get_db)):
    image = (
        db.query(MenuItemImage)
        .options(joinedload(MenuItemImage.menu_item))
        .filter(MenuItemImage.id == image_id)
        .first()
    )
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    image.status = update.status
    image.reviewed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(image)
    # touch the relationship so it's loaded before the session closes
    _ = image.menu_item
    return image


# report an image as inappropriate or incorrect
@router.post("/images/{image_id}/report", response_model=ImageReportResponse)
def report_image(image_id: int, report: ImageReportCreate, db: Session = Depends(get_db)):
    image = db.query(MenuItemImage).filter(MenuItemImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # increment the report counter and add a report record
    image.report_count += 1
    db_report = ImageReport(image_id=image_id, reason=report.reason)
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report


# delete an image (manager only)
@router.delete("/images/{image_id}")
def delete_image(image_id: int, db: Session = Depends(get_db)):
    from app.core.s3 import delete_image as s3_delete

    image = db.query(MenuItemImage).filter(MenuItemImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    if image.image_url:
        s3_delete(image.image_url)

    db.delete(image)
    db.commit()
    return {"message": "Image deleted successfully"}
