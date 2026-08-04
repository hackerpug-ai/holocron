/**
 * Child process helper for REDHAT-FIX-S29-R3-H02 already-running worker proof.
 *
 * Usage:
 *   bun sprint29-r3-h02-worker-child.ts begin   <key> <jobName> <databaseUrl>
 *   bun sprint29-r3-h02-worker-child.ts dispatch <key> <jobName> <databaseUrl>
 *
 * Phase begin:   commit outbox intent (must run with HOLO_MIGRATION_READ_ONLY unset/0)
 * Phase dispatch: apply irreversible effect via applyIrreversibleJobEffect
 *                 (must run with HOLO_MIGRATION_READ_ONLY=1 to prove re-check)
 */
import { beginEffect } from '../../src/queue/durable-effect.ts';
import { applyIrreversibleJobEffect } from '../../src/queue/jobs-runner.ts';

const [phase, key, jobName, databaseUrl] = process.argv.slice(2);

if (!phase || !key || !jobName || !databaseUrl) {
  console.error('usage: worker-child.ts <begin|dispatch> <key> <jobName> <databaseUrl>');
  process.exit(2);
}

const workerPhase = phase;
const workerKey = key;
const workerJobName = jobName;
const workerDatabaseUrl = databaseUrl;

async function main(): Promise<void> {
  if (workerPhase === 'begin') {
    const result = await beginEffect({
      key: workerKey,
      name: workerJobName,
      payload: { child: true, phase: 'begin' },
      databaseUrl: workerDatabaseUrl,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (workerPhase === 'dispatch') {
    const result = await applyIrreversibleJobEffect({
      key: workerKey,
      jobName: workerJobName,
      databaseUrl: workerDatabaseUrl,
    });
    const blocked =
      result.ok === false && String(result.error ?? '').startsWith('migration_read_only:');
    process.stdout.write(
      `${JSON.stringify({
        ok: result.ok,
        error: result.error,
        blocked,
        effect_id: result.effect_id,
      })}\n`
    );
    return;
  }

  console.error(`unknown phase: ${phase}`);
  process.exit(2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
