"""
Unit tests for ConvexClient.

Tests the core HTTP client functionality.
"""

import json
from typing import Any, Dict
from unittest.mock import Mock, patch

import pytest

from convex_client.client import ConvexClient, ConvexError, ConvexHTTPError


class TestConvexClientInit:
    """Test ConvexClient initialization."""

    def test_init_with_valid_url(self):
        """Test initialization with valid URL."""
        client = ConvexClient("https://example.convex.cloud")
        assert client.url == "https://example.convex.cloud/"
        assert client.auth_token is None
        assert client.timeout == 30

    def test_init_adds_trailing_slash(self):
        """Test that trailing slash is added if missing."""
        client = ConvexClient("https://example.convex.cloud")
        assert client.url.endswith("/")

    def test_init_with_auth_token(self):
        """Test initialization with auth token."""
        client = ConvexClient(
            "https://example.convex.cloud",
            auth_token="test-token",
        )
        assert client.auth_token == "test-token"
        assert "Authorization" in client._session.headers
        assert client._session.headers["Authorization"] == "Bearer test-token"

    def test_init_with_custom_timeout(self):
        """Test initialization with custom timeout."""
        client = ConvexClient("https://example.convex.cloud", timeout=60)
        assert client.timeout == 60

    def test_init_with_empty_url_raises_error(self):
        """Test that empty URL raises ValueError."""
        with pytest.raises(ValueError, match="Convex URL cannot be empty"):
            ConvexClient("")

    def test_init_sets_default_headers(self):
        """Test that default headers are set."""
        client = ConvexClient("https://example.convex.cloud")
        assert client._session.headers["Content-Type"] == "application/json"
        assert "Convex-Client" in client._session.headers


class TestConvexClientQuery:
    """Test ConvexClient.query method."""

    @patch("convex_client.client.requests.Session.post")
    def test_query_success(self, mock_post):
        """Test successful query execution."""
        # Mock response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = [{"id": "1", "title": "Test"}]
        mock_post.return_value = mock_response

        client = ConvexClient("https://example.convex.cloud")
        result = client.query("conversations/queries.list", {"limit": 10})

        assert result == [{"id": "1", "title": "Test"}]
        mock_post.assert_called_once()

        # Verify request payload
        call_args = mock_post.call_args
        assert call_args[1]["json"]["path"] == "conversations/queries.list"
        assert call_args[1]["json"]["args"] == {"limit": 10}

    @patch("convex_client.client.requests.Session.post")
    def test_query_with_no_args(self, mock_post):
        """Test query with no arguments."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = 42
        mock_post.return_value = mock_response

        client = ConvexClient("https://example.convex.cloud")
        result = client.query("conversations/queries.count")

        assert result == 42
        assert mock_post.call_args[1]["json"]["args"] == {}

    @patch("convex_client.client.requests.Session.post")
    def test_query_http_error(self, mock_post):
        """Test query with HTTP error."""
        mock_response = Mock()
        mock_response.status_code = 404
        mock_response.text = "Not found"
        mock_post.return_value = mock_response

        client = ConvexClient("https://example.convex.cloud")

        with pytest.raises(ConvexHTTPError) as exc_info:
            client.query("nonexistent/queries.list")

        assert exc_info.value.status_code == 404
        assert "404" in str(exc_info.value)

    @patch("convex_client.client.requests.Session.post")
    def test_query_convex_error(self, mock_post):
        """Test query with Convex-level error."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"error": "Function not found"}
        mock_post.return_value = mock_response

        client = ConvexClient("https://example.convex.cloud")

        with pytest.raises(ConvexError, match="Function not found"):
            client.query("invalid/queries.list")

    @patch("convex_client.client.requests.Session.post")
    def test_query_json_decode_error(self, mock_post):
        """Test query with invalid JSON response."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.side_effect = json.JSONDecodeError("err", "", 0)
        mock_post.return_value = mock_response

        client = ConvexClient("https://example.convex.cloud")

        with pytest.raises(ConvexError, match="Failed to parse response JSON"):
            client.query("conversations/queries.list")

    @patch("convex_client.client.requests.Session.post")
    def test_query_timeout(self, mock_post):
        """Test query with timeout."""
        import requests

        mock_post.side_effect = requests.exceptions.Timeout()

        client = ConvexClient("https://example.convex.cloud", timeout=5)

        with pytest.raises(ConvexHTTPError, match="Request timeout after 5 seconds"):
            client.query("conversations/queries.list")


class TestConvexClientMutation:
    """Test ConvexClient.mutation method."""

    @patch("convex_client.client.requests.Session.post")
    def test_mutation_success(self, mock_post):
        """Test successful mutation execution."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = "j5x_test_id"
        mock_post.return_value = mock_response

        client = ConvexClient("https://example.convex.cloud")
        result = client.mutation(
            "conversations/mutations.create",
            {"title": "New Chat"},
        )

        assert result == "j5x_test_id"
        assert mock_post.call_args[1]["json"]["path"] == "conversations/mutations.create"
        assert mock_post.call_args[1]["json"]["args"] == {"title": "New Chat"}


class TestConvexClientAction:
    """Test ConvexClient.action method."""

    @patch("convex_client.client.requests.Session.post")
    def test_action_success(self, mock_post):
        """Test successful action execution."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "completed"}
        mock_post.return_value = mock_response

        client = ConvexClient("https://example.convex.cloud")
        result = client.action("research/actions.start", {"query": "AI safety"})

        assert result == {"status": "completed"}


class TestConvexClientAuthToken:
    """Test auth token management."""

    def test_set_auth_token(self):
        """Test setting auth token after initialization."""
        client = ConvexClient("https://example.convex.cloud")
        assert "Authorization" not in client._session.headers

        client.set_auth_token("new-token")
        assert client.auth_token == "new-token"
        assert client._session.headers["Authorization"] == "Bearer new-token"

    def test_clear_auth_token(self):
        """Test clearing auth token."""
        client = ConvexClient(
            "https://example.convex.cloud",
            auth_token="initial-token",
        )
        assert "Authorization" in client._session.headers

        client.set_auth_token(None)
        assert client.auth_token is None
        assert "Authorization" not in client._session.headers


class TestConvexClientContextManager:
    """Test ConvexClient context manager."""

    def test_context_manager(self):
        """Test using client as context manager."""
        with ConvexClient("https://example.convex.cloud") as client:
            assert client.url == "https://example.convex.cloud/"

    def test_context_manager_closes_session(self):
        """Test that context manager closes session on exit."""
        client = ConvexClient("https://example.convex.cloud")
        session = client._session

        with client:
            pass

        # Verify close was called
        assert session.close


class TestConvexClientClose:
    """Test ConvexClient.close method."""

    def test_close(self):
        """Test closing client session."""
        client = ConvexClient("https://example.convex.cloud")
        session = client._session
        client.close()

        # Verify close was called
        assert session.close
