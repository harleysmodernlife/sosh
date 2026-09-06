"""
RQ job enqueuers — thin wrappers that push work onto the queue.
Actual job logic lives in worker_*.py files to keep imports clean.
"""
from datetime import timedelta

from rq import Queue
from rq.job import Job

from redis_client import redis_sync


_queue = Queue("sosh", connection=redis_sync)


def enqueue_push_pulse_notification(pulse_id: str, prompt: str, city: str | None) -> Job:
    return _queue.enqueue(
        "workers.worker_push.send_pulse_to_all",
        pulse_id,
        prompt,
        city,
        job_timeout=120,
    )


def enqueue_leaderboard_resolve(pulse_id: str, delay_seconds: int = 0) -> Job:
    return _queue.enqueue_in(
        timedelta(seconds=delay_seconds),
        "workers.worker_resolve.resolve_pulse",
        pulse_id,
        job_timeout=300,
    )
