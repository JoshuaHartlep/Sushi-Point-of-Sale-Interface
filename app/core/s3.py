"""
S3 storage helpers for image uploads and deletions.
"""

import boto3
import os
import uuid
from botocore.exceptions import ClientError
import logging

logger = logging.getLogger(__name__)


def _s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_REGION", "us-east-1"),
    )


def _bucket() -> str:
    return os.getenv("S3_BUCKET_NAME", "sushi-pos-uploads")


def upload_image(file_obj, prefix: str, item_id: int, original_filename: str, content_type: str) -> str:
    """Upload a file-like object to S3 and return its public URL."""
    ext = os.path.splitext(original_filename or "image.jpg")[1].lower() or ".jpg"
    key = f"{prefix}/{item_id}_{uuid.uuid4().hex}{ext}"
    _s3_client().upload_fileobj(
        file_obj,
        _bucket(),
        key,
        ExtraArgs={"ContentType": content_type},
    )
    return f"https://{_bucket()}.s3.amazonaws.com/{key}"


def delete_image(url: str):
    """Delete an image from S3 given its full URL. Silently ignores errors."""
    if not url or not url.startswith("https://"):
        return
    try:
        bucket = _bucket()
        key = url.split(f"https://{bucket}.s3.amazonaws.com/")[-1]
        _s3_client().delete_object(Bucket=bucket, Key=key)
    except ClientError as e:
        logger.warning("S3 delete failed for %s: %s", url, e)
