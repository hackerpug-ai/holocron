import { z } from 'zod'

/**
 * Validation schemas for MCP tool inputs and outputs
 */

// Research topic input
export const ResearchTopicSchema = z.object({
  topic: z.string().min(1),
  maxIterations: z.number().int().positive().optional(),
  confidenceFilter: z.enum(['HIGH_ONLY', 'HIGH_MEDIUM', 'ALL']).optional(),
})

// Simple research input
export const SimpleResearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
})

// Document storage input
export const StoreDocumentSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

// Document update input
export const UpdateDocumentSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

// Search input
export const SearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
})

// Session ID input
export const SessionIdSchema = z.object({
  sessionId: z.string().min(1),
})

// Document ID input
export const DocumentIdSchema = z.object({
  documentId: z.string().min(1),
})

export type ResearchTopicInput = z.infer<typeof ResearchTopicSchema>
export type SimpleResearchInput = z.infer<typeof SimpleResearchSchema>
export type StoreDocumentInput = z.infer<typeof StoreDocumentSchema>
export type UpdateDocumentInput = z.infer<typeof UpdateDocumentSchema>
export type SearchInput = z.infer<typeof SearchSchema>
export type SessionIdInput = z.infer<typeof SessionIdSchema>
export type DocumentIdInput = z.infer<typeof DocumentIdSchema>
