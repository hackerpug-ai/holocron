"""
Output formatting utilities.

Provides functions for formatting CLI output in various formats (text, JSON, YAML).
"""

import json
from typing import Any


def format_search_results(results: list[dict[str, Any]], format_type: str = "text") -> str:
    """
    Format search results for display.

    Args:
        results: List of search result dictionaries
        format_type: Output format ("text", "json", or "yaml")

    Returns:
        Formatted output string
    """
    if format_type == "json":
        return json.dumps(results, indent=2)

    # Default text format
    output = []
    for i, result in enumerate(results, 1):
        output.append(f"\n{i}. {result.get('title', 'Untitled')}")
        output.append(f"   ID: {result.get('id', 'N/A')}")
        output.append(f"   Category: {result.get('category', 'N/A')}")
        if 'snippet' in result:
            output.append(f"   {result['snippet'][:100]}...")

    return "\n".join(output)


def format_document(doc: dict[str, Any], format_type: str = "text") -> str:
    """
    Format a single document for display.

    Args:
        doc: Document dictionary
        format_type: Output format ("text", "json", or "yaml")

    Returns:
        Formatted output string
    """
    if format_type == "json":
        return json.dumps(doc, indent=2)

    # Default text format
    output = [
        f"Title: {doc.get('title', 'Untitled')}",
        f"ID: {doc.get('id', 'N/A')}",
        f"Category: {doc.get('category', 'N/A')}",
        f"Created: {doc.get('createdAt', 'N/A')}",
        "\nContent:",
        "-" * 80,
        doc.get('content', 'No content'),
    ]

    return "\n".join(output)


def format_stats(stats: dict[str, Any], format_type: str = "text") -> str:
    """
    Format database statistics for display.

    Args:
        stats: Statistics dictionary
        format_type: Output format ("text", "json", or "yaml")

    Returns:
        Formatted output string
    """
    if format_type == "json":
        return json.dumps(stats, indent=2)

    # Default text format
    output = [
        "Database Statistics",
        "=" * 40,
        f"Total Documents: {stats.get('total', 0)}",
        "\nBy Category:",
    ]

    for category, count in stats.get('byCategory', {}).items():
        output.append(f"  {category}: {count}")

    return "\n".join(output)
