/**
 * Migration: Re-embed all documents with 1024-dimensional vectors
 *
 * This script regenerates all document embeddings using Cohere's embed-english-v3.0 model,
 * which produces 1024-dimensional vectors (matches our Convex schema).
 *
 * Run via: npx convex run migrations/reembed_documents_1024:reembedAllDocuments
 */

import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { embed } from "ai";
import { cohereEmbedding } from "../lib/ai/embeddings_provider";

export const reembedAllDocuments = action({
  args: {},
  handler: async (ctx): Promise<{ total: number; success: number; errors: number; errorDetails: string[] }> => {
    // Fetch all documents with embeddings
    const documents: any[] = await ctx.runQuery(api.documents.queries.list, {});

    // Filter to only documents with embeddings
    const documentsWithEmbeddings: any[] = documents.filter((doc: any) => doc.embedding !== undefined);

    console.log(`Found ${documentsWithEmbeddings.length} documents with embeddings to re-embed`);

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process in batches of 10 to avoid timeout
    const batchSize = 10;
    for (let i = 0; i < documentsWithEmbeddings.length; i += batchSize) {
      const batch = documentsWithEmbeddings.slice(i, i + batchSize);

      for (const doc of batch) {
        try {
          // Generate new embedding using Cohere (1024 dimensions)
          const { embedding } = await embed({
            model: cohereEmbedding,
            value: doc.content,
          });

          // Update document with new embedding
          await ctx.runMutation(api.documents.mutations.update, {
            id: doc._id,
            embedding,
          });

          successCount++;
          console.log(`Re-embedded: ${doc.title} (${embedding.length} dimensions)`);
        } catch (error) {
          errorCount++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`${doc.title}: ${errorMsg}`);
          console.error(`Failed to re-embed ${doc.title}:`, errorMsg);
        }
      }
    }

    console.log(`
Migration complete:
  Success: ${successCount}
  Errors: ${errorCount}
  Total: ${documentsWithEmbeddings.length}
    `);

    if (errors.length > 0) {
      console.error("Errors encountered:");
      errors.forEach((err) => console.error(`  - ${err}`));
    }

    return {
      total: documentsWithEmbeddings.length,
      success: successCount,
      errors: errorCount,
      errorDetails: errors,
    };
  },
});
