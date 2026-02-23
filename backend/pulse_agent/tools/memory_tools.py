"""Stateful memory tools - recall pages, session history via Firestore."""

import os
import json
from datetime import datetime

# In-memory fallback when Firestore is not available
_local_history: list[dict] = []


def _get_firestore_client():
    """Get Firestore client, or None if not available."""
    try:
        from google.cloud import firestore
        return firestore.Client()
    except Exception:
        return None


def save_page_visit(session_id: str, url: str, title: str, content_summary: str = "") -> None:
    """Save a page visit to session history (called internally, not by agent)."""
    entry = {
        "url": url,
        "title": title,
        "content_summary": content_summary[:2000],
        "timestamp": datetime.utcnow().isoformat(),
    }

    db = _get_firestore_client()
    if db:
        db.collection("sessions").document(session_id).collection("history").add(entry)
    else:
        _local_history.append({"session_id": session_id, **entry})


def recall_page(url_or_keyword: str) -> str:
    """Recall content from a previously visited page.

    Use this when the user asks about a page they visited earlier,
    even if the tab has been closed. Pulse remembers everything.

    Args:
        url_or_keyword: URL or keyword to search in browsing history.

    Returns:
        Summary of the previously visited page content.
    """
    db = _get_firestore_client()
    if db:
        # Search across all sessions
        docs = db.collection_group("history").order_by("timestamp").stream()
        matches = []
        for doc in docs:
            data = doc.to_dict()
            if (url_or_keyword.lower() in data.get("url", "").lower() or
                url_or_keyword.lower() in data.get("title", "").lower() or
                url_or_keyword.lower() in data.get("content_summary", "").lower()):
                matches.append(data)

        if matches:
            result = f"Found {len(matches)} matching page(s):\n"
            for m in matches[-3:]:  # Last 3 matches
                result += f"\n- {m['title']} ({m['url']})\n  Visited: {m['timestamp']}\n"
                if m.get("content_summary"):
                    result += f"  Content: {m['content_summary'][:500]}\n"
            return result

    # Fallback to local history
    matches = [h for h in _local_history
               if url_or_keyword.lower() in json.dumps(h).lower()]
    if matches:
        result = f"Found {len(matches)} matching page(s) in local memory:\n"
        for m in matches[-3:]:
            result += f"\n- {m.get('title', 'Unknown')} ({m['url']})\n"
            if m.get("content_summary"):
                result += f"  Content: {m['content_summary'][:500]}\n"
        return result

    return f"No pages matching '{url_or_keyword}' found in browsing history."


def get_session_history(limit: int = 10) -> str:
    """Get the recent browsing history for this session.

    Args:
        limit: Maximum number of history entries to return.

    Returns:
        List of recently visited pages with timestamps.
    """
    db = _get_firestore_client()
    if db:
        docs = (db.collection_group("history")
                .order_by("timestamp", direction="DESCENDING")
                .limit(limit)
                .stream())
        entries = [doc.to_dict() for doc in docs]
        if entries:
            result = f"Last {len(entries)} pages visited:\n"
            for e in entries:
                result += f"  - [{e['timestamp']}] {e.get('title', 'Unknown')} - {e['url']}\n"
            return result

    # Fallback to local
    recent = _local_history[-limit:]
    if recent:
        result = f"Last {len(recent)} pages visited:\n"
        for e in reversed(recent):
            result += f"  - [{e['timestamp']}] {e.get('title', 'Unknown')} - {e['url']}\n"
        return result

    return "No browsing history yet."
