"""
JWT verification for Supabase-issued tokens.
The mobile app authenticates with Supabase directly.
Every API request carries the Supabase JWT in the Authorization header.
"""
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from config import settings

bearer_scheme = HTTPBearer()


class AuthenticatedUser:
    def __init__(self, user_id: UUID, email: Optional[str] = None):
        self.user_id = user_id
        self.email = email


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> AuthenticatedUser:
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return AuthenticatedUser(user_id=UUID(user_id), email=payload.get("email"))
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )


async def get_admin_user(
    current_user: AuthenticatedUser = Depends(get_current_user),
    # Admin check is done by verifying the user has admin role in the DB.
    # Routers that use this dependency call it and then check the role.
) -> AuthenticatedUser:
    return current_user
