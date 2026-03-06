"""
Unit tests for output formatters.
"""

import json
import pytest
from holocron_cli.utils.formatters import (
    format_search_results,
    format_document,
    format_stats,
)


class TestSearchResultsFormatter:
    """Test search results formatting."""

    def test_format_empty_results(self):
        """Test formatting empty results."""
        result = format_search_results([], format_type="text")
        assert result == ""

    def test_format_single_result_text(self):
        """Test formatting single result as text."""
        results = [
            {
                "id": "doc-1",
                "title": "Test Document",
                "category": "research",
                "snippet": "This is a test snippet",
            }
        ]
        result = format_search_results(results, format_type="text")
        assert "1. Test Document" in result
        assert "ID: doc-1" in result
        assert "Category: research" in result

    def test_format_results_json(self):
        """Test formatting results as JSON."""
        results = [{"id": "doc-1", "title": "Test"}]
        result = format_search_results(results, format_type="json")
        parsed = json.loads(result)
        assert parsed == results


class TestDocumentFormatter:
    """Test document formatting."""

    def test_format_document_text(self):
        """Test formatting document as text."""
        doc = {
            "id": "doc-1",
            "title": "Test Document",
            "category": "research",
            "content": "Full content here",
            "createdAt": "2024-01-01T00:00:00Z",
        }
        result = format_document(doc, format_type="text")
        assert "Title: Test Document" in result
        assert "ID: doc-1" in result
        assert "Category: research" in result
        assert "Full content here" in result

    def test_format_document_json(self):
        """Test formatting document as JSON."""
        doc = {"id": "doc-1", "title": "Test"}
        result = format_document(doc, format_type="json")
        parsed = json.loads(result)
        assert parsed == doc


class TestStatsFormatter:
    """Test statistics formatting."""

    def test_format_stats_text(self):
        """Test formatting stats as text."""
        stats = {
            "total": 100,
            "byCategory": {
                "research": 50,
                "tutorials": 30,
                "reference": 20,
            },
        }
        result = format_stats(stats, format_type="text")
        assert "Total Documents: 100" in result
        assert "research: 50" in result
        assert "tutorials: 30" in result

    def test_format_stats_json(self):
        """Test formatting stats as JSON."""
        stats = {"total": 100, "byCategory": {}}
        result = format_stats(stats, format_type="json")
        parsed = json.loads(result)
        assert parsed == stats
