"""Browser control tools - navigate, click, scroll, type."""

import asyncio
import json

# Action queues are set per-session by the WebSocket handler
action_queues: dict[str, asyncio.Queue] = {}
result_queues: dict[str, asyncio.Queue] = {}


def _get_session_id() -> str:
    """Get current session ID from context. Fallback to default."""
    return "session1"


async def _send_action(action: dict, timeout: float = 15.0) -> dict:
    """Send an action to the Electron client and wait for result."""
    session_id = _get_session_id()
    if session_id not in action_queues:
        return {"status": "error", "message": "No browser connected"}

    await action_queues[session_id].put(action)
    try:
        result = await asyncio.wait_for(result_queues[session_id].get(), timeout=timeout)
        return result
    except asyncio.TimeoutError:
        return {"status": "error", "message": "Browser action timed out"}


def navigate_to(url: str) -> dict:
    """Navigate the browser to the specified URL.

    Args:
        url: The URL to navigate to. Can be a full URL or just a domain name.

    Returns:
        Status of the navigation action.
    """
    loop = asyncio.get_event_loop()
    if not url.startswith("http"):
        url = f"https://{url}"
    return loop.run_until_complete(_send_action({"action": "navigate", "url": url}))


def click_element(x: int, y: int, description: str = "") -> dict:
    """Click on an element at the specified coordinates on the page.

    The coordinates are based on the 768x768 screenshot resolution.
    Look at the current screenshot to determine where to click.

    Args:
        x: X coordinate (0-768) of where to click.
        y: Y coordinate (0-768) of where to click.
        description: Description of what element you're clicking on.

    Returns:
        Status of the click action.
    """
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(_send_action({
        "action": "click",
        "x": x,
        "y": y,
        "description": description,
    }))


def scroll_page(direction: str = "down", amount: int = 500) -> dict:
    """Scroll the page up or down.

    Args:
        direction: Either "up" or "down".
        amount: Number of pixels to scroll. Default 500.

    Returns:
        Status of the scroll action.
    """
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(_send_action({
        "action": "scroll",
        "direction": direction,
        "amount": amount,
    }))


def type_text(text: str) -> dict:
    """Type text into the currently focused input field.

    Args:
        text: The text to type.

    Returns:
        Status of the type action.
    """
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(_send_action({
        "action": "type",
        "text": text,
    }))


def press_enter() -> dict:
    """Press the Enter key, useful for submitting forms or search queries.

    Returns:
        Status of the enter action.
    """
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(_send_action({"action": "enter"}))


def go_back() -> dict:
    """Navigate back to the previous page.

    Returns:
        Status of the back action.
    """
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(_send_action({"action": "back"}))
