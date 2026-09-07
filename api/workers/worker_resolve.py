"""
RQ job: resolve a Pulse.

Steps:
1. Mark pulse status = 'resolved'
2. Find the entry with the highest vote_count per city
3. Create a trophy record for the winner
4. Refresh vote_count on all entries from Redis
5. Generate the Mosaic (top 20 entries globally by vote count)
6. Update leaderboard_results table
7. Send winner push notification
8. Recalculate winner's Sösh Score
"""
import psycopg2
import redis as sync_redis
import uuid as uuidlib

from config import settings
from services.push import send_winner_notification


def resolve_pulse(pulse_id: str) -> None:
    db = psycopg2.connect(settings.database_url.replace("+asyncpg", ""))
    r = sync_redis.from_url(settings.redis_url, decode_responses=True)

    try:
        with db.cursor() as cur:
            # 1. Mark voting closed → resolving
            cur.execute(
                "UPDATE pulses SET status = 'resolving', updated_at = now() WHERE id = %s AND status != 'resolved'",
                (pulse_id,),
            )
            if cur.rowcount == 0:
                return  # Already resolved

            # 2. Flush Redis vote counts → DB
            leaderboard_key = f"leaderboard:{pulse_id}"
            scores = r.zrevrange(leaderboard_key, 0, -1, withscores=True)
            for entry_id, score in scores:
                cur.execute(
                    "UPDATE pulse_entries SET vote_count = %s WHERE id = %s",
                    (int(score), entry_id),
                )

            # 3. Find winner (highest votes) — city-scoped
            cur.execute(
                """
                SELECT pe.id AS entry_id, pe.user_id, p.city, p.country_code,
                       pe.vote_count
                FROM pulse_entries pe
                JOIN pulses p ON p.id = pe.pulse_id
                WHERE pe.pulse_id = %s
                  AND pe.moderation_status = 'approved'
                ORDER BY pe.vote_count DESC
                LIMIT 1
                """,
                (pulse_id,),
            )
            winner = cur.fetchone()

            winner_push_token = None
            if winner:
                entry_id, user_id, city, country_code, vote_count = winner

                # 4. Create trophy
                cur.execute(
                    """
                    INSERT INTO trophies
                        (id, user_id, pulse_id, entry_id, vote_count, city, country_code, awarded_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, now())
                    ON CONFLICT DO NOTHING
                    """,
                    (str(uuidlib.uuid4()), user_id, pulse_id, entry_id, vote_count, city, country_code),
                )

                # 5. Upsert leaderboard_results
                cur.execute(
                    """
                    INSERT INTO leaderboard_results
                        (id, pulse_id, entry_id, user_id, rank, vote_count, city, country_code, scope, resolved_at)
                    VALUES (%s, %s, %s, %s, 1, %s, %s, %s, 'city', now())
                    ON CONFLICT (pulse_id, user_id, scope) DO UPDATE
                        SET rank = EXCLUDED.rank, vote_count = EXCLUDED.vote_count
                    """,
                    (str(uuidlib.uuid4()), pulse_id, entry_id, user_id, vote_count, city, country_code),
                )

                # 6. Recalculate Sösh Score (MVP formula: trophy_count * 10)
                cur.execute(
                    """
                    UPDATE sosh_score_snapshots
                    SET score = (SELECT COUNT(*) FROM trophies WHERE user_id = %s) * 10,
                        updated_at = now()
                    WHERE user_id = %s
                    """,
                    (user_id, user_id),
                )

                # 7. Get push token for winner notification
                cur.execute("SELECT push_token FROM users WHERE id = %s", (user_id,))
                row = cur.fetchone()
                winner_push_token = row[0] if row else None

            # 8. Generate Mosaic (top 20 entries by vote count) — skip if no entries
            cur.execute(
                """
                SELECT array_agg(id ORDER BY vote_count DESC)
                FROM (
                    SELECT id, vote_count FROM pulse_entries
                    WHERE pulse_id = %s AND moderation_status = 'approved'
                    ORDER BY vote_count DESC LIMIT 20
                ) top
                """,
                (pulse_id,),
            )
            mosaic_entry_ids = cur.fetchone()[0]
            if mosaic_entry_ids:
                cur.execute(
                    """
                    INSERT INTO mosaics (id, pulse_id, entry_ids, generated_at)
                    VALUES (%s, %s, %s, now())
                    """,
                    (str(uuidlib.uuid4()), pulse_id, mosaic_entry_ids),
                )

            # 9. Mark pulse resolved
            cur.execute(
                "UPDATE pulses SET status = 'resolved', updated_at = now() WHERE id = %s",
                (pulse_id,),
            )

            db.commit()

        # 10. Send winner push notification (after DB commit)
        if winner and winner_push_token:
            send_winner_notification(winner_push_token, winner[2] or "your city", pulse_id)

        # 11. Clean up Redis leaderboard key (keep for 24h for any straggler polls)
        r.expire(leaderboard_key, 86400)

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        r.close()
