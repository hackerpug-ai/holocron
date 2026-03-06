"""
List command implementation.

Lists documents from the holocron database with optional filtering.
"""

import argparse

from holocron_cli.core.convex_client import get_client


def execute(args: argparse.Namespace) -> int:
    """
    Execute the list command.

    Args:
        args: Parsed command-line arguments

    Returns:
        Exit code (0 for success)
    """
    client = get_client()

    # Call Convex query (placeholder - will be implemented in US-061)
    # results = client.query("documents:list", {
    #     "category": args.category,
    #     "limit": args.limit,
    # })

    filter_str = f" (category: {args.category})" if args.category else ""
    print(f"Listing documents{filter_str} (limit: {args.limit})")
    print("TODO: Implement Convex HTTP client integration")

    return 0
