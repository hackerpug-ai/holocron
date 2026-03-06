"""
Search command implementation.

Searches the holocron knowledge database using hybrid search (vector + FTS).
"""

import argparse
from typing import Any

from holocron_cli.core.convex_client import get_client
from holocron_cli.utils.formatters import format_search_results


def execute(args: argparse.Namespace) -> int:
    """
    Execute the search command.

    Args:
        args: Parsed command-line arguments

    Returns:
        Exit code (0 for success)
    """
    client = get_client()

    # Call Convex query (placeholder - will be implemented in US-061)
    # results = client.query("documents:hybridSearch", {
    #     "query": args.query,
    #     "limit": args.limit,
    # })

    print(f"Searching for: {args.query} (limit: {args.limit})")
    print("TODO: Implement Convex HTTP client integration")

    return 0
