"""
RQ job: fire the daily scheduled Pulse.

Picks the next prompt from the rotation, inserts a Pulse, and enqueues
push notification + resolution jobs. Skips silently if a Pulse is
already active (prevents double-firing if cron overlaps).
"""
import uuid
from datetime import datetime, timedelta, timezone

import psycopg2
import redis as sync_redis

from config import settings
from prompts import PROMPTS

# Default windows for scheduled Pulses
SUBMISSION_MINUTES = 30
VOTING_HOURS = 4

PROMPT_INDEX_KEY = "sosh:prompt_index"


def fire_daily_pulse() -> None:
    db = psycopg2.connect(settings.database_url.replace("+asyncpg", ""))
    r = sync_redis.from_url(settings.redis_url, decode_responses=True)

    try:
        with db.cursor() as cur:
            # Skip if a Pulse is already running
            cur.execute("SELECT id FROM pulses WHERE status IN ('active', 'voting') LIMIT 1")
            if cur.fetchone():
                return

            # Pick next prompt (circular rotation)
            raw_idx = r.incr(PROMPT_INDEX_KEY)
            prompt = PROMPTS[(int(raw_idx) - 1) % len(PROMPTS)]

            pulse_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            submission_ends_at = now + timedelta(minutes=SUBMISSION_MINUTES)
            voting_ends_at = submission_ends_at + timedelta(hours=VOTING_HOURS)

            cur.execute(
                """
                INSERT INTO pulses
                    (id, prompt, status, submission_ends_at, voting_ends_at, created_at, updated_at)
                VALUES (%s, %s, 'active', %s, %s, now(), now())
                """,
                (pulse_id, prompt, submission_ends_at, voting_ends_at),
            )
            db.commit()

        # Enqueue notification + scheduled resolve
        from workers.jobs import enqueue_push_pulse_notification, enqueue_leaderboard_resolve
        enqueue_push_pulse_notification(pulse_id, prompt, None)
        total_delay = SUBMISSION_MINUTES * 60 + VOTING_HOURS * 3600
        enqueue_leaderboard_resolve(pulse_id, delay_seconds=total_delay)

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        r.close()
