import redis.asyncio as aioredis
from redis import Redis as SyncRedis

from config import settings

# Async client for API request handlers
redis = aioredis.from_url(settings.redis_url, decode_responses=True)

# Sync client for RQ workers
redis_sync = SyncRedis.from_url(settings.redis_url, decode_responses=True)
