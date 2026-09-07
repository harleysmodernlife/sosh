"""
Push notification service — wraps Expo Push API.
Expo handles FCM (Android) and APNs (iOS) delivery from a single call.
"""
from exponent_server_sdk import (
    DeviceNotRegisteredError,
    PushClient,
    PushMessage,
    PushServerError,
    PushTicketError,
)

from config import settings

_client = PushClient(
    session_kwargs={"headers": {"Authorization": f"Bearer {settings.expo_access_token}"}}
    if settings.expo_access_token
    else {}
)


def send_pulse_notification(push_tokens: list[str], prompt: str, pulse_id: str) -> None:
    """
    Sends Pulse notification to a batch of push tokens.
    Call in batches of 100 (Expo's recommended max).
    """
    messages = [
        PushMessage(
            to=token,
            title="Pulse is live",
            body=prompt,
            data={"type": "pulse", "pulse_id": pulse_id},
            sound="default",
            priority="high",
        )
        for token in push_tokens
    ]

    try:
        responses = _client.publish_multiple(messages)
        for response in responses:
            try:
                response.validate_response()
            except DeviceNotRegisteredError:
                # Token is stale — should be removed from DB. Log for now.
                pass
            except PushTicketError as e:
                pass
    except PushServerError:
        # Log and continue — a failed notification batch is not fatal
        raise


def send_milestone_notification(push_token: str, vote_count: int, entry_id: str) -> None:
    """Notify an entry author that their entry hit a vote milestone."""
    try:
        response = _client.publish(
            PushMessage(
                to=push_token,
                title=f"Your entry hit {vote_count} votes!",
                body="People are loving your response. Keep climbing.",
                data={"type": "milestone", "entry_id": entry_id},
                sound="default",
                priority="normal",
            )
        )
        response.validate_response()
    except (DeviceNotRegisteredError, PushTicketError, PushServerError):
        pass


def send_results_notification(push_tokens: list[str], pulse_id: str) -> None:
    """Notify all entrants (non-winners) that Pulse results are in."""
    messages = [
        PushMessage(
            to=token,
            title="Results are in!",
            body="The Pulse has closed. See how you placed.",
            data={"type": "results", "pulse_id": pulse_id},
            sound="default",
            priority="normal",
        )
        for token in push_tokens
    ]
    if not messages:
        return
    try:
        responses = _client.publish_multiple(messages)
        for response in responses:
            try:
                response.validate_response()
            except (DeviceNotRegisteredError, PushTicketError):
                pass
    except PushServerError:
        pass


def send_follow_notification(push_token: str, follower_name: str, follower_id: str) -> None:
    """Notify a user that someone followed them."""
    try:
        response = _client.publish(
            PushMessage(
                to=push_token,
                title=f"{follower_name} followed you",
                body="Tap to see their profile.",
                data={"type": "follow", "user_id": follower_id},
                sound="default",
                priority="normal",
            )
        )
        response.validate_response()
    except (DeviceNotRegisteredError, PushTicketError, PushServerError):
        pass


def send_like_notification(push_token: str, liker_name: str, post_id: str) -> None:
    """Notify a post author that someone liked their post."""
    try:
        response = _client.publish(
            PushMessage(
                to=push_token,
                title=f"{liker_name} liked your post",
                body="Tap to see it.",
                data={"type": "like", "post_id": post_id},
                sound="default",
                priority="normal",
            )
        )
        response.validate_response()
    except (DeviceNotRegisteredError, PushTicketError, PushServerError):
        pass


def send_comment_notification(push_token: str, commenter_name: str, post_id: str) -> None:
    """Notify a post author that someone commented on their post."""
    try:
        response = _client.publish(
            PushMessage(
                to=push_token,
                title=f"{commenter_name} commented on your post",
                body="Tap to see it.",
                data={"type": "comment", "post_id": post_id},
                sound="default",
                priority="normal",
            )
        )
        response.validate_response()
    except (DeviceNotRegisteredError, PushTicketError, PushServerError):
        pass


def send_winner_notification(push_token: str, city: str, pulse_id: str) -> None:
    """Notify a user that they won City Rep for their city."""
    try:
        response = _client.publish(
            PushMessage(
                to=push_token,
                title=f"You are {city} City Rep!",
                body="You won this Pulse. Check your Trophy Case.",
                data={"type": "trophy", "pulse_id": pulse_id},
                sound="default",
                priority="high",
            )
        )
        response.validate_response()
    except (DeviceNotRegisteredError, PushTicketError, PushServerError):
        pass
