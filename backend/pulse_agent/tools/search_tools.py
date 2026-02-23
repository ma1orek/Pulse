"""Web search tools."""

from .browser_tools import navigate_to


def search_web(query: str) -> dict:
    """Search the web using Google for the given query.

    This navigates the browser to Google search results for the query.

    Args:
        query: The search query string.

    Returns:
        Status of the search navigation.
    """
    search_url = f"https://www.google.com/search?q={query.replace(' ', '+')}"
    return navigate_to(search_url)
