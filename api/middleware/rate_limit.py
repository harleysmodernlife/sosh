"""Fixed-window rate limiting middleware using Redis.

Limits per client IP per 60-second window:
  - GET requests:                          300/min
  - Write requests (POST/PUT/PATCH/DELETE): 60/min

Returns 429 with Retry-After header when limit exceeded.
"""
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from redis_client import redis as _redis

_EXEMPT = {"/health", "/docs", "/openapi.json"}

_WINDOW = 60  # seconds


async def _get_count(key: str) -> int:
    count = await _redis.incr(key)
    if count == 1:
        await _redis.expire(key, _WINDOW * 2)
    return count


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in _EXEMPT:
            return await call_next(request)

        client_ip = (request.client.host if request.client else None) or "unknown"
        is_write = request.method in ("POST", "PUT", "PATCH", "DELETE")
        limit = 60 if is_write else 300
        ts_bucket = int(time.time()) // _WINDOW
        redis_key = f"rl:{client_ip}:{'w' if is_write else 'r'}:{ts_bucket}"

        try:
            count = await _get_count(redis_key)
        except Exception:
            # Redis unavailable — fail open rather than blocking all traffic
            return await call_next(request)

        if count > limit:
            return JSONResponse(
                status_code=429,
                headers={"Retry-After": str(_WINDOW)},
                content={"detail": "Too many requests. Please slow down."},
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - count))
        response.headers["X-RateLimit-Reset"] = str((ts_bucket + 1) * _WINDOW)
        return response
