#!/usr/bin/env python3
"""
Convex Holocron Client - Specialized client for holocron research data.

This is a convenience wrapper around the generic convex_client package,
providing holocron-specific methods and configuration.

Usage:
    from holocron_client import ConvexHolocronClient, HolocronConvexError

    client = ConvexHolocronClient()
    results = client.search_hybrid("validation gates", limit=5)
    doc = client.get_document("doc_id")
"""

import os
import json
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential
from datetime import datetime

# Import the generic convex client
from convex_client import ConvexClient as GenericConvexClient, ConvexError

# Load environment from project .env
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(PROJECT_ROOT, '.env')
load_dotenv(ENV_PATH)

# Convex configuration
CONVEX_URL = os.getenv("EXPO_PUBLIC_CONVEX_URL")
CONVEX_ADMIN_KEY = os.getenv("CONVEX_DEPLOYMENT_KEY")

# OpenAI for embeddings
OPENAI_API_KEY = os.getenv("EXPO_PUBLIC_OPENAI_API_KEY", os.getenv("OPENAI_API_KEY"))

# Valid categories for documents
VALID_CATEGORIES = [
    "architecture", "business", "competitors", "frameworks",
    "infrastructure", "libraries", "patterns", "platforms",
    "security", "research", "reference", "tools"
]


class HolocronConvexError(Exception):
    """Custom exception for Holocron Convex client errors."""
    pass


