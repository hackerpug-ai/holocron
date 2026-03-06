"""
Unit tests for CLI entry point and argument parsing.
"""

import pytest
from holocron_cli.cli import create_parser, main


class TestParser:
    """Test argument parser configuration."""

    def test_parser_creation(self):
        """Test that parser can be created."""
        parser = create_parser()
        assert parser is not None
        assert parser.prog == "holocron"

    def test_search_command(self):
        """Test search command parsing."""
        parser = create_parser()
        args = parser.parse_args(["search", "test query"])
        assert args.command == "search"
        assert args.query == "test query"
        assert args.limit == 10  # default

    def test_search_with_limit(self):
        """Test search command with custom limit."""
        parser = create_parser()
        args = parser.parse_args(["search", "test", "--limit", "5"])
        assert args.command == "search"
        assert args.limit == 5

    def test_list_command(self):
        """Test list command parsing."""
        parser = create_parser()
        args = parser.parse_args(["list"])
        assert args.command == "list"
        assert args.category is None
        assert args.limit == 20  # default

    def test_list_with_category(self):
        """Test list command with category filter."""
        parser = create_parser()
        args = parser.parse_args(["list", "--category", "research"])
        assert args.command == "list"
        assert args.category == "research"

    def test_get_command(self):
        """Test get command parsing."""
        parser = create_parser()
        args = parser.parse_args(["get", "doc-123"])
        assert args.command == "get"
        assert args.id == "doc-123"

    def test_stats_command(self):
        """Test stats command parsing."""
        parser = create_parser()
        args = parser.parse_args(["stats"])
        assert args.command == "stats"

    def test_browse_command(self):
        """Test browse command parsing."""
        parser = create_parser()
        args = parser.parse_args(["browse"])
        assert args.command == "browse"
        assert args.category is None

    def test_browse_with_category(self):
        """Test browse command with category filter."""
        parser = create_parser()
        args = parser.parse_args(["browse", "--category", "tutorials"])
        assert args.command == "browse"
        assert args.category == "tutorials"


class TestMain:
    """Test main entry point."""

    def test_main_no_args(self):
        """Test main with no arguments shows help."""
        result = main([])
        assert result == 1

    def test_main_with_invalid_command(self):
        """Test main with invalid command."""
        result = main(["invalid"])
        assert result == 1
