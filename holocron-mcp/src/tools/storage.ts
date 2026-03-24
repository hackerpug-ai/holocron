/**
 * Document storage tools for Holocron MCP
 * Implements store_document and update_document with automatic embedding generation
 */

import type { HolocronConvexClient } from "../convex/client.ts";

/**
 * Store a new document with automatic embedding generation
 */
export interface StoreDocumentInput {
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface StoreDocumentOutput {
  documentId: string;
  title: string;
  embeddingStatus: "pending" | "completed" | "failed";
  embeddingDimensions?: number;
}

export async function storeDocument(
  client: HolocronConvexClient,
  input: StoreDocumentInput
): Promise<StoreDocumentOutput> {
  // Map metadata to Convex document schema
  const metadata = input.metadata ?? {};
  const category = (metadata.category as string) ?? "general";
  const date = (metadata.date as string) ?? new Date().toISOString().split("T")[0];
  const researchType = metadata.researchType as string;
  const status = metadata.status as string;

  const result = await client.action<{
    documentId: string;
    embeddingDimensions: number;
    embeddingStatus: "completed";
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("documents/storage:createWithEmbedding" as any, {
    title: input.title,
    content: input.content,
    category,
    date,
    ...(researchType && { researchType }),
    ...(status && { status }),
  });

  return {
    documentId: result.documentId,
    title: input.title,
    embeddingStatus: result.embeddingStatus,
    embeddingDimensions: result.embeddingDimensions,
  };
}

/**
 * Update an existing document with automatic embedding regeneration
 */
export interface UpdateDocumentInput {
  documentId: string;
  title?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateDocumentOutput {
  documentId: string;
  updated: boolean;
  embeddingStatus: "pending" | "completed" | "failed";
  embeddingRegenerated?: boolean;
  embeddingDimensions?: number;
}

export async function updateDocument(
  client: HolocronConvexClient,
  input: UpdateDocumentInput
): Promise<UpdateDocumentOutput> {
  // Map metadata to Convex document schema
  const metadata = input.metadata ?? {};
  const category = metadata.category as string;
  const date = metadata.date as string;
  const researchType = metadata.researchType as string;
  const status = metadata.status as string;

  const result = await client.action<{
    documentId: string;
    updated: boolean;
    embeddingRegenerated: boolean;
    embeddingDimensions?: number;
    embeddingStatus: "completed";
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("documents/storage:updateWithEmbedding" as any, {
    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    id: input.documentId as any,
    ...(input.title && { title: input.title }),
    ...(input.content && { content: input.content }),
    ...(category && { category }),
    ...(date && { date }),
    ...(researchType && { researchType }),
    ...(status && { status }),
  });

  return {
    documentId: result.documentId,
    updated: result.updated,
    embeddingRegenerated: result.embeddingRegenerated,
    embeddingDimensions: result.embeddingDimensions,
    embeddingStatus: result.embeddingStatus,
  };
}

/**
 * Publish or unpublish a document for public sharing via URL
 */
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

export async function shareDocument(
  client: HolocronConvexClient,
  input: ShareDocumentInput
): Promise<ShareDocumentOutput> {
  if (input.isPublic) {
    const result = await client.mutation<{
      shareToken: string;
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
    }>("documents/mutations:publishDocument" as any, {
      // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
      id: input.documentId as any,
    });

    const siteUrl = process.env.CONVEX_SITE_URL || process.env.HOLOCRON_SITE_URL || "";
    const shareUrl = siteUrl ? `${siteUrl}/article/${result.shareToken}` : undefined;

    return {
      documentId: input.documentId,
      isPublic: true,
      shareToken: result.shareToken,
      shareUrl,
    };
  }

  await client.mutation<{
    shareToken?: string;
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("documents/mutations:unpublishDocument" as any, {
    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    id: input.documentId as any,
  });

  return {
    documentId: input.documentId,
    isPublic: false,
  };
}
