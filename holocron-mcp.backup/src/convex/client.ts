import { ConvexHttpClient } from 'convex/browser';
import type { HolocronConfig } from '../config/env.js';
import type {
  ResearchSession,
  ResearchFinding,
  ConfidenceStats,
  IterationSearchResult
} from './types.js';

/**
 * Convex client for holocron research operations
 */
export class HolocronConvexClient {
  private client: ConvexHttpClient;
  private config: HolocronConfig;

  constructor(config: HolocronConfig) {
    this.config = config;
    this.client = new ConvexHttpClient(config.convexUrl);
  }

  /**
   * Start a deep research session
   * Returns immediately with session ID
   */
  async startResearch(params: {
    topic: string;
    maxIterations?: number;
    conversationId?: string;
  }): Promise<{ sessionId: string; conversationId: string; status: string }> {
    const result = await this.client.action('research/index:startDeepResearch' as any, {
      topic: params.topic,
      maxIterations: params.maxIterations ?? 5,
      conversationId: params.conversationId,
    });

    return result as { sessionId: string; conversationId: string; status: string };
  }

  /**
   * Start a simple research session
   * Completes synchronously (no polling needed)
   */
  async startSimpleResearch(params: {
    topic: string;
    conversationId?: string;
  }): Promise<{
    sessionId: string;
    conversationId: string;
    status: 'completed' | 'error';
    summary: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    durationMs: number;
  }> {
    const result = await this.client.action('research/index:startSimpleResearch' as any, {
      topic: params.topic,
      conversationId: params.conversationId,
    });

    return result as any;
  }

  /**
   * Get research session by ID
   * Returns null if not found
   */
  async getSession(sessionId: string): Promise<ResearchSession | null> {
    const result = await this.client.query('research/index:getDeepResearchSession' as any, {
      sessionId,
    });

    return result as ResearchSession | null;
  }

  /**
   * Get findings filtered by confidence level
   */
  async getFindings(params: {
    sessionId: string;
    confidenceFilter?: 'HIGH_ONLY' | 'HIGH_MEDIUM' | 'ALL';
  }): Promise<ResearchFinding[]> {
    const result = await this.client.query('research/index:getFindingsByConfidence' as any, {
      sessionId: params.sessionId,
      confidenceFilter: params.confidenceFilter ?? 'ALL',
    });

    return result as ResearchFinding[];
  }

  /**
   * Get session confidence summary
   */
  async getConfidenceSummary(sessionId: string): Promise<{
    sessionId: string;
    topic: string;
    status: string;
    stats: ConfidenceStats;
    distribution: {
      highPercent: number;
      mediumPercent: number;
      lowPercent: number;
    };
    overallLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    meetsMultiSourceRequirement: boolean;
  } | null> {
    const result = await this.client.query('research/index:getSessionConfidenceSummary' as any, {
      sessionId,
    });

    return result as any;
  }

  /**
   * Vector search iterations
   */
  async vectorSearchIterations(params: {
    embedding: number[];
    limit?: number;
    sessionId?: string;
  }): Promise<IterationSearchResult[]> {
    const result = await this.client.query('research/index:vectorSearchIterations' as any, {
      embedding: params.embedding,
      limit: params.limit ?? 10,
      sessionId: params.sessionId,
    });

    return result as IterationSearchResult[];
  }

  /**
   * Full-text search iterations
   */
  async fullTextSearchIterations(params: {
    query: string;
    limit?: number;
    sessionId?: string;
  }): Promise<IterationSearchResult[]> {
    const result = await this.client.query('research/index:fullTextSearchIterations' as any, {
      query: params.query,
      limit: params.limit ?? 10,
      sessionId: params.sessionId,
    });

    return result as IterationSearchResult[];
  }

  /**
   * Generate embedding for search query
   * Uses OpenAI text-embedding-3-small model
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // This would need to be an action in Convex that uses OpenAI
    // For now, we'll use a simple implementation that calls OpenAI directly
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding failed: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.data[0].embedding as number[];
  }
}

/**
 * Create a new Holocron Convex client
 */
export function createConvexClient(config: HolocronConfig): HolocronConvexClient {
  return new HolocronConvexClient(config);
}
