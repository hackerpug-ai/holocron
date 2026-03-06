"""
Stats command implementation.

Shows statistics about the holocron database (document counts, categories, etc.).
"""

import argparse

from holocron_cli.core.convex_client import get_client


def execute(args: argparse.Namespace) -> int:
    """
    Execute the stats command.

    Args:
        args: Parsed command-line arguments

    Returns:
        Exit code (0 for success)
    """
    client = get_client()

    # Call Convex query (placeholder - will be implemented in US-061)
    # result = client.query("documents:stats", {})

    print("Database Statistics:")
    print("TODO: Implement Convex HTTP client integration")

    return 0
