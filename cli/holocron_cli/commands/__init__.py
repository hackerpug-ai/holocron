"""
Command handlers for the holocron CLI.

Each command module exports an execute() function that handles the command logic.
"""

from holocron_cli.commands import search, list_docs, get_doc, stats, browse

__all__ = ["search", "list_docs", "get_doc", "stats", "browse"]
