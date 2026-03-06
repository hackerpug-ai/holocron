"""
ConvexClient Python Library

A Python client library for interacting with Convex backends.
Provides a clean API for queries, mutations, and actions.

Example:
    >>> from convex_client import ConvexClient
    >>> client = ConvexClient("https://your-deployment.convex.cloud")
    >>> conversations = client.query("conversations/queries.list", {"limit": 10})
    >>> new_conv = client.mutation("conversations/mutations.create", {"title": "Test"})
"""

from .client import ConvexClient, ConvexError, ConvexHTTPError
from .api import ConvexAPI

__version__ = "0.1.0"
__all__ = ["ConvexClient", "ConvexError", "ConvexHTTPError", "ConvexAPI"]
