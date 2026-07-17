/**
 * Composed library harness (HUMAN-TESTING-GATE-VERIFICATION.md sanctioned) — NOT a test runner.
 *
 * Drives the REAL production durable-effect module
 * (services/platform/src/queue/durable-effect.ts) against REAL Postgres for each kill-9
 * boundary named on argv. For each boundary it:
 *   1. runs the crash pass at that boundary (real transaction rollback simulating SIGKILL), then
 *   2. runs the recovery pass (boundary 'none') with the SAME key — the re-run an operator would do,
 *   3. audits the final state and asserts exactly-one (1 effect, 1 outbox, 1 inbox, fencing token).
 *
 * This is the functional proof for SPRINT.md Human Testing Gate steps 2 + 3. The STEP is recorded
 * wiring_gap (production-invocation-not-documented) because no `holo` operator CLI exists to do
 * this — only the library API. See GATE-RESULTS.md.
 *
 * Usage: bun drive-boundaries.ts <boundary> [<boundary> ...]
 *   boundary ∈ before-commit | after-commit-before-enqueue | after-dispatch-before-ack
 */
import { runDurableEffectBoundary, auditDurableEffect } from '../../../../../../../services/platform/src/queue/durable-effect';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const VALID = new Set([
  'before-commit',
  'after-commit-before-enqueue',
  'after-dispatch-before-ack',
]);

const requested = process.argv.slice(2);
if (requested.length === 0) {
  console.error('usage: bun drive-boundaries.ts <boundary> [<boundary> ...]');
  process.exit(2);
}
for (const b of requested) {
  if (!VALID.has(b)) {
    console.error(`unknown boundary: ${b} (valid: ${[...VALID].join(', ')})`);
    process.exit(2);
  }
}

const results: Array<{
  boundary: string;
  key: string;
  crash_pass: { effect_count: number; outbox_count: number; inbox_dedupe_count: number; fencing_token: string | null };
  recovery_pass: { effect_count: number; outbox_count: number; inbox_dedupe_count: number; fencing_token: string | null };
  exactly_one: boolean;
}> = [];

let allOk = true;

for (const boundary of requested) {
  const key = `gate-kill9-${boundary}`;
  // 1. crash pass (boundary) — simulates kill-9 at the named point; resets key first.
  const crash = await runDurableEffectBoundary({
    key,
    payload: { n: 1 },
    boundary: boundary as 'before-commit',
    databaseUrl: DATABASE_URL,
  });
  // 2. recovery pass ('none') — the re-run with the same key; must not double-apply.
  const recovery = await runDurableEffectBoundary({
    key,
    payload: { n: 1 },
    boundary: 'none',
    databaseUrl: DATABASE_URL,
  });
  // 3. independent audit (same path holo queue:audit uses).
  const audit = await auditDurableEffect(key, DATABASE_URL);
  const exactly_one =
    audit.effect_count === 1 &&
    audit.outbox_count === 1 &&
    audit.inbox_dedupe_count === 1 &&
    Boolean(audit.fencing_token);
  if (!exactly_one) allOk = false;
  results.push({
    boundary,
    key,
    crash_pass: {
      effect_count: crash.effect_count,
      outbox_count: crash.outbox_count,
      inbox_dedupe_count: crash.inbox_dedupe_count,
      fencing_token: crash.fencing_token,
    },
    recovery_pass: {
      effect_count: recovery.effect_count,
      outbox_count: recovery.outbox_count,
      inbox_dedupe_count: recovery.inbox_dedupe_count,
      fencing_token: recovery.fencing_token,
    },
    exactly_one,
  });
}

const payload = {
  driver: 'drive-boundaries',
  database_url: DATABASE_URL,
  boundaries_requested: requested,
  final_audit_contract: 'effect_count===1 AND outbox_count===1 AND inbox_dedupe_count===1 AND fencing_token present, for EACH boundary key',
  all_exactly_one: allOk,
  results,
};
console.log(JSON.stringify(payload, null, 2));
process.exit(allOk ? 0 : 1);
