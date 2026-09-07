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
    pulse_id: str = Field(..., description="UUID of the pulse this media is for")


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
    media_key = f"pulse_entries/{current_user.user_id}/{uuid.uuid4()}{ext}"

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

    return PresignResponse(
        upload_url=upload_url,
        media_key=media_key,
        expires_in=PRESIGN_EXPIRY,
    )
