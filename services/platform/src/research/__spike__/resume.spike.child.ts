/**
 * R-01 child process — starts resumeSpike, suspends at hold, prints barrier, waits for SIGKILL.
 *
 * Env:
 *   SPIKE_RUN_ID   — durable run id (required)
 *   SPIKE_NOTE     — side-effect note (optional)
 *   DATABASE_URL   — must be holocron_nonprod
 *   SPIKE_READY_FILE — optional path written after SUSPENDED line
 */
import '../../config/bootstrap-secrets.ts';

import { writeFileSync } from 'node:fs';
import { Mastra } from '@mastra/core/mastra';
import { createStorage } from '../../mastra.ts';
import { resumeSpike } from './resume.spike.ts';

async function main(): Promise<void> {
  const runId = process.env.SPIKE_RUN_ID;
  if (!runId) {
    throw new Error('SPIKE_RUN_ID is required');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !databaseUrl.includes('holocron_nonprod')) {
    throw new Error(`DATABASE_URL must target holocron_nonprod, got: ${databaseUrl ?? '(unset)'}`);
  }

  const note = process.env.SPIKE_NOTE ?? `spike-note-${runId}`;
  const readyFile = process.env.SPIKE_READY_FILE;

  const mastra = new Mastra({
    storage: createStorage(),
    workflows: { resumeSpike },
  });

  try {
    const wf = mastra.getWorkflow('resumeSpike');
    const run = await wf.createRun({ runId });
    const result = await run.start({ inputData: { note } });

    if (result.status !== 'suspended') {
      throw new Error(
        `expected suspended after start, got status=${result.status} runId=${run.runId}`
      );
    }

    // Barrier for the parent integration test (exactly one stdout line).
    process.stdout.write(`SUSPENDED ${run.runId}\n`);
    if (readyFile) {
      writeFileSync(readyFile, `SUSPENDED ${run.runId}\n`, 'utf8');
    }

    // Stay alive until parent SIGKILLs — do not exit cleanly.
    await new Promise<never>(() => {});
  } finally {
    await Promise.race([mastra.shutdown(), new Promise((r) => setTimeout(r, 5_000))]);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`resume.spike.child failed: ${message}\n`);
  process.exit(1);
});
