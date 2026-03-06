"""
Unit tests for Convex client wrapper.
"""

import os
import pytest
from holocron_cli.core.convex_client import (
    ConvexClient,
    get_client,
    reset_client,
)


class TestConvexClient:
    """Test ConvexClient wrapper."""

    def test_client_initialization(self):
        """Test client can be initialized with URL."""
        client = ConvexClient("https://test.convex.cloud")
        assert client.url == "https://test.convex.cloud"

    def test_query_not_implemented(self):
        """Test query method raises NotImplementedError (placeholder)."""
        client = ConvexClient("https://test.convex.cloud")
        with pytest.raises(NotImplementedError):
            client.query("documents:search", {"query": "test"})


class TestGetClient:
    """Test singleton client management."""

    def setup_method(self):
        """Reset client before each test."""
        reset_client()

    def teardown_method(self):
        """Clean up after each test."""
        reset_client()
        if "CONVEX_URL" in os.environ:
            del os.environ["CONVEX_URL"]

    def test_get_client_requires_env_var(self):
        """Test get_client raises error without CONVEX_URL."""
        if "CONVEX_URL" in os.environ:
            del os.environ["CONVEX_URL"]

        with pytest.raises(ValueError, match="CONVEX_URL"):
            get_client()

    def test_get_client_creates_singleton(self):
        """Test get_client creates and returns singleton."""
        os.environ["CONVEX_URL"] = "https://test.convex.cloud"

        client1 = get_client()
        client2 = get_client()

        assert client1 is client2
        assert client1.url == "https://test.convex.cloud"

    def test_reset_client(self):
        """Test reset_client clears singleton."""
        os.environ["CONVEX_URL"] = "https://test.convex.cloud"

        client1 = get_client()
        reset_client()
        client2 = get_client()

        assert client1 is not client2
