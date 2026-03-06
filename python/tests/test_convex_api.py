"""
Unit tests for ConvexAPI.

Tests the high-level API wrapper.
"""

from unittest.mock import Mock

import pytest

from convex_client.client import ConvexClient
from convex_client.api import ConvexAPI, ConversationsAPI, ChatMessagesAPI


class TestConvexAPI:
    """Test ConvexAPI initialization."""

    def test_init(self):
        """Test API wrapper initialization."""
        client = Mock(spec=ConvexClient)
        api = ConvexAPI(client)

        assert api.client is client
        assert isinstance(api.conversations, ConversationsAPI)
        assert isinstance(api.chat_messages, ChatMessagesAPI)


class TestConversationsAPI:
    """Test ConversationsAPI methods."""

    def test_list(self):
        """Test listing conversations."""
        client = Mock(spec=ConvexClient)
        client.query.return_value = [{"id": "1", "title": "Test"}]

        api = ConversationsAPI(client)
        result = api.list(limit=10)

        assert result == [{"id": "1", "title": "Test"}]
        client.query.assert_called_once_with(
            "conversations/queries.list",
            {"limit": 10},
        )

    def test_list_default_limit(self):
        """Test listing conversations with default limit."""
        client = Mock(spec=ConvexClient)
        client.query.return_value = []

        api = ConversationsAPI(client)
        api.list()

        client.query.assert_called_once_with(
            "conversations/queries.list",
            {"limit": 50},
        )

    def test_get(self):
        """Test getting a conversation."""
        client = Mock(spec=ConvexClient)
        client.query.return_value = {"id": "1", "title": "Test"}

        api = ConversationsAPI(client)
        result = api.get("1")

        assert result == {"id": "1", "title": "Test"}
        client.query.assert_called_once_with(
            "conversations/queries.get",
            {"id": "1"},
        )

    def test_count(self):
        """Test counting conversations."""
        client = Mock(spec=ConvexClient)
        client.query.return_value = 42

        api = ConversationsAPI(client)
        result = api.count()

        assert result == 42
        client.query.assert_called_once_with(
            "conversations/queries.count",
            {},
        )

    def test_create(self):
        """Test creating a conversation."""
        client = Mock(spec=ConvexClient)
        client.mutation.return_value = "j5x_new_id"

        api = ConversationsAPI(client)
        result = api.create("Test Chat")

        assert result == "j5x_new_id"
        client.mutation.assert_called_once_with(
            "conversations/mutations.create",
            {"title": "Test Chat", "lastMessagePreview": None},
        )

    def test_create_with_preview(self):
        """Test creating a conversation with preview."""
        client = Mock(spec=ConvexClient)
        client.mutation.return_value = "j5x_new_id"

        api = ConversationsAPI(client)
        result = api.create("Test Chat", "Preview text")

        assert result == "j5x_new_id"
        client.mutation.assert_called_once_with(
            "conversations/mutations.create",
            {"title": "Test Chat", "lastMessagePreview": "Preview text"},
        )

    def test_create_default_title(self):
        """Test creating a conversation with default title."""
        client = Mock(spec=ConvexClient)
        client.mutation.return_value = "j5x_new_id"

        api = ConversationsAPI(client)
        result = api.create()

        assert result == "j5x_new_id"
        client.mutation.assert_called_once_with(
            "conversations/mutations.create",
            {"title": "New Chat", "lastMessagePreview": None},
        )

    def test_update(self):
        """Test updating a conversation."""
        client = Mock(spec=ConvexClient)
        client.mutation.return_value = {"id": "1", "title": "Updated"}

        api = ConversationsAPI(client)
        result = api.update("1", "Updated")

        assert result == {"id": "1", "title": "Updated"}
        client.mutation.assert_called_once_with(
            "conversations/mutations.update",
            {"id": "1", "title": "Updated"},
        )

    def test_remove(self):
        """Test removing a conversation."""
        client = Mock(spec=ConvexClient)
        client.mutation.return_value = {"success": True}

        api = ConversationsAPI(client)
        result = api.remove("1")

        assert result == {"success": True}
        client.mutation.assert_called_once_with(
            "conversations/mutations.remove",
            {"id": "1"},
        )

    def test_touch(self):
        """Test touching a conversation."""
        client = Mock(spec=ConvexClient)
        client.mutation.return_value = {"id": "1", "updatedAt": 123456}

        api = ConversationsAPI(client)
        result = api.touch("1", "Last message")

        assert result == {"id": "1", "updatedAt": 123456}
        client.mutation.assert_called_once_with(
            "conversations/mutations.touch",
            {"id": "1", "lastMessagePreview": "Last message"},
        )


class TestChatMessagesAPI:
    """Test ChatMessagesAPI methods."""

    def test_list(self):
        """Test listing chat messages."""
        client = Mock(spec=ConvexClient)
        client.query.return_value = [{"id": "1", "content": "Hello"}]

        api = ChatMessagesAPI(client)
        result = api.list("conv_id")

        assert result == [{"id": "1", "content": "Hello"}]
        client.query.assert_called_once_with(
            "chatMessages/queries.list",
            {"conversationId": "conv_id"},
        )

    def test_list_with_limit(self):
        """Test listing chat messages with limit."""
        client = Mock(spec=ConvexClient)
        client.query.return_value = []

        api = ChatMessagesAPI(client)
        api.list("conv_id", limit=10)

        client.query.assert_called_once_with(
            "chatMessages/queries.list",
            {"conversationId": "conv_id", "limit": 10},
        )

    def test_send_basic(self):
        """Test sending a basic message."""
        client = Mock(spec=ConvexClient)
        client.mutation.return_value = "msg_id"

        api = ChatMessagesAPI(client)
        result = api.send("conv_id", "user", "Hello")

        assert result == "msg_id"
        client.mutation.assert_called_once_with(
            "chatMessages/mutations.insert",
            {
                "conversationId": "conv_id",
                "role": "user",
                "content": "Hello",
                "messageType": "text",
            },
        )

    def test_send_with_card_data(self):
        """Test sending a message with card data."""
        client = Mock(spec=ConvexClient)
        client.mutation.return_value = "msg_id"

        api = ChatMessagesAPI(client)
        card_data = {"type": "result", "data": {}}
        result = api.send(
            "conv_id",
            "agent",
            "Result",
            message_type="result_card",
            card_data=card_data,
        )

        assert result == "msg_id"
        args = client.mutation.call_args[0][1]
        assert args["cardData"] == card_data
        assert args["messageType"] == "result_card"

    def test_send_with_session_id(self):
        """Test sending a message with session ID."""
        client = Mock(spec=ConvexClient)
        client.mutation.return_value = "msg_id"

        api = ChatMessagesAPI(client)
        result = api.send(
            "conv_id",
            "agent",
            "Research complete",
            session_id="session_123",
        )

        args = client.mutation.call_args[0][1]
        assert args["sessionId"] == "session_123"
