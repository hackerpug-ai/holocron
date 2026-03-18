/**
 * Convex type definitions for Holocron MCP server
 */

export type ResearchSession = {
  _id: string;
  _creationTime: number;
  topic: string;
  maxIterations: number;
  currentIteration: number;
  status: "running" | "completed" | "failed";
  findings: unknown[];
  documentId?: string;
  confidenceStats: {
    high: number;
    medium: number;
    low: number;
  };
};

export type Document = {
  _id: string;
  _creationTime: number;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  embeddingId?: string;
};

export type SearchResult = {
  _id: string;
  title: string;
  score: number;
  content: string;
};

export type IterationFinding = {
  topic: string;
  summary: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  sources: string[];
};

// Shop types
export type ShopSession = {
  _id: string;
  _creationTime: number;
  conversationId?: string;
  query: string;
  condition?: string;
  priceMin?: number;
  priceMax?: number;
  retailers?: string[];
  status: "pending" | "searching" | "completed" | "failed";
  totalListings?: number;
  bestDealId?: string;
  errorReason?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
};

export type ShopListing = {
  _id: string;
  _creationTime: number;
  sessionId: string;
  title: string;
  price: number; // In cents
  originalPrice?: number;
  currency: string;
  condition: string;
  retailer: string;
  seller?: string;
  sellerRating?: number;
  url: string;
  imageUrl?: string;
  inStock?: boolean;
  productHash: string;
  isDuplicate: boolean;
  dealScore?: number;
  createdAt: number;
};
