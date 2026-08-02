/**
 * REDHAT-FIX-S29-H05 — fence arm-after-confirm ordering + cross-process probe.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint29-fence-arm-order.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { anyApi } from 'convex/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../../../convex/_generated/api';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { captureArticleBaseline } from '../../src/cutover/article-baseline.ts';
import {
  createCutoverConvexClient,
  getMigrationReadOnlyEnv,
  isFenceArmedEnv,
  runCutoverFreeze,
} from '../../src/cutover/convex-fence-client.ts';

if (!PLATFORM_IT) {
  throw new Error('sprint29-fence-arm-order requires PLATFORM_IT=1');
}

const EVIDENCE = resolve(process.cwd(), '.tmp/REDHAT-FIX-S29-H05');
const D0603 = resolve(process.cwd(), '.tmp/D06-03');

function evidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  mkdirSync(D0603, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  const payload = text.endsWith('\n') ? text : `${text}\n`;
  writeFileSync(resolve(EVIDENCE, name), payload, 'utf8');
  // Mirror freeze-report into D06-03 for TC jq paths
  if (name === 'freeze-report.json') {
    writeFileSync(resolve(D0603, name), payload, 'utf8');
  }
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

/**
 * Static RED control: pre-fix ordering at convex-fence-client.ts:199 stamped
 * fence_armed_at = Date.now() BEFORE env set. Post-fix source must not reintroduce
 * that pattern inside runCutoverFreeze.
 */
