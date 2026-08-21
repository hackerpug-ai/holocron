import { z } from 'zod';
import { JsonRecordSchema, NullableRecordSchema } from './common.ts';

export const storeDocumentInputSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  metadata: JsonRecordSchema.optional(),
});

export const storeDocumentOutputSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  embeddingStatus: z.string().optional(),
  embeddingDimensions: z.number().int().optional(),
});

export const updateDocumentInputSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  metadata: JsonRecordSchema.optional(),
});

export const updateDocumentOutputSchema = z.object({
  documentId: z.string(),
  updated: z.boolean(),
  embeddingStatus: z.string().optional(),
  embeddingRegenerated: z.boolean().optional(),
  embeddingDimensions: z.number().int().optional(),
});

export const shareDocumentInputSchema = z
  .object({
    documentId: z.string().min(1),
    /** @deprecated Use unshare_document. true is ignored; false is rejected. */
    isPublic: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.isPublic === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'INVALID_ARGUMENT: revoke a public link with unshare_document',
        path: ['isPublic'],
      });
    }
  });

export const shareDocumentOutputSchema = z.object({
  documentId: z.string(),
  isPublic: z.literal(true),
  shareToken: z.string().min(1),
  shareUrl: z.string().url(),
});

export const unshareDocumentInputSchema = z.object({
  documentId: z.string().min(1),
});

export const unshareDocumentOutputSchema = z.object({
  documentId: z.string(),
  isPublic: z.literal(false),
});

export const getDocumentInputSchema = z.object({
  documentId: z.string().min(1),
});

export const getDocumentOutputSchema = NullableRecordSchema;

export const listDocumentsInputSchema = z.object({
  limit: z.number().int().positive().optional(),
  cursor: z.string().optional(),
});

export const listDocumentsOutputSchema = z.object({
  documents: z.array(z.record(z.string(), z.unknown())),
  nextCursor: z.string().nullable().optional(),
  hasMore: z.boolean().optional(),
});
