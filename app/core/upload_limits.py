"""Byte limits for image uploads (enforced before S3)."""

import io
from fastapi import HTTPException, UploadFile

MANAGER_IMAGE_MAX_BYTES = 5 * 1024 * 1024
CUSTOMER_IMAGE_MAX_BYTES = 3 * 1024 * 1024


def buffer_upload_file(upload_file: UploadFile, max_bytes: int, upload_kind: str) -> io.BytesIO:
    """Read upload into memory capped at max_bytes; raise 413 if larger."""
    f = upload_file.file
    f.seek(0)
    data = f.read(max_bytes + 1)
    if len(data) > max_bytes:
        mb = max_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"Image too large. Maximum size is {mb} MB for {upload_kind} uploads.",
        )
    return io.BytesIO(data)
