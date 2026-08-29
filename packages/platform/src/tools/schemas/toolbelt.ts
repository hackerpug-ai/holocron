import { z } from 'zod';
import {
  JsonRecordSchema,
  NullableRecordSchema,
  ToolCategoryEnum,
  ToolSourceTypeEnum,
  ToolStatusEnum,
} from './common.ts';

export const storeToolInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  content: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  sourceType: ToolSourceTypeEnum,
  category: ToolCategoryEnum,
  status: ToolStatusEnum.optional(),
  tags: z.array(z.string()).optional(),
  useCases: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  language: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  metadata: JsonRecordSchema.optional(),
});

export const storeToolOutputSchema = z.object({
  toolId: z.string(),
  title: z.string(),
  embeddingStatus: z.string().optional(),
  embeddingDimensions: z.number().int().optional(),
});

export const searchToolsInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
  category: z.string().optional(),
});

export const searchToolsOutputSchema = z.object({
  results: z.array(z.record(z.string(), z.unknown())),
  totalResults: z.number().int(),
  searchMethod: z.string().optional(),
});

export const getToolInputSchema = z.object({
  toolId: z.string().min(1),
});

export const getToolOutputSchema = NullableRecordSchema;

export const listToolsInputSchema = z.object({
  limit: z.number().int().positive().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  sourceType: z.string().optional(),
});

export const listToolsOutputSchema = z.object({
  tools: z.array(z.record(z.string(), z.unknown())),
  total: z.number().int().optional(),
});

export const updateToolInputSchema = z.object({
  toolId: z.string().min(1),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  sourceType: ToolSourceTypeEnum.optional(),
  category: ToolCategoryEnum.optional(),
  status: ToolStatusEnum.optional(),
  tags: z.array(z.string()).optional(),
  useCases: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  language: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  metadata: JsonRecordSchema.optional(),
});

export const updateToolOutputSchema = z.object({
  toolId: z.string(),
  updated: z.boolean(),
  embeddingStatus: z.string().optional(),
  embeddingRegenerated: z.boolean().optional(),
  embeddingDimensions: z.number().int().optional(),
});

export const removeToolInputSchema = z.object({
  toolId: z.string().min(1),
});

export const removeToolOutputSchema = z.object({
  deleted: z.boolean(),
  toolId: z.string(),
});
