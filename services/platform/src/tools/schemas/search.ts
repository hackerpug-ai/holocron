import { z } from 'zod';
import { SearchResultItemSchema, SearchResultsOutputSchema } from './common.ts';

export const searchFtsInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

export const searchFtsOutputSchema = SearchResultsOutputSchema;

export const searchVectorInputSchema = z.object({
  embedding: z.array(z.number()),
  limit: z.number().int().positive().optional(),
});

export const searchVectorOutputSchema = SearchResultsOutputSchema;

export const hybridSearchInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

export const hybridSearchOutputSchema = z.object({
  results: z.array(SearchResultItemSchema),
  totalResults: z.number().int(),
  searchMethod: z.string().optional(),
});
