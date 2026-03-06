"""
Core Convex HTTP client implementation.

Provides low-level HTTP interaction with Convex backend.
"""

import json
from typing import Any, Dict, Optional, Union
from urllib.parse import urljoin

try:
    import requests
except ImportError:
    raise ImportError(
        "The 'requests' package is required for ConvexClient. "
        "Install it with: pip install requests"
    )


class ConvexError(Exception):
    """Base exception for Convex client errors."""

    pass


class ConvexHTTPError(ConvexError):
    """Exception raised for HTTP errors from Convex API."""

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        response_body: Optional[str] = None,
    ):
        """
        Initialize HTTP error.

        Args:
            message: Error message
            status_code: HTTP status code
            response_body: Raw response body
        """
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class ConvexClient:
    """
    HTTP client for interacting with Convex backend.

    This client provides methods to execute queries, mutations, and actions
    on a Convex deployment via HTTP.

    Attributes:
        url: The Convex deployment URL
        auth_token: Optional authentication token
        timeout: Request timeout in seconds

    Example:
        >>> client = ConvexClient("https://your-deployment.convex.cloud")
        >>> result = client.query("conversations/queries.list", {"limit": 10})
    """

    def __init__(
        self,
        url: str,
        auth_token: Optional[str] = None,
        timeout: int = 30,
    ):
        """
        Initialize Convex client.

        Args:
            url: Convex deployment URL (e.g., "https://your-deployment.convex.cloud")
            auth_token: Optional JWT authentication token
            timeout: Request timeout in seconds (default: 30)

        Raises:
            ValueError: If URL is invalid
        """
        if not url:
            raise ValueError("Convex URL cannot be empty")

        # Ensure URL ends with /
        self.url = url if url.endswith("/") else f"{url}/"
        self.auth_token = auth_token
        self.timeout = timeout
        self._session = requests.Session()

        # Set default headers
        self._session.headers.update(
            {
                "Content-Type": "application/json",
            }
        )

        if auth_token:
            self._session.headers.update({"Authorization": f"Bearer {auth_token}"})

    def _make_request(
        self,
        endpoint: str,
        function_path: str,
        args: Optional[Dict[str, Any]] = None,
        format: str = "json",
    ) -> Any:
        """
        Make HTTP request to Convex backend.

        Args:
            endpoint: API endpoint ("query", "mutation", "action")
            function_path: Function path (e.g., "conversations/queries.list")
            args: Function arguments
            format: Response format ("json" or "convex")

        Returns:
            Response data

        Raises:
            ConvexHTTPError: If HTTP request fails
            ConvexError: If response parsing fails
        """
        # Construct URL
        url = urljoin(self.url, f"api/{endpoint}")

        # Convert function path from dot notation to colon notation
        # e.g., "conversations/queries.list" -> "conversations/queries:list"
        if "." in function_path:
            parts = function_path.rsplit(".", 1)
            function_path = f"{parts[0]}:{parts[1]}"

        # Prepare payload
        payload = {
            "path": function_path,
            "args": args or {},
            "format": format,
        }

        try:
            response = self._session.post(
                url,
                json=payload,
                timeout=self.timeout,
            )

            # Check for HTTP errors
            if response.status_code != 200:
                raise ConvexHTTPError(
                    f"HTTP {response.status_code}: {response.text}",
                    status_code=response.status_code,
                    response_body=response.text,
                )

            # Parse response
            try:
                data = response.json()
            except json.JSONDecodeError as e:
                raise ConvexError(f"Failed to parse response JSON: {e}")

            # Check for Convex-level errors
            if isinstance(data, dict) and "error" in data:
                error_msg = data.get("error", "Unknown error")
                raise ConvexError(f"Convex error: {error_msg}")

            return data

        except requests.exceptions.Timeout:
            raise ConvexHTTPError(
                f"Request timeout after {self.timeout} seconds",
                status_code=None,
            )
        except requests.exceptions.ConnectionError as e:
            raise ConvexHTTPError(f"Connection error: {e}", status_code=None)
        except requests.exceptions.RequestException as e:
            raise ConvexHTTPError(f"Request failed: {e}", status_code=None)

    def query(
        self,
        function_path: str,
        args: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """
        Execute a Convex query.

        Queries are read-only operations that fetch data from the database.

        Args:
            function_path: Query function path (e.g., "conversations/queries.list")
            args: Query arguments

        Returns:
            Query result

        Example:
            >>> conversations = client.query("conversations/queries.list", {"limit": 10})
            >>> conv = client.query("conversations/queries.get", {"id": "j5x..."})
        """
        return self._make_request("query", function_path, args)

    def mutation(
        self,
        function_path: str,
        args: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """
        Execute a Convex mutation.

        Mutations are write operations that modify data in the database.

        Args:
            function_path: Mutation function path (e.g., "conversations/mutations.create")
            args: Mutation arguments

        Returns:
            Mutation result (typically the created/updated document ID)

        Example:
            >>> conv_id = client.mutation(
            ...     "conversations/mutations.create",
            ...     {"title": "New Chat"}
            ... )
            >>> client.mutation(
            ...     "conversations/mutations.update",
            ...     {"id": conv_id, "title": "Updated Title"}
            ... )
        """
        return self._make_request("mutation", function_path, args)

    def action(
        self,
        function_path: str,
        args: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """
        Execute a Convex action.

        Actions can perform side effects like calling external APIs,
        and can run queries and mutations.

        Args:
            function_path: Action function path (e.g., "research/actions.start")
            args: Action arguments

        Returns:
            Action result

        Example:
            >>> result = client.action("research/actions.start", {"query": "AI safety"})
        """
        return self._make_request("action", function_path, args)

    def close(self) -> None:
        """
        Close the HTTP session.

        Call this when you're done using the client to release resources.
        """
        self._session.close()

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - closes session."""
        self.close()

    def set_auth_token(self, token: Optional[str]) -> None:
        """
        Set or update authentication token.

        Args:
            token: JWT authentication token (or None to clear)
        """
        self.auth_token = token
        if token:
            self._session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            self._session.headers.pop("Authorization", None)
