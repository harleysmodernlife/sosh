"""
Pre-signed URL generation for Cloudflare R2 direct uploads.

POST /media/presign — returns a presigned PUT URL
The client uploads directly to R2 (API never proxies media).
After upload, client passes the media_key when submitting the entry.
"""
import os
import uuid

import boto3
from botocore.config import Config
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth import AuthenticatedUser, get_current_user
from config import settings

router = APIRouter()

ALLOWED_CONTENT_TYPES = {
    "video/mp4": ".mp4",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

MAX_FILE_SIZES = {
    "video/mp4": 50 * 1024 * 1024,   # 50MB — ≤15s video
    "image/jpeg": 10 * 1024 * 1024,  # 10MB
    "image/png": 10 * 1024 * 1024,
    "image/webp": 10 * 1024 * 1024,
}


class PresignRequest(BaseModel):
    content_type: str
    pulse_id: str = Field(..., description="UUID of the pulse this media is for")


class PresignResponse(BaseModel):
    upload_url: str
    media_key: str
    expires_in: int  # seconds


def _get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint,
        aws_access_key_id=settings.r2_access_key,
        aws_secret_access_key=settings.r2_secret_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


@router.post("/presign", response_model=PresignResponse)
async def get_presigned_url(
    body: PresignRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    if body.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported content type. Allowed: {list(ALLOWED_CONTENT_TYPES)}",
        )

    ext = ALLOWED_CONTENT_TYPES[body.content_type]
    content_prefix = "pulse_entries" if body.content_type == "video/mp4" else "pulse_entries"
    media_key = f"{content_prefix}/{current_user.user_id}/{uuid.uuid4()}{ext}"

    s3 = _get_s3_client()
    upload_url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.r2_bucket_name,
            "Key": media_key,
            "ContentType": body.content_type,
        },
        ExpiresIn=600,  # 10 minutes
    )

    return PresignResponse(upload_url=upload_url, media_key=media_key, expires_in=600)
