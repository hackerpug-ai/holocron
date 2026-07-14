/**
 * Cell 3 — Workflow
 *
 * Creates a 2-step .then() workflow, .commit(), createRun(),
 * persists snapshot to Postgres via @mastra/pg, narrows on
 * result.status === 'success'.
 */
import type { Mastra } from '@mastra/core/mastra';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

// ── step 1: transform input ──────────────────────────────────
const step1Input = z.object({
  topic: z.string().min(1),
});

const step1Output = z.object({
  topic: z.string(),
  upper: z.string(),
});

const transformStep = createStep({
  id: 'transform-step',
  inputSchema: step1Input,
  outputSchema: step1Output,
  execute: async ({ inputData }) => {
    return {
      topic: inputData.topic,
      upper: inputData.topic.toUpperCase(),
    };
  },
});

// ── step 2: append suffix ────────────────────────────────────
const step2Output = z.object({
  topic: z.string(),
  upper: z.string(),
  result: z.string(),
});

const finalizeStep = createStep({
  id: 'finalize-step',
  inputSchema: step1Output,
  outputSchema: step2Output,
  execute: async ({ inputData }) => {
    return {
      topic: inputData.topic,
      upper: inputData.upper,
      result: `${inputData.upper} ✓`,
    };
  },
});

// ── workflow ─────────────────────────────────────────────────
export const compatWorkflow = createWorkflow({
  id: 'compat-workflow',
  inputSchema: step1Input,
  outputSchema: step2Output,
})
  .then(transformStep)
  .then(finalizeStep)
  .commit();

export interface WorkflowCellResult {
  ok: boolean;
  status?: string;
  result?: string;
  error?: string;
}

export async function runWorkflowCell(mastra: Mastra): Promise<WorkflowCellResult> {
  try {
    const wf = mastra.getWorkflow('compatWorkflow');
    const run = await wf.createRun();

    const result = await run.start({
      inputData: { topic: 'compatibility' },
    });

    // Narrow on the canonical 4-value status union
    if (result.status === 'success') {
      const out = result.result;
      return {
        ok: true,
        status: 'success',
        result: out?.result ?? '',
      };
    }
    return {
      ok: false,
      status: result.status,
      error: `workflow ended with status ${result.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
