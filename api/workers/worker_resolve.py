"""
RQ job: resolve a Pulse.

Steps:
1.  Mark pulse status = 'resolving'
2.  Flush Redis vote counts → pulse_entries.vote_count in DB
3.  Find the entry with the highest vote_count (winner)
4.  Create a trophy for the winner
5.  Upsert leaderboard_results
6.  Recalculate Sösh Score for ALL participants (entrants + voters)
    Formula: trophies×100 + entries×10 + votes_received×2 + votes_cast×1
7.  Collect winner push token + all entrant push tokens
8.  Generate Mosaic (top 20 entries by vote count)
9.  Mark pulse = 'resolved'
10. Send winner push notification
11. Send results notifications to all other entrants
12. Expire Redis leaderboard key (keep 24h for straggler polls)
"""
import psycopg2
import redis as sync_redis
import uuid as uuidlib

from config import settings
from services.push import send_results_notification, send_winner_notification


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

            # 6. Recalculate Sösh Score for all Pulse participants
            #    Formula:  trophies × 100
            #            + approved entries × 10
            #            + total votes received × 2
            #            + total votes cast × 1
            cur.execute(
                """
                SELECT DISTINCT uid FROM (
                    SELECT user_id::text AS uid FROM pulse_entries WHERE pulse_id = %s
                    UNION
                    SELECT v.voter_id::text AS uid
                    FROM votes v
                    JOIN pulse_entries pe ON pe.id = v.entry_id
                    WHERE pe.pulse_id = %s
                ) participants
                """,
                (pulse_id, pulse_id),
            )
            participant_ids = [row[0] for row in cur.fetchall()]

            for uid in participant_ids:
                cur.execute(
                    """
                    INSERT INTO sosh_score_snapshots (user_id, score, updated_at)
                    VALUES (
                        %s,
                        (SELECT COALESCE(COUNT(*), 0) FROM trophies WHERE user_id = %s::uuid) * 100
                        + (SELECT COALESCE(COUNT(*), 0) FROM pulse_entries
                           WHERE user_id = %s::uuid AND moderation_status = 'approved') * 10
                        + (SELECT COALESCE(SUM(vote_count), 0) FROM pulse_entries
                           WHERE user_id = %s::uuid AND moderation_status = 'approved') * 2
                        + (SELECT COALESCE(COUNT(*), 0) FROM votes WHERE voter_id = %s::uuid),
                        now()
                    )
                    ON CONFLICT (user_id) DO UPDATE
                    SET score = EXCLUDED.score, updated_at = now()
                    """,
                    (uid, uid, uid, uid, uid),
                )

            # 7. Collect push tokens for notifications
            winner_push_token = None
            entrant_push_tokens = []
            if winner:
                cur.execute("SELECT push_token FROM users WHERE id = %s", (user_id,))
                row = cur.fetchone()
                winner_push_token = row[0] if row else None

            # All entrants except winner
            cur.execute(
                """
                SELECT u.push_token
                FROM pulse_entries pe
                JOIN users u ON u.id = pe.user_id
                WHERE pe.pulse_id = %s
                  AND pe.moderation_status = 'approved'
                  AND pe.user_id != %s
                  AND u.push_token IS NOT NULL
                """,
                (pulse_id, user_id if winner else "00000000-0000-0000-0000-000000000000"),
            )
            entrant_push_tokens = [r[0] for r in cur.fetchall()]

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

        # 11. Notify all other entrants that results are in
        if entrant_push_tokens:
            send_results_notification(entrant_push_tokens, pulse_id)

        # 12. Clean up Redis leaderboard key (keep for 24h for any straggler polls)
        r.expire(leaderboard_key, 86400)

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        r.close()
