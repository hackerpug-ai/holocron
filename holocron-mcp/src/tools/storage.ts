/**
 * Document storage tools — delegated to platform MCP (S31-05).
 */
import type { PlatformMcpClient } from "../platform/mcp-client.ts";

export interface StoreDocumentInput {
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface StoreDocumentOutput {
  documentId: string;
  title: string;
  embeddingStatus?: string;
  embeddingDimensions?: number;
}

export interface UpdateDocumentInput {
  documentId: string;
  title?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateDocumentOutput {
  documentId: string;
  updated: boolean;
  embeddingStatus?: string;
  embeddingRegenerated?: boolean;
  embeddingDimensions?: number;
}

export interface ShareDocumentInput {
  documentId: string;
  isPublic: boolean;
}

export interface ShareDocumentOutput {
  documentId: string;
  isPublic: boolean;
  shareToken?: string;
  shareUrl?: string;
}

export async function storeDocument(
  client: PlatformMcpClient,
  input: StoreDocumentInput
): Promise<StoreDocumentOutput> {
  return client.callTool<StoreDocumentOutput>("store_document", {
    title: input.title,
    content: input.content,
    ...(input.metadata !== undefined && { metadata: input.metadata }),
  });
}

export async function updateDocument(
  client: PlatformMcpClient,
  input: UpdateDocumentInput
): Promise<UpdateDocumentOutput> {
  return client.callTool<UpdateDocumentOutput>("update_document", {
    documentId: input.documentId,
    ...(input.title !== undefined && { title: input.title }),
    ...(input.content !== undefined && { content: input.content }),
    ...(input.metadata !== undefined && { metadata: input.metadata }),
  });
}

export async function shareDocument(
  client: PlatformMcpClient,
  input: ShareDocumentInput
): Promise<ShareDocumentOutput> {
  return client.callTool<ShareDocumentOutput>("share_document", {
    documentId: input.documentId,
    isPublic: input.isPublic,
  });
}
