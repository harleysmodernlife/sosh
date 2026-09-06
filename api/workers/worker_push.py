"""
RQ job: send Pulse push notification to all users in the target region.
Batches in groups of 100 (Expo's recommended max per API call).
"""
import psycopg2

from config import settings
from services.push import send_pulse_notification

BATCH_SIZE = 100


def send_pulse_to_all(pulse_id: str, prompt: str, city: str | None) -> None:
    conn = psycopg2.connect(settings.database_url.replace("+asyncpg", ""))
    try:
        with conn.cursor() as cur:
            if city:
                cur.execute(
                    "SELECT push_token FROM users WHERE push_token IS NOT NULL AND city = %s",
                    (city,),
                )
            else:
                cur.execute("SELECT push_token FROM users WHERE push_token IS NOT NULL")

            tokens = [row[0] for row in cur.fetchall()]

        for i in range(0, len(tokens), BATCH_SIZE):
            batch = tokens[i : i + BATCH_SIZE]
            send_pulse_notification(batch, prompt, pulse_id)
    finally:
        conn.close()
