/**
 * R-01 spike — durable cross-process suspend/resume against Mastra 1.50.1.
 *
 * Proves createRun({ runId }) rehydrates from PostgresStore after SIGKILL.
 */
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { createSql } from '../../db/client.ts';

export const RESUME_SPIKE_WORKFLOW_ID = 'resume-spike';
export const RESUME_SPIKE_SIDE_EFFECT_TABLE = 'research_spike_side_effects';

const inputSchema = z.object({
  note: z.string().min(1),
});

const sideEffectOutputSchema = z.object({
  runId: z.string().min(1),
  note: z.string().min(1),
  inserted: z.literal(true),
});

const holdOutputSchema = z.object({
  runId: z.string().min(1),
  note: z.string().min(1),
  resumed: z.literal(true),
});

const finishOutputSchema = z.object({
  done: z.literal(true),
  runId: z.string().min(1),
});

const holdResumeSchema = z.object({
  approved: z.boolean(),
});

const holdSuspendSchema = z.object({
  reason: z.string().min(1),
});

/** Step 1 — exactly-once side effect keyed by run_id (PK). */
export const sideEffectStep = createStep({
  id: 'sideEffect',
  inputSchema,
  outputSchema: sideEffectOutputSchema,
  execute: async ({ inputData, runId }) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for resume spike sideEffect');
    }
    if (!databaseUrl.includes('holocron_nonprod')) {
      throw new Error(`DATABASE_URL must target holocron_nonprod, got: ${databaseUrl}`);
    }

    const sql = createSql(databaseUrl, { max: 1 });
    try {
      await sql`
        INSERT INTO research_spike_side_effects (run_id, note)
        VALUES (${runId}, ${inputData.note})
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }

    return {
      runId,
      note: inputData.note,
      inserted: true as const,
    };
  },
});

/** Step 2 — suspend until resumed with resumeData across process boundary. */
export const holdStep = createStep({
  id: 'hold',
  inputSchema: sideEffectOutputSchema,
  outputSchema: holdOutputSchema,
  resumeSchema: holdResumeSchema,
  suspendSchema: holdSuspendSchema,
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) {
      return await suspend({ reason: 'cross-process-hold' });
    }
    return {
      runId: inputData.runId,
      note: inputData.note,
      resumed: true as const,
    };
  },
});

/** Step 3 — terminal success marker. */
export const finishStep = createStep({
  id: 'finish',
  inputSchema: holdOutputSchema,
  outputSchema: finishOutputSchema,
  execute: async ({ inputData, runId }) => ({
    done: true as const,
    runId: inputData.runId || runId,
  }),
});

export const resumeSpike = createWorkflow({
  id: RESUME_SPIKE_WORKFLOW_ID,
  inputSchema,
  outputSchema: finishOutputSchema,
})
  .then(sideEffectStep)
  .then(holdStep)
  .then(finishStep)
  .commit();