class ConvexHolocronClient:
    """Client for Convex holocron database operations."""

    def __init__(
        self,
        url: Optional[str] = None,
        admin_key: Optional[str] = None,
        openai_key: Optional[str] = None
    ):
        """Initialize the client with Convex credentials."""
        self.url = url or CONVEX_URL
        self.admin_key = admin_key or CONVEX_ADMIN_KEY
        self.openai_key = openai_key or OPENAI_API_KEY

        if not self.url:
            raise ValueError(
                "Missing Convex URL. Set EXPO_PUBLIC_CONVEX_URL in ~/Projects/holocron/.env"
            )

        # Initialize generic Convex client
        self.client = GenericConvexClient(self.url, admin_key=self.admin_key)

    def _get_embedding(self, text: str) -> List[float]:
        """Generate embedding using OpenAI API."""
        if not self.openai_key:
            raise ValueError("OPENAI_API_KEY not set - required for vector search")

        import httpx
        try:
            response = httpx.post(
                "https://api.openai.com/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {self.openai_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "text-embedding-3-small",
                    "input": text[:8000],  # Limit to ~8k chars
                },
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()["data"][0]["embedding"]
        except Exception as e:
            raise HolocronConvexError(f"Failed to generate embedding: {e}")

    # -------------------------------------------------------------------------
    # Search Operations
    # -------------------------------------------------------------------------

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    def search_hybrid(
        self,
        query: str,
        limit: int = 10,
        category: Optional[str] = None
    ) -> List[Dict]:
        """
        Hybrid search combining vector and FTS.

        Args:
            query: Search query text
            limit: Maximum results to return (default 10)
            category: Optional category filter

        Returns:
            List of matching documents with _id, title, category, content, score
        """
        embedding = self._get_embedding(query)

        args = {
            "query": query,
            "embedding": embedding,
            "limit": limit
        }

        if category:
            args["category"] = category

        try:
            return self.client.action("documents:hybridSearch", args)
        except ConvexError as e:
            raise HolocronConvexError(f"Hybrid search failed: {e}")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    def search_fts(
        self,
        query: str,
        limit: int = 10,
        category: Optional[str] = None
    ) -> List[Dict]:
        """
        Full-text search using Convex text search.

        Args:
            query: Search query text
            limit: Maximum results to return (default 10)
            category: Optional category filter

        Returns:
            List of matching documents
        """
        args = {
            "query": query,
            "limit": limit
        }

        if category:
            args["category"] = category

        try:
            return self.client.query("documents:fullTextSearch", args)
        except ConvexError as e:
            raise HolocronConvexError(f"FTS search failed: {e}")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    def search_vector(
        self,
        query: str,
        limit: int = 10,
        category: Optional[str] = None
    ) -> List[Dict]:
        """
        Pure vector/semantic search.

        Args:
            query: Search query text
            limit: Maximum results to return (default 10)
            category: Optional category filter

        Returns:
            List of matching documents
        """
        embedding = self._get_embedding(query)

        args = {
            "embedding": embedding,
            "limit": limit
        }

        if category:
            args["category"] = category

        try:
            return self.client.query("documents:vectorSearch", args)
        except ConvexError as e:
            raise HolocronConvexError(f"Vector search failed: {e}")

    # -------------------------------------------------------------------------
    # Document Operations
    # -------------------------------------------------------------------------

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    def get_document(self, doc_id: str) -> Optional[Dict]:
        """
        Get a document by ID.

        Args:
            doc_id: Document ID (Convex ID string)

        Returns:
            Document dict or None if not found
        """
        try:
            return self.client.query("documents:get", {"id": doc_id})
        except ConvexError:
            return None

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    def create_document(
        self,
        title: str,
        content: str,
        category: str,
        file_path: Optional[str] = None,
        file_type: str = "md",
        status: str = "complete",
        research_type: Optional[str] = None,
        iterations: Optional[int] = None,
        **kwargs
    ) -> Dict:
        """
        Create a new document in holocron.

        Args:
            title: Document title
            content: Full document content
            category: One of VALID_CATEGORIES
            file_path: Optional archive path
            file_type: File extension (default "md")
            status: Document status (default "complete")
            research_type: Type of research (e.g., "url_analysis")
            iterations: Number of research iterations
            **kwargs: Additional fields

        Returns:
            Created document dict with id
        """
        if category not in VALID_CATEGORIES:
            raise ValueError(f"Invalid category '{category}'. Must be one of: {VALID_CATEGORIES}")

        # Generate embedding for the content
        embedding = self._get_embedding(f"{title}\n\n{content}")

        # Build document data (use camelCase for Convex convention)
        now = datetime.now()

        data = {
            "title": title,
            "content": content,
            "category": category,
            "filePath": file_path or f"archive/{title.lower().replace(' ', '-')[:50]}-{now.strftime('%Y%m%d-%H%M')}.md",
            "fileType": file_type,
            "status": status,
            "date": now.strftime("%Y-%m-%d"),
            "time": now.strftime("%H:%M"),
            "embedding": embedding,
        }

        if research_type:
            data["researchType"] = research_type
        if iterations is not None:
            data["iterations"] = iterations

        # Merge additional kwargs
        data.update(kwargs)

        try:
            result = self.client.mutation("documents:create", data)
            if not result or "id" not in result:
                raise HolocronConvexError("Create failed - no document ID returned")
            return result
        except ConvexError as e:
            raise HolocronConvexError(f"Create document failed: {e}")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    def update_document(self, doc_id: str, **updates) -> Dict:
        """
        Update an existing document.

        Args:
            doc_id: Document ID to update
            **updates: Fields to update

        Returns:
            Updated document dict
        """
        # If content is updated, regenerate embedding
        if "content" in updates or "title" in updates:
            doc = self.get_document(doc_id)
            if doc:
                title = updates.get("title", doc.get("title", ""))
                content = updates.get("content", doc.get("content", ""))
                embedding = self._get_embedding(f"{title}\n\n{content}")
                updates["embedding"] = embedding

        try:
            result = self.client.mutation("documents:update", {
                "id": doc_id,
                "updates": updates
            })
            if not result:
                raise HolocronConvexError(f"Update failed for document {doc_id}")
            return result
        except ConvexError as e:
            raise HolocronConvexError(f"Update document failed: {e}")

    # -------------------------------------------------------------------------
    # Research Session Operations
    # -------------------------------------------------------------------------

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    def create_research_session(
        self,
        query: str,
        input_type: str,
        max_iterations: int = 5,
        plan_json: Optional[str] = None
    ) -> Dict:
        """Create a new research session."""
        try:
            return self.client.mutation("researchSessions:create", {
                "query": query,
                "inputType": input_type,
                "maxIterations": max_iterations,
                "planJson": plan_json
            })
        except ConvexError as e:
            raise HolocronConvexError(f"Create research session failed: {e}")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    def create_research_iteration(
        self,
        session_id: str,
        iteration_number: int,
        findings_summary: str,
        review_score: int
    ) -> Dict:
        """Create a new research iteration."""
        try:
            return self.client.mutation("researchIterations:create", {
                "sessionId": session_id,
                "iterationNumber": iteration_number,
                "findingsSummary": findings_summary,
                "reviewScore": review_score
            })
        except ConvexError as e:
            raise HolocronConvexError(f"Create research iteration failed: {e}")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    def update_research_session(
        self,
        session_id: str,
        **updates
    ) -> Dict:
        """Update a research session."""
        try:
            return self.client.mutation("researchSessions:update", {
                "id": session_id,
                "updates": updates
            })
        except ConvexError as e:
            raise HolocronConvexError(f"Update research session failed: {e}")

    # -------------------------------------------------------------------------
    # Stats and Utilities
    # -------------------------------------------------------------------------

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    def get_stats(self) -> Dict:
        """
        Get database statistics.

        Returns:
            Dict with total_documents, categories breakdown, recent_documents
        """
        try:
            stats = self.client.query("documents:getStats", {})
            return {
                "total_documents": stats.get("total", 0),
                "categories": stats.get("categories", {}),
                "recent_documents": stats.get("recent", [])
            }
        except ConvexError as e:
            raise HolocronConvexError(f"Get stats failed: {e}")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    def list_categories(self) -> List[str]:
        """
        List all valid categories.

        Returns:
            List of category names
        """
        return VALID_CATEGORIES.copy()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    def list_documents(
        self,
        category: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> List[Dict]:
        """
        List documents with optional filtering.

        Args:
            category: Optional category filter
            limit: Maximum results (default 20)
            offset: Pagination offset (default 0)

        Returns:
            List of documents (id, title, category, created_at)
        """
        args = {"limit": limit, "offset": offset}

        if category:
            args["category"] = category

        try:
            return self.client.query("documents:list", args)
        except ConvexError as e:
            raise HolocronConvexError(f"List documents failed: {e}")

    def close(self):
        """Close the Convex client connection."""
        if hasattr(self.client, 'close'):
            self.client.close()

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()


# Convenience function for quick searches
def search(query: str, limit: int = 5, method: str = "hybrid") -> List[Dict]:
    """
    Quick search function for one-off queries.

    Args:
        query: Search text
        limit: Max results
        method: "hybrid", "fts", or "vector"

    Returns:
        List of matching documents
    """
    with ConvexHolocronClient() as client:
        if method == "fts":
            return client.search_fts(query, limit)
        elif method == "vector":
            return client.search_vector(query, limit)
        else:
            return client.search_hybrid(query, limit)


# Backward compatibility alias
HolocronClient = ConvexHolocronClient


if __name__ == "__main__":
    # Quick test
    import sys

    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
        print(f"Searching for: {query}")
        try:
            results = search(query, limit=3)
            for r in results:
                print(f"  [{r.get('_id')}] {r.get('title')} ({r.get('category')})")
        except HolocronConvexError as e:
            print(f"Error: {e}")
    else:
        print("Usage: python holocron_client.py <search query>")
        print("\nTesting connection...")
        try:
            with ConvexHolocronClient() as client:
                stats = client.get_stats()
                print(f"Total documents: {stats['total_documents']}")
                print(f"Categories: {stats['categories']}")
        except HolocronConvexError as e:
            print(f"Connection failed: {e}")
