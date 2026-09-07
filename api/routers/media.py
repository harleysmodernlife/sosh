"""
Pre-signed URL generation for Supabase Storage direct uploads.

POST /media/presign — returns a signed PUT URL for direct client upload.
The client uploads directly to Supabase Storage (API never proxies media).
After upload, client passes the media_key when submitting the entry.

Public read URL pattern:
  {SUPABASE_URL}/storage/v1/object/public/sosh-media/{media_key}
"""
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth import AuthenticatedUser, get_current_user
from config import settings

router = APIRouter()

STORAGE_BUCKET = "sosh-media"
PRESIGN_EXPIRY = 600  # 10 minutes

ALLOWED_CONTENT_TYPES = {
    "video/mp4": ".mp4",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


class PresignRequest(BaseModel):
    content_type: str
    pulse_id: str | None = Field(None, description="UUID of the pulse (omit for freeform posts)")


class PresignResponse(BaseModel):
    upload_url: str
    media_key: str
    expires_in: int  # seconds


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
    folder = f"pulse_entries/{current_user.user_id}" if body.pulse_id else f"posts/{current_user.user_id}"
    media_key = f"{folder}/{uuid.uuid4()}{ext}"

    sign_url = (
        f"{settings.supabase_url}/storage/v1/object/upload/sign"
        f"/{STORAGE_BUCKET}/{media_key}"
    )

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            sign_url,
            headers={"Authorization": f"Bearer {settings.supabase_service_role_key}"},
            json={"expiresIn": PRESIGN_EXPIRY},
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to generate upload URL.",
        )

    # Supabase returns a relative path; build the full upload URL
    relative = resp.json()["url"]
    upload_url = f"{settings.supabase_url}/storage/v1{relative}"

    public_url = f"{settings.supabase_url}/storage/v1/object/public/{STORAGE_BUCKET}/{media_key}"

    return PresignResponse(
        upload_url=upload_url,
        # For posts (no pulse_id), return the public URL directly so client can store it
        media_key=public_url if not body.pulse_id else media_key,
        expires_in=PRESIGN_EXPIRY,
    )


@router.post("/presign-avatar", response_model=PresignResponse)
async def get_avatar_presigned_url(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Presigned URL for profile avatar upload. Always JPEG, keyed by user ID (overwrites old avatar)."""
    media_key = f"avatars/{current_user.user_id}.jpg"

    sign_url = (
        f"{settings.supabase_url}/storage/v1/object/upload/sign"
        f"/{STORAGE_BUCKET}/{media_key}"
    )

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            sign_url,
            headers={"Authorization": f"Bearer {settings.supabase_service_role_key}"},
            json={"expiresIn": PRESIGN_EXPIRY},
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to generate upload URL.",
        )

    relative = resp.json()["url"]
    upload_url = f"{settings.supabase_url}/storage/v1{relative}"
    public_url = f"{settings.supabase_url}/storage/v1/object/public/{STORAGE_BUCKET}/{media_key}"

    return PresignResponse(
        upload_url=upload_url,
        media_key=public_url,  # Return the public URL directly so client can save it
        expires_in=PRESIGN_EXPIRY,
    )
