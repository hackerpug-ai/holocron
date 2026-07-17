/**
 * Composed library harness (HUMAN-TESTING-GATE-VERIFICATION.md sanctioned) — NOT a test runner.
 *
 * Drives the REAL production DLQ module (services/platform/src/queue/dlq.ts) against REAL Postgres
 * for SPRINT.md Human Testing Gate step 6:
 *   force a job to fail past retries → it lands in the dead-letter path, not silently dropped.
 *
 * The STEP is recorded wiring_gap (production-invocation-not-documented) — no `holo` operator CLI
 * exists for seeding poison / driving retries; only the library API. See GATE-RESULTS.md.
 *
 * Usage: bun drive-dlq.ts
 */
import {
  seedPoisonJob,
  runUntilTerminal,
  resetDlq,
  getJob,
} from '../../../../../../../services/platform/src/queue/dlq';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const KEY = 'gate-poison-1';
const MAX_ATTEMPTS = 3;

await resetDlq(DATABASE_URL);

const seeded = await seedPoisonJob({ key: KEY, maxAttempts: MAX_ATTEMPTS, databaseUrl: DATABASE_URL });
const terminal = await runUntilTerminal({ key: KEY, databaseUrl: DATABASE_URL });
const jobAfter = await getJob(KEY, DATABASE_URL);

const dead_lettered = terminal.status === 'dead_letter' && terminal.dlq_count >= 1;

const payload = {
  driver: 'drive-dlq',
  database_url: DATABASE_URL,
  seeded,
  terminal,
  job_after: jobAfter,
  dead_lettered,
  contract: 'status === "dead_letter" AND dlq_count >= 1 (never silently dropped)',
};
console.log(JSON.stringify(payload, null, 2));
process.exit(dead_lettered ? 0 : 1);
