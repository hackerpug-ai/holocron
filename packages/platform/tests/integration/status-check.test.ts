/**
 * AC-2 — status CHECK rejects invalid / accepts valid (real Postgres).
 *
 * GREEN: probeStatusCheck enforces in-progress reject + in_progress accept.
 * NEGATIVE: DROP CONSTRAINT → invalid status accepted → probe fails closed.
 *
 * Run:
 *   DB_IT=1 DATABASE_URL=postgres://justinrich@127.0.0.1:5432/holocron \
 *     bun test tests/integration/status-check.test.ts
 */
import { describe, expect, it } from 'vitest';
import { createSql } from '../../src/db/client';
import { LifecycleStatusSchema, WorkStatusSchema } from '../../src/db/enums';
import { probeStatusCheck } from '../../src/db/probe';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://justinrich@127.0.0.1:5432/holocron';

/** Canonical CHECK restored after the drop negative control. */
const TASKS_STATUS_CHECK_SQL = `
  ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'in_progress'::text, 'running'::text, 'completed'::text,
    'failed'::text, 'cancelled'::text, 'canceled'::text, 'awaiting_approval'::text,
    'approved'::text, 'rejected'::text, 'skipped'::text
  ]))
`;

describe('AC-2 status CHECK integration (real Postgres)', () => {
  it('GREEN: CHECK rejects in-progress and accepts in_progress; Zod enum aligned', async () => {
    const result = await probeStatusCheck({ databaseUrl: DATABASE_URL });
    expect(result.errors, result.errors.join('; ')).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.rejectedInvalid).toBe(true);
    expect(result.acceptedValid).toBe(true);
    expect(result.invalidValue).toBe('in-progress');
    expect(result.validValue).toBe('in_progress');
    expect(result.constraintError).toMatch(/check|constraint|tasks_status_check/i);
    expect(result.zodValidatesNormalized).toBe(true);

    // Shared enums also bite at the Zod boundary
    expect(WorkStatusSchema.safeParse('in-progress').success).toBe(false);
    expect(WorkStatusSchema.safeParse('in_progress').success).toBe(true);
    expect(LifecycleStatusSchema.safeParse('in-progress').success).toBe(false);
    expect(LifecycleStatusSchema.safeParse('in_progress').success).toBe(true);
  }, 60_000);

  it('NEGATIVE: when tasks_status_check is missing, invalid status is accepted and probe fails', async () => {
    // would fail if probe reported ok without CHECK (gate fakeable by dropping constraint)
    const sql = createSql(DATABASE_URL);
    let dropped = false;
    try {
      await sql.unsafe('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check');
      dropped = true;

      // Direct proof: invalid hyphen form is now accepted by Postgres
      const inserted = await sql<{ id: string }[]>`
          INSERT INTO tasks (task_type, status, legacy_convex_id)
          VALUES ('probe-neg', ${'in-progress'}, 'schema5_status_neg_invalid')
          RETURNING id
        `;
      expect(inserted.length).toBe(1);
      const insertedTask = inserted[0];
      if (!insertedTask) {
        throw new Error('Status-check setup did not create a task');
      }
      await sql`DELETE FROM tasks WHERE id = ${insertedTask.id}`;

      const probe = await probeStatusCheck({ databaseUrl: DATABASE_URL });
      expect(probe.ok).toBe(false);
      expect(probe.rejectedInvalid).toBe(false);
      expect(probe.errors.join(' ')).toMatch(/in-progress|CHECK missing|accepted/i);
    } finally {
      if (dropped) {
        // Restore exact constraint definition
        await sql.unsafe('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check');
        await sql.unsafe(TASKS_STATUS_CHECK_SQL);
      }
      await sql.end({ timeout: 5 });
    }

    // Post-condition: green again
    const restored = await probeStatusCheck({ databaseUrl: DATABASE_URL });
    expect(restored.ok).toBe(true);
    expect(restored.rejectedInvalid).toBe(true);
  }, 60_000);
});
