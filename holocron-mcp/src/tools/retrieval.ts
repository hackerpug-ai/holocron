/**
 * Document retrieval tools — delegated to platform MCP (S31-05).
 */
import type { PlatformMcpClient } from "../platform/mcp-client.ts";

export interface GetDocumentInput {
  documentId: string;
}

export interface ListDocumentsInput {
  limit?: number;
  cursor?: string;
}

export interface ListDocumentsOutput {
  documents: Array<Record<string, unknown>>;
  nextCursor: string | null;
  hasMore: boolean;
}

export async function getDocument(
  client: PlatformMcpClient,
  input: GetDocumentInput
): Promise<unknown> {
  return client.callTool("get_document", { documentId: input.documentId });
}

export async function listDocuments(
  client: PlatformMcpClient,
  input: ListDocumentsInput
): Promise<ListDocumentsOutput> {
  return client.callTool<ListDocumentsOutput>("list_documents", {
    ...(input.limit !== undefined && { limit: input.limit }),
    ...(input.cursor !== undefined && { cursor: input.cursor }),
  });
}
