import { z } from 'zod';
import { SourceTypeEnum } from './common.ts';

export const addSubscriptionInputSchema = z.object({
  sourceType: SourceTypeEnum,
  identifier: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url().optional(),
  feedUrl: z.string().url().optional(),
});

export const addSubscriptionOutputSchema = z.object({
  subscriptionId: z.string(),
  sourceType: z.string(),
  identifier: z.string(),
  name: z.string(),
  createdAt: z.number().optional(),
});

export const removeSubscriptionInputSchema = z.object({
  subscriptionId: z.string().min(1),
});

export const removeSubscriptionOutputSchema = z.object({
  deleted: z.boolean(),
  subscription: z.record(z.string(), z.unknown()).optional(),
});

export const listSubscriptionsInputSchema = z.object({
  sourceType: SourceTypeEnum.optional(),
  autoResearchOnly: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
});

export const listSubscriptionsOutputSchema = z.object({
  subscriptions: z.array(z.record(z.string(), z.unknown())),
});

export const checkSubscriptionsInputSchema = z.object({
  sourceType: SourceTypeEnum.optional(),
});

export const checkSubscriptionsOutputSchema = z.object({
  sourcesChecked: z.number().int(),
  totalFetched: z.number().int(),
  totalQueued: z.number().int(),
  errors: z.array(z.string()).optional(),
});

export const getSubscriptionContentInputSchema = z.object({
  subscriptionId: z.string().min(1),
  researchStatus: z.enum(['pending', 'queued', 'researched', 'skipped']).optional(),
  limit: z.number().int().positive().optional(),
});

export const getSubscriptionContentOutputSchema = z.object({
  content: z.array(z.record(z.string(), z.unknown())),
});

export const setSubscriptionFilterInputSchema = z.object({
  sourceId: z.string().optional(),
  sourceType: z.string().optional(),
  ruleName: z.string().min(1),
  ruleType: z.string().min(1),
  ruleValue: z.unknown(),
  weight: z.number().optional(),
});

export const setSubscriptionFilterOutputSchema = z.object({
  filterId: z.string(),
  ruleName: z.string(),
  ruleType: z.string(),
  ruleValue: z.unknown(),
  weight: z.number().optional(),
});

export const getSubscriptionFiltersInputSchema = z.object({
  subscriptionId: z.string().optional(),
  sourceType: z.string().optional(),
});

export const getSubscriptionFiltersOutputSchema = z.object({
  filters: z.array(z.record(z.string(), z.unknown())),
});
