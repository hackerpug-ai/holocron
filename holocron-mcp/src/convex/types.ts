/**
 * Convex type definitions for Holocron MCP server
 */

export type ResearchSession = {
  _id: string
  _creationTime: number
  topic: string
  maxIterations: number
  currentIteration: number
  status: 'running' | 'completed' | 'failed'
  findings: unknown[]
  confidenceStats: {
    high: number
    medium: number
    low: number
  }
}

export type Document = {
  _id: string
  _creationTime: number
  title: string
  content: string
  metadata: Record<string, unknown>
  embeddingId?: string
}

export type SearchResult = {
  _id: string
  title: string
  score: number
  content: string
}

export type IterationFinding = {
  topic: string
  summary: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  sources: string[]
}
