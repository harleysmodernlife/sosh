"""
JWT verification for Supabase-issued tokens.

Supabase new projects sign JWTs with ECC (P-256) / ES256.
We use PyJWT's PyJWKClient for automatic JWKS fetching and caching,
which handles both ES256 (new) and HS256 (legacy) tokens.
"""
from typing import Optional
from uuid import UUID

import jwt
from jwt import PyJWKClient, PyJWKClientError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import settings

bearer_scheme = HTTPBearer()

# JWKS client — fetches and caches Supabase's public signing keys automatically
_jwks_client = PyJWKClient(settings.supabase_jwks_url, cache_keys=True)


class AuthenticatedUser:
    def __init__(self, user_id: UUID, email: Optional[str] = None):
        self.user_id = user_id
        self.email = email


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> AuthenticatedUser:
    token = credentials.credentials

    try:
        # Try ES256 / JWKS first (new Supabase projects)
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
    except PyJWKClientError:
        # Fall back to HS256 with legacy JWT secret (older tokens or anon/service_role JWTs)
        try:
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except jwt.PyJWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
            )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )

    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    return AuthenticatedUser(user_id=UUID(user_id), email=payload.get("email"))


async def get_admin_user(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    return current_user
