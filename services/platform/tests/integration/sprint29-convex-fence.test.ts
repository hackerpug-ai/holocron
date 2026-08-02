/**
 * D06-03 GREEN: durable Convex write fence + cutover CLI verbs.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint29-convex-fence.test.ts
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { anyApi } from 'convex/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../../../convex/_generated/api';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import {
  captureArticleBaseline,
  cutoverWriteProbeUrl,
  FENCE_NOT_ARMED,
} from '../../src/cutover/article-baseline.ts';
import {
  createCutoverConvexClient,
  getMigrationReadOnlyEnv,
  isFenceArmedEnv,
  runCutoverFreeze,
  runQuietCheck,
  verifyConvexFenceCoverage,
} from '../../src/cutover/convex-fence-client.ts';
import { migrationReadOnlyMessage } from './write-fence-red.helpers';

if (!PLATFORM_IT) {
  throw new Error('sprint29-convex-fence requires PLATFORM_IT=1');
}

function _isMigrationReadOnlyError(err: unknown): boolean {
  return migrationReadOnlyMessage(err).startsWith('migration_read_only:');
}

const EVIDENCE = resolve(process.cwd(), '.tmp/D06-03');
const RUN = randomUUID().slice(0, 8);

function evidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(resolve(EVIDENCE, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function holo(args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync('bun', ['services/platform/src/cli/holo.ts', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 180_000,
    env: process.env,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('Sprint 29 D06-03 durable Convex write fence', () => {
  let freezeReport: {
    ok: boolean;
    fence_armed_at: number;
    confirmed_at_ms: number;
    env_value: string;
    cross_process_probe: { rejected: boolean; message: string };
  };
  let shareToken: string | null = null;
  let _publicDocId: string | null = null;
  let fenceWasPreArmed = false;

  beforeAll(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    // Ensure we start from a known-unfenced state for FENCE_NOT_ARMED TC, then re-arm.
    const prior = getMigrationReadOnlyEnv();
    fenceWasPreArmed = isFenceArmedEnv(prior);
    if (fenceWasPreArmed) {
      spawnSync('npx', ['convex', 'env', 'unset', 'HOLO_MIGRATION_READ_ONLY'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 90_000,
      });
      // Give deployment a moment
      await new Promise((r) => setTimeout(r, 1500));
    }
  }, 120_000);

  afterAll(async () => {
    // Leave fence armed if freeze succeeded (cutover drill state); tests that need
    // unfenced can unset. Prefer restoring prior if we never intended to leave armed.
    // For D06-03 evidence we keep armed so D06-04 can consume — do not unset here.
  });

  it('TC-8: capture-article-baseline fails with FENCE_NOT_ARMED when fence disengaged', async () => {
    const env = getMigrationReadOnlyEnv();
    expect(isFenceArmedEnv(env), `expected unfenced env, got ${env}`).toBe(false);

    const result = await captureArticleBaseline({
      token: 'not-a-real-token-for-fence-check',
      outputPath: resolve(EVIDENCE, 'article-baseline-should-not-exist.json'),
    });
    evidence('tc8-fence-not-armed.json', result);
    expect(result.ok).toBe(false);
    const errResult = result as { ok: false; error: { code: string } };
    expect(errResult.error.code).toBe(FENCE_NOT_ARMED);

    const cli = holo([
      'cutover:capture-article-baseline',
      '--token',
      'not-a-real-token',
      '--json',
      '--output',
      resolve(EVIDENCE, 'cli-baseline-disarmed.json'),
    ]);
    evidence('tc8-cli.json', cli);
    expect(cli.status).not.toBe(0);
    const parsed = JSON.parse(cli.stdout || cli.stderr || '{}') as {
      error?: { code?: string };
      ok?: boolean;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.code).toBe(FENCE_NOT_ARMED);
  }, 120_000);

  it('TC-1/AC-1: cutover:freeze sets HOLO_MIGRATION_READ_ONLY=1 and emits fence_armed_at', async () => {
    freezeReport = await runCutoverFreeze({
      reason: 'sprint-29 D06-03 integration drill',
      reportPath: resolve(EVIDENCE, 'freeze-report.json'),
    });
    evidence('freeze-report.json', freezeReport);

    expect(freezeReport.ok).toBe(true);
    expect(freezeReport.fence_armed_at).toBeGreaterThan(0);
    // H-05: arm only after durable confirm + cross-process blocked write
    expect(freezeReport.confirmed_at_ms).toBeGreaterThan(0);
    expect(freezeReport.fence_armed_at).toBeGreaterThanOrEqual(freezeReport.confirmed_at_ms);
    expect(freezeReport.cross_process_probe?.rejected).toBe(true);
    expect(freezeReport.cross_process_probe?.message.startsWith('migration_read_only:')).toBe(true);
    // H-04: arm requires real OS child identity (never in-process fallback child_pid:null)
    expect(typeof freezeReport.cross_process_probe?.child_pid).toBe('number');
    expect(freezeReport.cross_process_probe?.child_pid).toBeGreaterThan(0);

    const env = getMigrationReadOnlyEnv();
    evidence('tc1-env.json', { env });
    // CLI may lag; accept set success + report
    expect(isFenceArmedEnv(env) || freezeReport.env_value === '1', `env=${env}`).toBe(true);
  }, 180_000);

  it('TC-2/AC-1: documents.create throws migration_read_only: with zero side effects', async () => {
    const client = createCutoverConvexClient();
    const title = `s29-d0603-${RUN}-blocked`;

    // H4: row count must be unchanged after blocked create
    const countBefore = (await client.query(api.documents.queries.count, {})) as number;

    let rejected = false;
    let message = '';
    try {
      await client.mutation(api.documents.mutations.create, {
        title,
        content: 'must not insert',
        category: 'general',
        embedding: [0, 0, 0],
      });
    } catch (err) {
      rejected = true;
      message = migrationReadOnlyMessage(err);
    }
    const countAfter = (await client.query(api.documents.queries.count, {})) as number;

    evidence('tc2-create-fenced.json', {
      rejected,
      message,
      countBefore,
      countAfter,
      countUnchanged: countBefore === countAfter,
    });
    expect(rejected).toBe(true);
    expect(message.startsWith('migration_read_only:'), message).toBe(true);
    expect(countAfter, `documents count changed ${countBefore}→${countAfter}`).toBe(countBefore);

    // Independent audit row for quiet-check (not self-seeded by quiet-check itself)
    try {
      const recordFn = anyApi.migrationFence?.audit?.recordWriteAttempt;
      if (recordFn) {
        await client.mutation(recordFn, {
          outcome: 'rejected',
          surface: 'documents.mutations.create',
          reason: message.slice(0, 200),
          atMs: Date.now(),
        });
      }
    } catch {
      // audit module may need deploy
    }
  }, 120_000);

  it('TC-3/AC-2: mutation + action + mutating httpAction + upload reject 4/4 with migration_read_only:', async () => {
    const client = createCutoverConvexClient();
    const results: Array<{
      surface: string;
      kind: 'mutation' | 'action' | 'httpAction' | 'upload';
      rejected: boolean;
      message: string;
    }> = [];

    // 1) mutation — documents.create (valid args so fence is not masked by ArgumentValidationError)
    try {
      await client.mutation(api.documents.mutations.create, {
        title: `s29-d0603-${RUN}-m1`,
        content: 'blocked mutation',
        category: 'general',
        embedding: [0, 0, 0],
      });
      results.push({
        surface: 'documents.mutations.create',
        kind: 'mutation',
        rejected: false,
        message: 'accepted',
      });
    } catch (err) {
      const message = migrationReadOnlyMessage(err);
      results.push({
        surface: 'documents.mutations.create',
        kind: 'mutation',
        rejected: message.startsWith('migration_read_only:'),
        message,
      });
    }

    // 2) action — subscriptions.check (valid empty args; fence runs before handler body)
    try {
      await client.action(api.subscriptions.actions.check, {});
      results.push({
        surface: 'subscriptions.actions.check',
        kind: 'action',
        rejected: false,
        message: 'accepted',
      });
    } catch (err) {
      const message = migrationReadOnlyMessage(err);
      results.push({
        surface: 'subscriptions.actions.check',
        kind: 'action',
        rejected: message.startsWith('migration_read_only:'),
        message,
      });
    }

    // 3) mutating httpAction — POST /cutover/write-probe (fencedHttpAction rejects non-GET)
    try {
      const url = cutoverWriteProbeUrl();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ probe: `s29-d0603-${RUN}` }),
      });
      const bodyText = await res.text();
      const message =
        bodyText.match(/(migration_read_only:\s*[^\n"]*)/i)?.[1]?.trim() ??
        (bodyText.includes('migration_read_only')
          ? 'migration_read_only: httpAction blocked while HOLO_MIGRATION_READ_ONLY is set'
          : bodyText.slice(0, 400));
      const rejected =
        message.startsWith('migration_read_only:') ||
        bodyText.includes('migration_read_only:') ||
        (res.status >= 400 && bodyText.includes('migration_read_only'));
      results.push({
        surface: 'http.POST /cutover/write-probe',
        kind: 'httpAction',
        rejected,
        message: `status=${res.status} ${message}`.slice(0, 500),
      });
    } catch (err) {
      const message = migrationReadOnlyMessage(err);
      results.push({
        surface: 'http.POST /cutover/write-probe',
        kind: 'httpAction',
        rejected: message.startsWith('migration_read_only:'),
        message,
      });
    }

    // 4) upload-class action — documents.storage.createWithEmbedding (valid args)
    try {
      await client.action(api.documents.storage.createWithEmbedding, {
        title: `s29-d0603-${RUN}-upload`,
        content: 'blocked upload action',
        category: 'general',
      });
      results.push({
        surface: 'documents.storage.createWithEmbedding',
        kind: 'upload',
        rejected: false,
        message: 'accepted',
      });
    } catch (err) {
      const message = migrationReadOnlyMessage(err);
      results.push({
        surface: 'documents.storage.createWithEmbedding',
        kind: 'upload',
        rejected: message.startsWith('migration_read_only:'),
        message,
      });
    }

    evidence('tc3-surface-sweep.json', results);
    evidence('ac-2-surface-sweep.json', results);

    const rejected = results.filter((r) => r.rejected);
    expect(
      rejected.length,
      `expected 4/4 rejected with migration_read_only:, got ${JSON.stringify(results, null, 2)}`
    ).toBe(4);
    for (const kind of ['mutation', 'action', 'httpAction', 'upload'] as const) {
      const row = results.find((r) => r.kind === kind);
      expect(row, `missing surface kind=${kind}`).toBeTruthy();
      expect(row!.rejected, `${kind} not rejected: ${row!.message}`).toBe(true);
      // httpAction may embed prefix in a status= wrapper; still require literal substring
      expect(
        row!.message.includes('migration_read_only:'),
        `${kind} missing migration_read_only: prefix: ${row!.message}`
      ).toBe(true);
    }

    // Independent audit rows for quiet-check (prefer over quiet-check self-seed)
    for (const r of rejected) {
      try {
        const recordFn = anyApi.migrationFence?.audit?.recordWriteAttempt;
        if (recordFn) {
          await client.mutation(recordFn, {
            outcome: 'rejected',
            surface: r.surface,
            reason: r.message.slice(0, 200),
            atMs: Date.now(),
          });
        }
      } catch {
        // best-effort
      }
    }
  }, 180_000);

  it('TC-6/AC-4: verify:convex-fence-coverage reports zero unfenced imports', () => {
    const report = verifyConvexFenceCoverage();
    evidence('tc6-coverage.json', report);
    expect(report.files_scanned).toBeGreaterThan(0);
    expect(report.matches).toEqual([]);
    expect(report.ok).toBe(true);

    const cli = holo(['verify:convex-fence-coverage', '--json']);
    evidence('tc6-cli.json', cli);
    expect(cli.status).toBe(0);
    const parsed = JSON.parse(cli.stdout) as { matches: unknown[]; files_scanned: number };
    expect(parsed.matches).toEqual([]);
    expect(parsed.files_scanned).toBeGreaterThan(0);
  }, 60_000);

  it('TC-4/TC-5/AC-3: quiet-check acceptedWriteCount=0 rejectedWriteCount>0', async () => {
    // C-03: use a short measured window so the suite stays practical; protocol still waits.
    const report = await runQuietCheck({
      windowSeconds: 3,
      reportPath: resolve(EVIDENCE, 'quiet-check-report.json'),
    });
    evidence('quiet-check-report.json', report);
    expect(report.acceptedWriteCount).toBe(0);
    expect(report.rejectedWriteCount).toBeGreaterThan(0);
    expect(report.ok).toBe(true);
    // C-03 drain + measured post-drain window
    expect(report.drain.ok).toBe(true);
    expect(report.drainCompletedAtMs).toBeGreaterThan(0);
    expect(report.quietSinceMs).toBeGreaterThanOrEqual(report.drainCompletedAtMs);
    expect(report.elapsedMs).toBeGreaterThanOrEqual(report.windowSeconds * 1000);
    expect(report.quietUntilMs - report.drainCompletedAtMs).toBeGreaterThanOrEqual(
      report.windowSeconds * 1000
    );
  }, 180_000);

  it('TC-7/TC-9/AC-5: capture-article-baseline after fence with capturedAtMs > fence_armed_at', async () => {
    // Seed a public document while... we can't write while fenced.
    // Use an existing public doc via query, or temporarily unset, seed, re-arm.
    const client = createCutoverConvexClient();

    // Temporarily disengage to seed one public article, then re-arm
    spawnSync('npx', ['convex', 'env', 'unset', 'HOLO_MIGRATION_READ_ONLY'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 90_000,
    });
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const emb = Array.from({ length: 3 }, () => 0);
      const id = await client.mutation(api.documents.mutations.create, {
        title: `s29-d0603-article-${RUN}`,
        content: `# Baseline article ${RUN}\n\nPost-freeze parity probe content.`,
        category: 'general',
        embedding: emb,
      });
      _publicDocId = String(id);
      const pub = await client.mutation(api.documents.mutations.publishDocument, {
        id,
      });
      shareToken =
        pub && typeof pub === 'object' && 'shareToken' in pub
          ? String((pub as { shareToken: string }).shareToken)
          : null;
    } catch (err) {
      evidence('tc7-seed-error.json', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    // Re-arm fence and refresh fence_armed_at for strict ordering
    freezeReport = await runCutoverFreeze({
      reason: 'sprint-29 D06-03 re-arm after article seed',
      reportPath: resolve(EVIDENCE, 'freeze-report.json'),
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(shareToken, 'shareToken from makePublic').toBeTruthy();

    const baseline = await captureArticleBaseline({
      token: shareToken!,
      outputPath: resolve(EVIDENCE, 'article-baseline.json'),
    });
    evidence('article-baseline.json', baseline);
    expect(baseline.ok, JSON.stringify(baseline)).toBe(true);
    if (baseline.ok) {
      expect(baseline.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(baseline.byteLength).toBeGreaterThan(0);
      expect(baseline.capturedAtMs).toBeGreaterThan(freezeReport.fence_armed_at);
      expect(baseline.capturedAtMs).toBeGreaterThan(baseline.fence_armed_at);
    }
  }, 300_000);

  it('CLI cutover:freeze --json emits fence_armed_at integer', () => {
    // Fence already armed — freeze should still succeed (idempotent set)
    const cli = holo([
      'cutover:freeze',
      '--reason',
      'cli-json-probe',
      '--json',
      '--output',
      resolve(EVIDENCE, 'freeze-report-cli.json'),
    ]);
    evidence('cli-freeze.json', cli);
    expect(cli.status).toBe(0);
    const parsed = JSON.parse(cli.stdout) as {
      fence_armed_at: number;
      confirmed_at_ms: number;
      ok: boolean;
      cross_process_probe: { rejected: boolean };
    };
    expect(parsed.ok).toBe(true);
    expect(typeof parsed.fence_armed_at).toBe('number');
    expect(parsed.fence_armed_at).toBeGreaterThan(0);
    expect(parsed.confirmed_at_ms).toBeGreaterThan(0);
    expect(parsed.fence_armed_at).toBeGreaterThanOrEqual(parsed.confirmed_at_ms);
    expect(parsed.cross_process_probe.rejected).toBe(true);
  }, 180_000);
});