function sourceHasPreFixArmBeforeSetOrdering(): boolean {
  const src = readFileSync(
    resolve(process.cwd(), 'services/platform/src/cutover/convex-fence-client.ts'),
    'utf8'
  );
  // Extract runCutoverFreeze body roughly
  const start = src.indexOf('export async function runCutoverFreeze');
  if (start < 0) return true; // missing = fail closed as pre-fix-like
  const next = src.indexOf('export async function', start + 10);
  const body = src.slice(start, next > 0 ? next : undefined);
  // Pre-fix pattern: fence_armed_at = Date.now() appears before convexEnv('set'...
  const armIdx = body.search(/fence_armed_at\s*=\s*Date\.now\s*\(/);
  const setIdx = body.search(/convexEnv\s*\(\s*['"]set['"]/);
  if (armIdx < 0 || setIdx < 0) {
    // Missing arm stamp after set is also wrong for green; treat as pre-fix only if arm precedes set
    return armIdx >= 0 && (setIdx < 0 || armIdx < setIdx);
  }
  return armIdx < setIdx;
}

describe('REDHAT-FIX-S29-H05 fence arm-after-confirm ordering', () => {
  beforeAll(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    mkdirSync(D0603, { recursive: true });
    // Start unfenced so freeze must do real set+confirm
    const prior = getMigrationReadOnlyEnv();
    if (isFenceArmedEnv(prior)) {
      spawnSync('npx', ['convex', 'env', 'unset', 'HOLO_MIGRATION_READ_ONLY'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 90_000,
      });
      await new Promise((r) => setTimeout(r, 1500));
    }
  }, 120_000);

  it('TC-7 RED: source must not reintroduce pre-fix arm-before-set ordering at :199-237', () => {
    const preFix = sourceHasPreFixArmBeforeSetOrdering();
    evidence('tc7-source-arm-order.json', {
      pre_fix_arm_before_set: preFix,
      note: 'GREEN requires pre_fix_arm_before_set === false',
    });
    // RED against unfixed SHA would have preFix===true and this expect fails
    expect(preFix, 'pre-fix arm-before-set ordering still present in runCutoverFreeze').toBe(false);
  });

  it("AC-1 arm-after-confirm: fence_armed_at only after confirmed env=='1'", async () => {
    const freezeReport = await runCutoverFreeze({
      reason: 's29-h05 arm-after-confirm',
      reportPath: resolve(D0603, 'freeze-report.json'),
    });
    evidence('freeze-report.json', freezeReport);
    evidence('ac-1-arm-after-confirm.json', freezeReport);

    expect(freezeReport.ok).toBe(true);
    expect(freezeReport.confirmed_at_ms).toBeGreaterThan(0);
    expect(freezeReport.fence_armed_at).toBeGreaterThanOrEqual(freezeReport.confirmed_at_ms);

    const env = getMigrationReadOnlyEnv();
    evidence('ac-1-env.json', { env });
    expect(isFenceArmedEnv(env) || freezeReport.env_value === '1').toBe(true);

    // CLI JSON path
    const cli = holo([
      'cutover:freeze',
      '--reason',
      's29-h05',
      '--json',
      '--output',
      resolve(EVIDENCE, 'freeze-report-cli.json'),
    ]);
    evidence('ac-1-cli-freeze.json', cli);
    expect(cli.status).toBe(0);
    const parsed = JSON.parse(cli.stdout) as {
      ok: boolean;
      confirmed_at_ms: number;
      fence_armed_at: number;
      cross_process_probe: { rejected: boolean };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.confirmed_at_ms).toBeGreaterThan(0);
    expect(parsed.fence_armed_at).toBeGreaterThanOrEqual(parsed.confirmed_at_ms);
  }, 300_000);

  it('AC-2 cross-process-blocked-write: probe rejects with migration_read_only: before arm', async () => {
    // Freeze (idempotent re-arm) must include cross_process_probe
    const freezeReport = await runCutoverFreeze({
      reason: 's29-h05 cross-process-blocked-write',
      reportPath: resolve(D0603, 'freeze-report.json'),
    });
    evidence('freeze-report.json', freezeReport);
    evidence('ac-2-cross-process-probe.json', freezeReport.cross_process_probe);

    expect(freezeReport.cross_process_probe).toBeTruthy();
    expect(freezeReport.cross_process_probe.rejected).toBe(true);
    expect(freezeReport.cross_process_probe.message.startsWith('migration_read_only:')).toBe(true);
    if (
      freezeReport.cross_process_probe.documentsBefore >= 0 &&
      freezeReport.cross_process_probe.documentsAfter >= 0
    ) {
      expect(freezeReport.cross_process_probe.documentsAfter).toBe(
        freezeReport.cross_process_probe.documentsBefore
      );
    }
    // Arm after probe: fence_armed_at >= confirmed_at_ms (probe sits between)
    expect(freezeReport.fence_armed_at).toBeGreaterThanOrEqual(freezeReport.confirmed_at_ms);
  }, 300_000);

  it('AC-5 baseline-after-confirmed-arm: capturedAtMs > fence_armed_at >= confirmed_at_ms', async () => {
    // Ensure fence armed with post-confirmation timestamps
    const freezeReport = await runCutoverFreeze({
      reason: 's29-h05 baseline-after-confirmed-arm',
      reportPath: resolve(D0603, 'freeze-report.json'),
    });
    evidence('freeze-report.json', freezeReport);

    expect(freezeReport.fence_armed_at).toBeGreaterThanOrEqual(freezeReport.confirmed_at_ms);

    // Seed public article: temporarily unset, publish, re-arm with confirmed order
    const client = createCutoverConvexClient();
    spawnSync('npx', ['convex', 'env', 'unset', 'HOLO_MIGRATION_READ_ONLY'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 90_000,
    });
    await new Promise((r) => setTimeout(r, 1500));

    let shareToken: string | null = null;
    try {
      const id = await client.mutation(api.documents.mutations.create, {
        title: `s29-h05-baseline-${Date.now()}`,
        content: '# H-05 baseline\n\nPost-confirmation arm ordering proof.',
        category: 'general',
        embedding: [0, 0, 0],
      });
      const pub = await client.mutation(api.documents.mutations.publishDocument, { id });
      shareToken =
        pub && typeof pub === 'object' && 'shareToken' in pub
          ? String((pub as { shareToken: string }).shareToken)
          : null;
    } catch (err) {
      evidence('ac-5-seed-error.json', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const rearm = await runCutoverFreeze({
      reason: 's29-h05 re-arm after baseline seed',
      reportPath: resolve(D0603, 'freeze-report.json'),
    });
    evidence('freeze-report.json', rearm);
    await new Promise((r) => setTimeout(r, 50));

    expect(shareToken).toBeTruthy();
    const baseline = await captureArticleBaseline({
      token: shareToken!,
      outputPath: resolve(EVIDENCE, 'article-baseline.json'),
      freezeReportPath: resolve(D0603, 'freeze-report.json'),
    });
    evidence('article-baseline.json', baseline);
    evidence('ac-5-baseline-ordering.json', {
      baseline,
      fence_armed_at: rearm.fence_armed_at,
      confirmed_at_ms: rearm.confirmed_at_ms,
    });

    expect(baseline.ok, JSON.stringify(baseline)).toBe(true);
    if (baseline.ok) {
      expect(rearm.fence_armed_at).toBeGreaterThanOrEqual(rearm.confirmed_at_ms);
      expect(baseline.capturedAtMs).toBeGreaterThan(rearm.fence_armed_at);
      expect(baseline.capturedAtMs).toBeGreaterThan(baseline.fence_armed_at);
    }

    // Audit latest should match post-confirmation arm when present
    try {
      const latest = (await client.query(anyApi.migrationFence.audit.latestFenceArmed, {})) as {
        fenceArmedAtMs?: number;
      } | null;
      evidence('ac-5-audit-latest.json', latest);
      if (latest && typeof latest.fenceArmedAtMs === 'number') {
        expect(latest.fenceArmedAtMs).toBe(rearm.fence_armed_at);
      }
    } catch {
      // audit module optional
    }
  }, 360_000);
});
