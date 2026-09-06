"""
Basic server-side content moderation for MVP text entries.
Phase 2 will add image hash checking (PhotoDNA / equivalent) and on-device ML.
"""
from better_profanity import profanity

profanity.load_censor_words()


def is_text_safe(text: str) -> bool:
    """Returns True if text passes basic moderation, False if it should be blocked."""
    return not profanity.contains_profanity(text)
