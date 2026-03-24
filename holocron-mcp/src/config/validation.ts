import { z } from "zod";

/**
 * Validation schemas for MCP tool inputs and outputs
 */

// Research topic input
export const ResearchTopicSchema = z.object({
  topic: z.string().min(1),
  maxIterations: z.number().int().positive().optional(),
  confidenceFilter: z.enum(["HIGH_ONLY", "HIGH_MEDIUM", "ALL"]).optional(),
});

// Simple research input
export const SimpleResearchSchema = z.object({
  topic: z.string().min(1),
});

// Document storage input
export const StoreDocumentSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Document update input
export const UpdateDocumentSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Search input
export const SearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

// Vector search input (requires pre-computed embedding)
export const SearchVectorSchema = z.object({
  embedding: z.array(z.number()),
  limit: z.number().int().positive().optional(),
});

// Session ID input
export const SessionIdSchema = z.object({
  sessionId: z.string().min(1),
});

// Document ID input
export const DocumentIdSchema = z.object({
  documentId: z.string().min(1),
});

export type ResearchTopicInput = z.infer<typeof ResearchTopicSchema>;
export type SimpleResearchInput = z.infer<typeof SimpleResearchSchema>;
export type StoreDocumentInput = z.infer<typeof StoreDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof UpdateDocumentSchema>;
export type SearchInput = z.infer<typeof SearchSchema>;
export type SessionIdInput = z.infer<typeof SessionIdSchema>;
export type DocumentIdInput = z.infer<typeof DocumentIdSchema>;

// Subscription management schemas
export const AddSubscriptionSchema = z.object({
  sourceType: z.enum(["youtube", "newsletter", "changelog", "reddit", "ebay", "whats-new"]),
  identifier: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url().optional(),
  feedUrl: z.string().url().optional(),
});

export const RemoveSubscriptionSchema = z.object({
  subscriptionId: z.string().min(1),
});

export const ListSubscriptionsSchema = z.object({
  sourceType: z
    .enum(["youtube", "newsletter", "changelog", "reddit", "ebay", "whats-new"])
    .optional(),
  autoResearchOnly: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
});

export const CheckSubscriptionsSchema = z.object({
  sourceType: z
    .enum(["youtube", "newsletter", "changelog", "reddit", "ebay", "whats-new"])
    .optional(),
});

export const GetSubscriptionContentSchema = z.object({
  subscriptionId: z.string().min(1),
  researchStatus: z.enum(["pending", "queued", "researched", "skipped"]).optional(),
  limit: z.number().int().positive().optional(),
});

export const SetSubscriptionFilterSchema = z.object({
  sourceId: z.string().optional(),
  sourceType: z.string().optional(),
  ruleName: z.string().min(1),
  ruleType: z.string().min(1),
  ruleValue: z.any(),
  weight: z.number().optional(),
});

export const GetSubscriptionFiltersSchema = z.object({
  subscriptionId: z.string().optional(),
  sourceType: z.string().optional(),
});

export type AddSubscriptionInput = z.infer<typeof AddSubscriptionSchema>;
export type RemoveSubscriptionInput = z.infer<typeof RemoveSubscriptionSchema>;
export type ListSubscriptionsInput = z.infer<typeof ListSubscriptionsSchema>;
export type CheckSubscriptionsInput = z.infer<typeof CheckSubscriptionsSchema>;
export type GetSubscriptionContentInput = z.infer<typeof GetSubscriptionContentSchema>;
export type SetSubscriptionFilterInput = z.infer<typeof SetSubscriptionFilterSchema>;
export type GetSubscriptionFiltersInput = z.infer<typeof GetSubscriptionFiltersSchema>;

// Toolbelt schemas
const SourceTypeEnum = z.enum(["github", "npm", "pypi", "website", "cargo", "go", "other"]);
const CategoryEnum = z.enum(["libraries", "cli", "framework", "service", "database", "tool"]);
const StatusEnum = z.enum(["complete", "draft", "archived"]);

export const StoreToolSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  content: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  sourceType: SourceTypeEnum,
  category: CategoryEnum,
  status: StatusEnum.optional(),
  tags: z.array(z.string()).optional(),
  useCases: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  language: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const SearchToolsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
  category: z.string().optional(),
});

export const GetToolSchema = z.object({
  toolId: z.string().min(1),
});

export const ListToolsSchema = z.object({
  limit: z.number().int().positive().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  sourceType: z.string().optional(),
});

export const UpdateToolSchema = z.object({
  toolId: z.string().min(1),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  sourceType: SourceTypeEnum.optional(),
  category: CategoryEnum.optional(),
  status: StatusEnum.optional(),
  tags: z.array(z.string()).optional(),
  useCases: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  language: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const RemoveToolSchema = z.object({
  toolId: z.string().min(1),
});

export type StoreToolInput = z.infer<typeof StoreToolSchema>;
export type SearchToolsInput = z.infer<typeof SearchToolsSchema>;
export type GetToolInput = z.infer<typeof GetToolSchema>;
export type ListToolsInput = z.infer<typeof ListToolsSchema>;
export type UpdateToolInput = z.infer<typeof UpdateToolSchema>;
export type RemoveToolInput = z.infer<typeof RemoveToolSchema>;

// Shop schemas
export const ShopProductsSchema = z.object({
  query: z.string().min(1),
  retailers: z.array(z.string()).optional(),
  condition: z.enum(["new", "used", "any"]).optional(),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
});

export const GetShopSessionSchema = z.object({
  sessionId: z.string().min(1),
});

export const GetShopListingsSchema = z.object({
  sessionId: z.string().min(1),
  limit: z.number().int().positive().optional(),
  excludeDuplicates: z.boolean().optional(),
  sortBy: z.enum(["price", "dealScore", "createdAt"]).optional(),
});

export type ShopProductsInput = z.infer<typeof ShopProductsSchema>;
export type GetShopSessionInput = z.infer<typeof GetShopSessionSchema>;
export type GetShopListingsInput = z.infer<typeof GetShopListingsSchema>;

// Document sharing schema
export const ShareDocumentSchema = z.object({
  documentId: z.string().min(1),
  isPublic: z.boolean(),
});

export type ShareDocumentInput = z.infer<typeof ShareDocumentSchema>;

// What's New schemas
export const GetWhatsNewSchema = z.object({
  forceRefresh: z.boolean().optional().describe("Force generate a new report (expensive)"),
});

export const ListWhatsNewReportsSchema = z.object({
  limit: z.number().int().positive().optional(),
});

export type GetWhatsNewInput = z.infer<typeof GetWhatsNewSchema>;
export type ListWhatsNewReportsInput = z.infer<typeof ListWhatsNewReportsSchema>;
