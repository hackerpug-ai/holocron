"""
Convex HTTP client management.

Handles connection to Convex backend and provides a singleton client instance.
This will be implemented in US-061.
"""

import os
from typing import Any, Optional


class ConvexClient:
    """
    Wrapper for Convex HTTP client.

    This is a placeholder that will be replaced with actual ConvexHttpClient
    implementation in US-061.
    """

    def __init__(self, url: str):
        """
        Initialize Convex client.

        Args:
            url: Convex deployment URL
        """
        self.url = url
        # TODO: Initialize actual ConvexHttpClient in US-061

    def query(self, query_name: str, args: dict[str, Any]) -> Any:
        """
        Execute a Convex query.

        Args:
            query_name: Name of the query (e.g., "documents:search")
            args: Query arguments

        Returns:
            Query result
        """
        raise NotImplementedError("ConvexHttpClient integration pending (US-061)")


_client: Optional[ConvexClient] = None


def get_client() -> ConvexClient:
    """
    Get or create the singleton Convex client instance.

    Returns:
        ConvexClient instance

    Raises:
        ValueError: If CONVEX_URL environment variable is not set
    """
    global _client

    if _client is None:
        convex_url = os.environ.get("CONVEX_URL")
        if not convex_url:
            raise ValueError(
                "CONVEX_URL environment variable is required. "
                "Set it to your Convex deployment URL."
            )
        _client = ConvexClient(convex_url)

    return _client


def reset_client() -> None:
    """Reset the singleton client (primarily for testing)."""
    global _client
    _client = None
