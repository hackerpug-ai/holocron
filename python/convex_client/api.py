"""
High-level API wrapper for Convex operations.

Provides typed interfaces for common Convex operations organized by module.
"""

from typing import Any, Dict, List, Optional
from .client import ConvexClient


class ConvexAPI:
    """
    High-level API wrapper for Convex backend.

    Provides typed methods for common operations organized by module.
    This is a convenience layer on top of ConvexClient.

    Example:
        >>> client = ConvexClient("https://your-deployment.convex.cloud")
        >>> api = ConvexAPI(client)
        >>> conversations = api.conversations.list(limit=10)
        >>> conv_id = api.conversations.create("New Chat")
    """

    def __init__(self, client: ConvexClient):
        """
        Initialize API wrapper.

        Args:
            client: ConvexClient instance
        """
        self.client = client
        self.conversations = ConversationsAPI(client)
        self.chat_messages = ChatMessagesAPI(client)
        self.documents = DocumentsAPI(client)
        self.research_sessions = ResearchSessionsAPI(client)
        self.tasks = TasksAPI(client)


class ConversationsAPI:
    """API methods for conversations module."""

    def __init__(self, client: ConvexClient):
        self.client = client

    def list(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        List all conversations sorted by updatedAt (newest first).

        Args:
            limit: Maximum number of conversations to return (default: 50)

        Returns:
            List of conversation objects
        """
        return self.client.query("conversations/queries.list", {"limit": limit})

    def get(self, id: str) -> Optional[Dict[str, Any]]:
        """
        Get a single conversation by id.

        Args:
            id: Conversation ID

        Returns:
            Conversation object or None if not found
        """
        return self.client.query("conversations/queries.get", {"id": id})

    def count(self) -> int:
        """
        Get total conversation count.

        Returns:
            Number of conversations
        """
        return self.client.query("conversations/queries.count", {})

    def create(
        self,
        title: str = "New Chat",
        last_message_preview: Optional[str] = None,
    ) -> str:
        """
        Create a new conversation.

        Args:
            title: Conversation title (default: "New Chat")
            last_message_preview: Preview of last message

        Returns:
            Created conversation ID
        """
        return self.client.mutation(
            "conversations/mutations.create",
            {
                "title": title,
                "lastMessagePreview": last_message_preview,
            },
        )

    def update(self, id: str, title: str) -> Dict[str, Any]:
        """
        Update a conversation's title.

        Args:
            id: Conversation ID
            title: New title

        Returns:
            Updated conversation object
        """
        return self.client.mutation(
            "conversations/mutations.update",
            {"id": id, "title": title},
        )

    def remove(self, id: str) -> Dict[str, bool]:
        """
        Remove a conversation (cascades to chat messages).

        Args:
            id: Conversation ID

        Returns:
            Success status
        """
        return self.client.mutation("conversations/mutations.remove", {"id": id})

    def touch(
        self,
        id: str,
        last_message_preview: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Update conversation updatedAt timestamp.

        Args:
            id: Conversation ID
            last_message_preview: New last message preview

        Returns:
            Updated conversation object
        """
        return self.client.mutation(
            "conversations/mutations.touch",
            {
                "id": id,
                "lastMessagePreview": last_message_preview,
            },
        )


class ChatMessagesAPI:
    """API methods for chat messages module."""

    def __init__(self, client: ConvexClient):
        self.client = client

    def list(
        self,
        conversation_id: str,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        List messages for a conversation.

        Args:
            conversation_id: Conversation ID
            limit: Optional limit on number of messages

        Returns:
            List of message objects
        """
        args = {"conversationId": conversation_id}
        if limit is not None:
            args["limit"] = limit
        return self.client.query("chatMessages/queries.list", args)

    def send(
        self,
        conversation_id: str,
        role: str,
        content: str,
        message_type: str = "text",
        card_data: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
        document_id: Optional[str] = None,
    ) -> str:
        """
        Send a chat message.

        Args:
            conversation_id: Conversation ID
            role: Message role ("user", "agent", "system")
            content: Message content
            message_type: Type of message ("text", "slash_command", "result_card", "progress", "error")
            card_data: Optional card data for result_card messages
            session_id: Optional research session ID
            document_id: Optional document ID

        Returns:
            Created message ID
        """
        args = {
            "conversationId": conversation_id,
            "role": role,
            "content": content,
            "messageType": message_type,
        }

        if card_data is not None:
            args["cardData"] = card_data
        if session_id is not None:
            args["sessionId"] = session_id
        if document_id is not None:
            args["documentId"] = document_id

        return self.client.mutation("chatMessages/mutations.insert", args)


class DocumentsAPI:
    """API methods for documents module."""

    def __init__(self, client: ConvexClient):
        self.client = client

    def list(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        List all documents.

        Args:
            limit: Maximum number of documents to return

        Returns:
            List of document objects
        """
        return self.client.query("documents/queries.list", {"limit": limit})

    def get(self, id: str) -> Optional[Dict[str, Any]]:
        """
        Get a single document by id.

        Args:
            id: Document ID

        Returns:
            Document object or None if not found
        """
        return self.client.query("documents/queries.get", {"id": id})

    def search(
        self,
        query: str,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Search documents by text.

        Args:
            query: Search query
            limit: Maximum number of results

        Returns:
            List of matching documents
        """
        return self.client.query(
            "documents/search.byText",
            {"query": query, "limit": limit},
        )

    def create(
        self,
        title: str,
        content: str,
        category: str,
        file_path: Optional[str] = None,
        file_type: Optional[str] = None,
    ) -> str:
        """
        Create a new document.

        Args:
            title: Document title
            content: Document content
            category: Document category
            file_path: Optional file path
            file_type: Optional file type

        Returns:
            Created document ID
        """
        args = {
            "title": title,
            "content": content,
            "category": category,
        }

        if file_path is not None:
            args["filePath"] = file_path
        if file_type is not None:
            args["fileType"] = file_type

        return self.client.mutation("documents/mutations.create", args)


class ResearchSessionsAPI:
    """API methods for research sessions module."""

    def __init__(self, client: ConvexClient):
        self.client = client

    def list(
        self,
        status: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        List research sessions.

        Args:
            status: Optional filter by status
            limit: Maximum number of sessions to return

        Returns:
            List of research session objects
        """
        args = {"limit": limit}
        if status is not None:
            args["status"] = status
        return self.client.query("researchSessions/queries.list", args)

    def get(self, id: str) -> Optional[Dict[str, Any]]:
        """
        Get a single research session by id.

        Args:
            id: Research session ID

        Returns:
            Research session object or None if not found
        """
        return self.client.query("researchSessions/queries.get", {"id": id})

    def create(
        self,
        query: str,
        research_type: str = "deep",
        input_type: str = "text",
        max_iterations: int = 3,
        document_id: Optional[str] = None,
    ) -> str:
        """
        Create a new research session.

        Args:
            query: Research query
            research_type: Type of research ("deep", "quick")
            input_type: Input type ("text", "url")
            max_iterations: Maximum iterations
            document_id: Optional associated document ID

        Returns:
            Created research session ID
        """
        args = {
            "query": query,
            "researchType": research_type,
            "inputType": input_type,
            "maxIterations": max_iterations,
        }

        if document_id is not None:
            args["documentId"] = document_id

        return self.client.mutation("researchSessions/mutations.create", args)


class TasksAPI:
    """API methods for tasks module."""

    def __init__(self, client: ConvexClient):
        self.client = client

    def list(
        self,
        status: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        List tasks.

        Args:
            status: Optional filter by status
            limit: Maximum number of tasks to return

        Returns:
            List of task objects
        """
        args = {"limit": limit}
        if status is not None:
            args["status"] = status
        return self.client.query("tasks/queries.list", args)

    def get(self, id: str) -> Optional[Dict[str, Any]]:
        """
        Get a single task by id.

        Args:
            id: Task ID

        Returns:
            Task object or None if not found
        """
        return self.client.query("tasks/queries.get", {"id": id})

    def create(
        self,
        task_type: str,
        conversation_id: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Create a new task.

        Args:
            task_type: Type of task
            conversation_id: Optional conversation ID
            config: Optional task configuration

        Returns:
            Created task ID
        """
        args = {"taskType": task_type}

        if conversation_id is not None:
            args["conversationId"] = conversation_id
        if config is not None:
            args["config"] = config

        return self.client.mutation("tasks/mutations.create", args)
