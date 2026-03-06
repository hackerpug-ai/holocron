#!/usr/bin/env python3
"""
Basic usage examples for ConvexClient.

This script demonstrates common operations with the Convex Python client.
"""

import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from convex_client import ConvexClient, ConvexAPI, ConvexError, ConvexHTTPError


def main():
    """Run basic usage examples."""
    # Get Convex URL from environment
    convex_url = os.getenv("EXPO_PUBLIC_CONVEX_URL")
    if not convex_url:
        print("ERROR: EXPO_PUBLIC_CONVEX_URL environment variable not set")
        print("Set it in your .env file or export it:")
        print('  export EXPO_PUBLIC_CONVEX_URL="https://your-deployment.convex.cloud"')
        sys.exit(1)

    print("=" * 80)
    print("ConvexClient Basic Usage Examples")
    print("=" * 80)
    print(f"Convex URL: {convex_url}")
    print()

    # Example 1: Low-level ConvexClient
    print("-" * 80)
    print("Example 1: Low-level ConvexClient")
    print("-" * 80)

    with ConvexClient(convex_url) as client:
        try:
            # Count conversations
            count = client.query("conversations/queries.count", {})
            print(f"Total conversations: {count}")

            # List conversations
            conversations = client.query("conversations/queries.list", {"limit": 5})
            print(f"Found {len(conversations)} conversations (limit 5)")
            for conv in conversations:
                print(f"  - {conv['title']} (ID: {conv['_id']})")

        except ConvexHTTPError as e:
            print(f"HTTP Error: {e} (Status: {e.status_code})")
        except ConvexError as e:
            print(f"Convex Error: {e}")

    print()

    # Example 2: High-level API
    print("-" * 80)
    print("Example 2: High-level API")
    print("-" * 80)

    client = ConvexClient(convex_url)
    api = ConvexAPI(client)

    try:
        # Create a new conversation
        conv_id = api.conversations.create("Python Client Test")
        print(f"Created conversation: {conv_id}")

        # Get the conversation
        conv = api.conversations.get(conv_id)
        print(f"Retrieved conversation: {conv['title']}")

        # Send a message
        msg_id = api.chat_messages.send(
            conversation_id=conv_id,
            role="user",
            content="Hello from Python!",
        )
        print(f"Sent message: {msg_id}")

        # Update conversation title
        api.conversations.update(conv_id, "Python Client Test (Updated)")
        print("Updated conversation title")

        # List messages
        messages = api.chat_messages.list(conv_id)
        print(f"Messages in conversation: {len(messages)}")
        for msg in messages:
            print(f"  [{msg['role']}] {msg['content']}")

        # Clean up - remove conversation
        api.conversations.remove(conv_id)
        print("Removed test conversation")

    except ConvexHTTPError as e:
        print(f"HTTP Error: {e} (Status: {e.status_code})")
    except ConvexError as e:
        print(f"Convex Error: {e}")
    finally:
        client.close()

    print()

    # Example 3: Document operations
    print("-" * 80)
    print("Example 3: Document operations")
    print("-" * 80)

    with ConvexClient(convex_url) as client:
        api = ConvexAPI(client)

        try:
            # List documents
            docs = api.documents.list(limit=5)
            print(f"Found {len(docs)} documents (limit 5)")
            for doc in docs:
                print(f"  - {doc['title']} ({doc['category']})")

            # Search documents
            if docs:
                search_results = api.documents.search("research", limit=3)
                print(f"\nSearch results for 'research': {len(search_results)} found")
                for doc in search_results:
                    print(f"  - {doc['title']}")

        except ConvexHTTPError as e:
            print(f"HTTP Error: {e} (Status: {e.status_code})")
        except ConvexError as e:
            print(f"Convex Error: {e}")

    print()

    # Example 4: Research sessions
    print("-" * 80)
    print("Example 4: Research sessions")
    print("-" * 80)

    with ConvexClient(convex_url) as client:
        api = ConvexAPI(client)

        try:
            # List research sessions
            sessions = api.research_sessions.list(limit=5)
            print(f"Found {len(sessions)} research sessions (limit 5)")
            for session in sessions:
                print(f"  - {session['query']} (Status: {session['status']})")

        except ConvexHTTPError as e:
            print(f"HTTP Error: {e} (Status: {e.status_code})")
        except ConvexError as e:
            print(f"Convex Error: {e}")

    print()
    print("=" * 80)
    print("Examples completed successfully!")
    print("=" * 80)


if __name__ == "__main__":
    main()
