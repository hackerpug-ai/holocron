"""
Get command implementation.

Retrieves a specific document by ID from the holocron database.
"""

import argparse

from holocron_cli.core.convex_client import get_client


def execute(args: argparse.Namespace) -> int:
    """
    Execute the get command.

    Args:
        args: Parsed command-line arguments

    Returns:
        Exit code (0 for success)
    """
    client = get_client()

    # Call Convex query (placeholder - will be implemented in US-061)
    # result = client.query("documents:get", {
    #     "id": args.id,
    # })

    print(f"Getting document: {args.id}")
    print("TODO: Implement Convex HTTP client integration")

    return 0
