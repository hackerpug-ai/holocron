/**
 * REDHAT-FIX-2 / C-2 — Deterministic CLI mission idempotency defaults.
 *
 * Real Postgres (holocron_nonprod). No mocks of createMissionRun / SQL / @mastra/*.
 *
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultMissionIdempotencyKey } from '../../src/cli/mission-idempotency-key.ts';
import { ensureSystemMissionTemplates } from '../../src/mission/templates/ensure-system.ts';
import {
  DATABASE_URL,
  ensureRedTestEnvironment,
  PLATFORM_IT,
  REPO_ROOT,
  runHolo,
  truncateMissionTables,
  withSql,
} from './mission-red.helpers';
import { asRecord, runPsql } from './pipes-4-red.helpers';

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/redhat-fix-2');
const HOLO_SRC = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const BARE_WHATSNEW_KEY = 'whatsnew:2026-07-20';
const WHATSNEW_DATE = '2026-07-20';
const MS_SUFFIX_RE = /:[0-9]{10,}$/;

const itLive = PLATFORM_IT ? it : it.skip;

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(resolve(EVIDENCE_DIR, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function payloadFields(parsed: unknown): {
  runId: string | null;
  idempotencyKey: string | null;
  ok: boolean | null;
  status: string | null;
  replay: boolean | null;
} {
  const p = asRecord(parsed);
  return {
    runId: typeof p.runId === 'string' ? p.runId : null,
    idempotencyKey: typeof p.idempotencyKey === 'string' ? p.idempotencyKey : null,
    ok: typeof p.ok === 'boolean' ? p.ok : null,
    status: typeof p.status === 'string' ? p.status : null,
    replay: typeof p.replay === 'boolean' ? p.replay : null,
  };
}

async function deleteMissionRunsForKey(templateKey: string, idempotencyKey: string): Promise<void> {
  await withSql(async (sql) => {
    await sql`
      DELETE FROM mission_stage_runs
      WHERE run_id IN (
        SELECT id FROM mission_runs
        WHERE template_key = ${templateKey} AND idempotency_key = ${idempotencyKey}
      )
    `;
    await sql`
      DELETE FROM mission_events
      WHERE run_id IN (
        SELECT id FROM mission_runs
        WHERE template_key = ${templateKey} AND idempotency_key = ${idempotencyKey}
      )
    `;
    await sql`
      DELETE FROM mission_checkpoints
      WHERE run_id IN (
        SELECT id FROM mission_runs
        WHERE template_key = ${templateKey} AND idempotency_key = ${idempotencyKey}
      )
    `;
    await sql`
      DELETE FROM mission_commits
      WHERE run_id IN (
        SELECT id FROM mission_runs
        WHERE template_key = ${templateKey} AND idempotency_key = ${idempotencyKey}
      )
    `;
    await sql`
      DELETE FROM mission_run_tags
      WHERE run_id IN (
        SELECT id FROM mission_runs
        WHERE template_key = ${templateKey} AND idempotency_key = ${idempotencyKey}
      )
    `;
    await sql`
      DELETE FROM mission_runs
      WHERE template_key = ${templateKey} AND idempotency_key = ${idempotencyKey}
    `;
  });
}

async function countMissionRunsForKey(
  templateKey: string,
  idempotencyKey: string
): Promise<number> {
  return withSql(async (sql) => {
    const rows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM mission_runs
      WHERE template_key = ${templateKey} AND idempotency_key = ${idempotencyKey}
    `;
    return Number(rows[0]?.count ?? 0);
  });
}

function runWhatsNew(artifactBase: string, extra: string[] = []) {
  return runHolo(
    artifactBase,
    [
      'mission',
      'run',
      'whatsNew',
      '--date',
      WHATSNEW_DATE,
      '--goal',
      `daily briefing for ${WHATSNEW_DATE}`,
      ...extra,
      '--json',
    ],
    { timeoutMs: 300_000 }
  );
}

describe.sequential('REDHAT-FIX-2 — deterministic CLI mission idempotency defaults (C-2)', () => {
  async function ensureTemplatesResilient(): Promise<void> {
    // Other worktrees may re-register system templates with a different
    // fleet_manifest_path absolute path; on immutable drift, wipe + re-seed.
    try {
      await ensureSystemMissionTemplates({ databaseUrl: DATABASE_URL });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('immutable mission template conflict')) throw error;
      await truncateMissionTables();
      await ensureSystemMissionTemplates({ databaseUrl: DATABASE_URL });
    }
  }

  beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    await ensureRedTestEnvironment();
    expect(PLATFORM_IT).toBe(true);
    expect(DATABASE_URL).toContain('/holocron_nonprod');
    // Truncate first so immutable-template drift from other suites cannot block re-register.
    await truncateMissionTables();
    await ensureTemplatesResilient();
  }, 180_000);

  beforeEach(async () => {
    await ensureTemplatesResilient();
  }, 60_000);

  itLive(
    'AC-1: Default whatsNew double-invoke reuses the same run',
    async () => {
      // Fixture: whatsnew_template_clean_key — zero rows for bare default key.
      await deleteMissionRunsForKey('whatsnew', BARE_WHATSNEW_KEY);
      // Also clear any legacy timestamped keys for this date so count probe is clean.
      await withSql(async (sql) => {
        await sql`
          DELETE FROM mission_stage_runs
          WHERE run_id IN (
            SELECT id FROM mission_runs
            WHERE template_key = 'whatsnew' AND idempotency_key LIKE ${`${BARE_WHATSNEW_KEY}%`}
          )
        `;
        await sql`
          DELETE FROM mission_events
          WHERE run_id IN (
            SELECT id FROM mission_runs
            WHERE template_key = 'whatsnew' AND idempotency_key LIKE ${`${BARE_WHATSNEW_KEY}%`}
          )
        `;
        await sql`
          DELETE FROM mission_checkpoints
          WHERE run_id IN (
            SELECT id FROM mission_runs
            WHERE template_key = 'whatsnew' AND idempotency_key LIKE ${`${BARE_WHATSNEW_KEY}%`}
          )
        `;
        await sql`
          DELETE FROM mission_commits
          WHERE run_id IN (
            SELECT id FROM mission_runs
            WHERE template_key = 'whatsnew' AND idempotency_key LIKE ${`${BARE_WHATSNEW_KEY}%`}
          )
        `;
        await sql`
          DELETE FROM mission_run_tags
          WHERE run_id IN (
            SELECT id FROM mission_runs
            WHERE template_key = 'whatsnew' AND idempotency_key LIKE ${`${BARE_WHATSNEW_KEY}%`}
          )
        `;
        await sql`
          DELETE FROM mission_runs
          WHERE template_key = 'whatsnew' AND idempotency_key LIKE ${`${BARE_WHATSNEW_KEY}%`}
        `;
      });

      const preCount = await countMissionRunsForKey('whatsnew', BARE_WHATSNEW_KEY);
      expect(preCount).toBe(0);

      // No --idempotency-key, no --fresh — default key must be deterministic.
      const first = runWhatsNew('redhat-fix-2-ac1-first');
      // Brief gap 100–500ms between invokes (AC-1).
      await new Promise((r) => setTimeout(r, 200));
      const second = runWhatsNew('redhat-fix-2-ac1-second');

      const a = payloadFields(first.parsed);
      const b = payloadFields(second.parsed);

      writeEvidence('AC-1-double-invoke.json', {
        first: { status: first.status, ...a, combined: first.combined.slice(0, 2000) },
        second: { status: second.status, ...b, combined: second.combined.slice(0, 2000) },
      });

      expect(first.status, first.combined).toBe(0);
      expect(second.status, second.combined).toBe(0);

      expect(a.idempotencyKey, 'first key must be bare default (no ms suffix)').toBe(
        BARE_WHATSNEW_KEY
      );
      expect(b.idempotencyKey, 'second key must equal first bare default').toBe(BARE_WHATSNEW_KEY);
      expect(a.idempotencyKey).not.toMatch(MS_SUFFIX_RE);
      expect(b.idempotencyKey).not.toMatch(/^whatsnew:2026-07-20:[0-9]{10,}$/);

      expect(a.runId, 'first runId present').toBeTruthy();
      expect(b.runId, 'second runId present').toBeTruthy();
      expect(a.runId, 'double-invoke must reuse same runId (dedup/replay)').toBe(b.runId);

      const count = await countMissionRunsForKey('whatsnew', BARE_WHATSNEW_KEY);
      const psql = runPsql(
        `SELECT count(*) FROM mission_runs WHERE template_key = 'whatsnew' AND idempotency_key = '${BARE_WHATSNEW_KEY}'`
      );
      writeEvidence('AC-1-mission-runs-count.json', {
        count,
        psql: { status: psql.status, stdout: psql.stdout, stderr: psql.stderr },
      });
      expect(count).toBe(1);
      expect(psql.status).toBe(0);
      expect(psql.stdout).toMatch(/\b1\b/);
    },
    600_000
  );

  itLive(
    'AC-2: Explicit --idempotency-key override and --fresh uniqueness opt-in',
    async () => {
      const operatorKey = 'operator-fixed-key-c2';
      await deleteMissionRunsForKey('whatsnew', operatorKey);

      // Override path: same key twice → same runId
      const o1 = runWhatsNew('redhat-fix-2-ac2-override-1', ['--idempotency-key', operatorKey]);
      await new Promise((r) => setTimeout(r, 150));
      const o2 = runWhatsNew('redhat-fix-2-ac2-override-2', ['--idempotency-key', operatorKey]);

      const oa = payloadFields(o1.parsed);
      const ob = payloadFields(o2.parsed);

      // Fresh path: uniqueness opt-in twice → different runIds, keys ≠ bare default
      const f1 = runWhatsNew('redhat-fix-2-ac2-fresh-1', ['--fresh']);
      await new Promise((r) => setTimeout(r, 50));
      const f2 = runWhatsNew('redhat-fix-2-ac2-fresh-2', ['--fresh']);

      const fa = payloadFields(f1.parsed);
      const fb = payloadFields(f2.parsed);

      writeEvidence('AC-2-override-and-fresh.json', {
        override: {
          first: { status: o1.status, ...oa },
          second: { status: o2.status, ...ob },
        },
        fresh: {
          first: { status: f1.status, ...fa },
          second: { status: f2.status, ...fb },
        },
      });

      expect(o1.status, o1.combined).toBe(0);
      expect(o2.status, o2.combined).toBe(0);
      expect(oa.idempotencyKey).toBe(operatorKey);
      expect(ob.idempotencyKey).toBe(operatorKey);
      expect(oa.runId).toBeTruthy();
      expect(oa.runId).toBe(ob.runId);

      expect(f1.status, f1.combined).toBe(0);
      expect(f2.status, f2.combined).toBe(0);
      expect(fa.idempotencyKey).toBeTruthy();
      expect(fb.idempotencyKey).toBeTruthy();
      expect(fa.idempotencyKey).not.toBe(BARE_WHATSNEW_KEY);
      expect(fb.idempotencyKey).not.toBe(BARE_WHATSNEW_KEY);
      expect(fa.runId).toBeTruthy();
      expect(fb.runId).toBeTruthy();
      expect(fa.runId, 'fresh path must produce distinct runs').not.toBe(fb.runId);
      expect(fa.idempotencyKey).not.toBe(fb.idempotencyKey);
    },
    600_000
  );

  itLive('AC-3: All six default key formulas are deterministic (no wall-clock suffix)', () => {
    // Shared pure helper used by holo.ts — single-sourced formulas (no full mission exec).
    const expected = {
      research: 'research:c2-goal:2',
      whatsNew: 'whatsnew:2026-07-20',
      assimilate: 'assimilate:acme/widget',
      shop: 'shop:keyboard',
      subscriptions: 'subscriptions:c2-topic',
      report: 'report:competitive:example.com',
    } as const;

    const keys = {
      research: defaultMissionIdempotencyKey('research', {
        instantiation: 'research',
        goal: 'c2-goal',
        components: 2,
      }),
      whatsNew: defaultMissionIdempotencyKey('whatsnew', { date: '2026-07-20' }),
      assimilate: defaultMissionIdempotencyKey('assimilate', { target: 'acme/widget' }),
      shop: defaultMissionIdempotencyKey('shop', { query: 'keyboard' }),
      subscriptions: defaultMissionIdempotencyKey('subscriptions', { topic: 'c2-topic' }),
      report: defaultMissionIdempotencyKey('report', {
        reportKind: 'competitive',
        subject: 'example.com',
      }),
    };

    writeEvidence('AC-3-six-formulas.json', { keys, expected });

    expect(keys.research).toBe(expected.research);
    expect(keys.whatsNew).toBe(expected.whatsNew);
    expect(keys.assimilate).toBe(expected.assimilate);
    expect(keys.shop).toBe(expected.shop);
    expect(keys.subscriptions).toBe(expected.subscriptions);
    expect(keys.report).toBe(expected.report);

    for (const [surface, key] of Object.entries(keys)) {
      expect(key, `${surface} must not end with ms-style suffix`).not.toMatch(MS_SUFFIX_RE);
      expect(key, `${surface} must not contain Date.now literal`).not.toContain('Date.now');
    }

    // Override + fresh precedence smoke on the pure helper
    expect(
      defaultMissionIdempotencyKey(
        'whatsnew',
        { date: '2026-07-20' },
        { override: 'operator-fixed-key-c2' }
      )
    ).toBe('operator-fixed-key-c2');
    expect(
      defaultMissionIdempotencyKey(
        'whatsnew',
        { date: '2026-07-20' },
        { fresh: true, uniqueSuffix: 42 }
      )
    ).toBe('whatsnew:2026-07-20:42');
  });

  itLive('AC-4: Source audit — default-key lines free of unguarded Date.now()', () => {
    const src = readFileSync(HOLO_SRC, 'utf8');
    writeEvidence('AC-4-source-audit-meta.json', {
      path: HOLO_SRC,
      bytes: src.length,
    });

    // Unguarded wall-clock patterns that previously lived on default-key lines.
    const unguardedTemplates = [
      "`${instantiation}:${goal}:${components ?? 'default'}:${Date.now()}`",
      '`whatsnew:${date}:${Date.now()}`',
      '`assimilate:${target}:${Date.now()}`',
      '`shop:${query}:${Date.now()}`',
      '`subscriptions:${topic}:${Date.now()}`',
      '`report:${reportKind}:${subject}:${Date.now()}`',
    ];

    const stillPresent = unguardedTemplates.filter((t) => src.includes(t));
    writeEvidence('AC-4-unguarded-templates.json', { stillPresent, checked: unguardedTemplates });
    expect(
      stillPresent,
      `unguarded Date.now() default-key templates still present: ${stillPresent.join('; ')}`
    ).toEqual([]);

    // Must import and call the shared helper for defaults.
    expect(src).toMatch(/defaultMissionIdempotencyKey/);
    expect(src).toMatch(/from ['"].*mission-idempotency-key/);

    // --fresh flag must be parsed (opt-in uniqueness).
    expect(src).toMatch(/--fresh/);
    expect(src).toMatch(/args\.fresh|fresh:\s*true|fresh:\s*boolean/);

    // Any remaining Date.now() in holo.ts for mission keys must sit behind fresh/uniqueSuffix
    // (helper may still use Date.now only under opts.fresh). Count Date.now in holo.ts
    // mission-run region: should not appear as default-key concat without fresh.
    const dateNowInHolo = [...src.matchAll(/Date\.now\(\)/g)];
    writeEvidence('AC-4-date-now-sites.json', {
      count: dateNowInHolo.length,
      // snippet around each for reviewer
      sites: dateNowInHolo.map((m) => {
        const idx = m.index ?? 0;
        return src.slice(Math.max(0, idx - 80), idx + 80);
      }),
    });

    // Mission run default-key construction must go through the helper (no inline Date.now templates).
    // Allow Date.now elsewhere in holo.ts (unrelated surfaces) but not in default-key template form.
    for (const site of dateNowInHolo) {
      const idx = site.index ?? 0;
      const window = src.slice(Math.max(0, idx - 120), idx + 40);
      expect(window, `Date.now() near mission default-key construction:\n${window}`).not.toMatch(
        /idempotencyKey\s*=\s*[^;]*Date\.now|`[^`]*\$\{Date\.now\(\)\}[^`]*`/
      );
    }
  });
});
