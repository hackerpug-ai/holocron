/**
 * Cycle-free Mastra handle for research workflows.
 *
 * index.ts → registry → executor → kickoff MUST NOT import createMastra from
 * index.ts (that cycle would evaluate bun serve). This module registers only
 * researchDepth / researchBreadth and is safe to import from kickoff.
 */
import { Mastra } from '@mastra/core/mastra';
import { PostgresStore } from '@mastra/pg';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { createObservability } from '../mastra.ts';
import { researchBreadthWorkflow } from './workflow/research-breadth.ts';
import { researchDepthWorkflow } from './workflow/research-depth.ts';

let instance: Mastra | null = null;

/** Bind the process-wide Mastra (called from createMastra in index.ts). */
export function setResearchMastra(mastra: Mastra): void {
  instance = mastra;
}

/**
 * Return the process Mastra, creating a research-only instance when MCP tools
 * run outside the HTTP composition root (vitest / executor-only).
 */
export function getResearchMastra(): Mastra {
  if (instance) return instance;
  const connectionString = resolveHolocronNonprodDatabaseUrl({
    context: 'research mastra',
  });
  instance = new Mastra({
    storage: new PostgresStore({
      id: 'research-storage',
      connectionString,
    }),
    observability: createObservability(),
    agents: {},
    workflows: {
      researchDepth: researchDepthWorkflow,
      researchBreadth: researchBreadthWorkflow,
    },
  });
  return instance;
}
