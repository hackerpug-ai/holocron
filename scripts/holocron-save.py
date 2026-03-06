#!/usr/bin/env python3
"""
Save a document to the Holocron knowledge database via Convex.

This script allows saving documents to the holocron database from the command line.
It supports reading from files or stdin, and can optionally generate embeddings.
"""

import os
import sys
import argparse
from pathlib import Path
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "python"))

from convex_client import ConvexClient, ConvexAPI, ConvexError, ConvexHTTPError


def read_content(file_path: Optional[str]) -> str:
    """
    Read content from file or stdin.

    Args:
        file_path: Path to file to read, or None to read from stdin

    Returns:
        Content as string
    """
    if file_path:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        return path.read_text(encoding='utf-8')
    else:
        # Read from stdin
        return sys.stdin.read()


def detect_file_type(file_path: Optional[str]) -> Optional[str]:
    """
    Detect file type from extension.

    Args:
        file_path: Path to file

    Returns:
        File type or None
    """
    if not file_path:
        return None

    ext = Path(file_path).suffix.lower()

    type_map = {
        '.md': 'markdown',
        '.txt': 'text',
        '.py': 'python',
        '.js': 'javascript',
        '.ts': 'typescript',
        '.json': 'json',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.html': 'html',
        '.css': 'css',
        '.sh': 'shell',
    }

    return type_map.get(ext, 'text')


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        prog="holocron-save",
        description="Save a document to the Holocron knowledge database",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Save from file
  holocron-save --title "My Notes" --category notes --file notes.md

  # Save from stdin
  echo "Hello World" | holocron-save --title "Hello" --category test

  # Save with explicit file type
  holocron-save --title "Script" --category code --file script.sh --type shell
        """,
    )

    parser.add_argument(
        "--title",
        "-t",
        required=True,
        help="Document title",
    )

    parser.add_argument(
        "--category",
        "-c",
        required=True,
        help="Document category (e.g., notes, research, code, article)",
    )

    parser.add_argument(
        "--file",
        "-f",
        help="Path to file to save (if not provided, reads from stdin)",
    )

    parser.add_argument(
        "--type",
        help="File type (auto-detected from extension if not provided)",
    )

    parser.add_argument(
        "--url",
        help="Convex deployment URL (defaults to EXPO_PUBLIC_CONVEX_URL env var)",
    )

    args = parser.parse_args()

    # Get Convex URL
    convex_url = args.url or os.getenv("EXPO_PUBLIC_CONVEX_URL")
    if not convex_url:
        print("ERROR: Convex URL not provided", file=sys.stderr)
        print("Set EXPO_PUBLIC_CONVEX_URL environment variable or use --url", file=sys.stderr)
        return 1

    try:
        # Read content
        print(f"Reading content from {'stdin' if not args.file else args.file}...", file=sys.stderr)
        content = read_content(args.file)

        if not content.strip():
            print("ERROR: Content is empty", file=sys.stderr)
            return 1

        # Detect file type
        file_type = args.type or detect_file_type(args.file)

        # Create document
        print(f"Saving document to Convex...", file=sys.stderr)
        with ConvexClient(convex_url) as client:
            api = ConvexAPI(client)

            doc_id = api.documents.create(
                title=args.title,
                content=content,
                category=args.category,
                file_path=args.file if args.file else None,
                file_type=file_type,
            )

            print(f"✓ Document saved successfully!", file=sys.stderr)
            print(f"  ID: {doc_id}", file=sys.stderr)
            print(f"  Title: {args.title}", file=sys.stderr)
            print(f"  Category: {args.category}", file=sys.stderr)
            if file_type:
                print(f"  Type: {file_type}", file=sys.stderr)
            print(f"  Size: {len(content)} characters", file=sys.stderr)

            # Output just the ID to stdout for scripting
            print(doc_id)

        return 0

    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    except ConvexHTTPError as e:
        print(f"ERROR: HTTP {e.status_code}: {e}", file=sys.stderr)
        return 1
    except ConvexError as e:
        print(f"ERROR: Convex error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
