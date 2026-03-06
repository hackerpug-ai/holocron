"""
Main CLI entry point and command router.

This module handles argument parsing and dispatches to appropriate command handlers.
"""

import argparse
import sys
from typing import Optional

from holocron_cli.commands import search, list_docs, get_doc, stats, browse


def create_parser() -> argparse.ArgumentParser:
    """Create and configure the argument parser."""
    parser = argparse.ArgumentParser(
        prog="holocron",
        description="CLI for interacting with Holocron knowledge database via Convex",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        "--version",
        action="version",
        version="holocron 0.1.0",
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Search command
    search_parser = subparsers.add_parser("search", help="Search documents")
    search_parser.add_argument("query", help="Search query string")
    search_parser.add_argument("--limit", type=int, default=10, help="Maximum results (default: 10)")

    # List command
    list_parser = subparsers.add_parser("list", help="List documents")
    list_parser.add_argument("--category", help="Filter by category")
    list_parser.add_argument("--limit", type=int, default=20, help="Maximum results (default: 20)")

    # Get command
    get_parser = subparsers.add_parser("get", help="Get a specific document by ID")
    get_parser.add_argument("id", help="Document ID")

    # Stats command
    subparsers.add_parser("stats", help="Show database statistics")

    # Browse command
    browse_parser = subparsers.add_parser("browse", help="Interactive document browser")
    browse_parser.add_argument("--category", help="Filter by category")

    return parser


def main(argv: Optional[list[str]] = None) -> int:
    """
    Main entry point for the CLI.

    Args:
        argv: Command-line arguments (defaults to sys.argv)

    Returns:
        Exit code (0 for success, non-zero for errors)
    """
    parser = create_parser()
    args = parser.parse_args(argv)

    if not args.command:
        parser.print_help()
        return 1

    try:
        # Dispatch to appropriate command handler
        if args.command == "search":
            return search.execute(args)
        elif args.command == "list":
            return list_docs.execute(args)
        elif args.command == "get":
            return get_doc.execute(args)
        elif args.command == "stats":
            return stats.execute(args)
        elif args.command == "browse":
            return browse.execute(args)
        else:
            parser.print_help()
            return 1

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
