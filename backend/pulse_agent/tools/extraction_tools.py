"""Content extraction tools - extract text, describe pages."""

import asyncio
from .browser_tools import _send_action


def extract_page_text() -> dict:
    """Extract the visible text content from the current web page.

    Returns:
        Dictionary with the extracted text content (first 5000 chars).
    """
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(_send_action({"action": "extract-text"}))


def describe_current_page() -> str:
    """Describe what you currently see on the page based on the latest screenshot.

    Use this when the user asks "what's on this page?" or similar questions.
    You already have the screenshot in your context from the continuous stream.

    Returns:
        A prompt to look at the current screenshot context.
    """
    return "Look at the most recent screenshot in your context and describe what you see on the page."
