"""Tab management tools - open, close, switch tabs."""

import asyncio
from .browser_tools import _send_action


def open_new_tab(url: str = "") -> dict:
    """Open a new browser tab, optionally navigating to a URL.

    Args:
        url: Optional URL to open in the new tab.

    Returns:
        Status of the new tab action.
    """
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(_send_action({
        "action": "new_tab",
        "url": url,
    }))


def close_current_tab() -> dict:
    """Close the currently active browser tab.

    Returns:
        Status of the close tab action.
    """
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(_send_action({"action": "close_tab"}))


def switch_to_tab(tab_id: int) -> dict:
    """Switch to a different browser tab by its ID.

    Args:
        tab_id: The ID of the tab to switch to.

    Returns:
        Status of the switch tab action.
    """
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(_send_action({
        "action": "switch_tab",
        "tab_id": tab_id,
    }))
