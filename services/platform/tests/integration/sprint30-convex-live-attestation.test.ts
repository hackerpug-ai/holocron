/**
 * D07-02 — Convex-live multi-tick attestation + write-block probes (UC-SYNC-04).
 *
 * AC-1: every tick observes real Convex reachability; evidence hash-chains.
 * AC-2: every tick's real POST /api/documents against pre-existing Hono returns
 *       423 migration_read_only; mid-window disarm is caught.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint30-convex-live-attestation.test.ts
 */
import { createServer } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONVEX_UNREACHABLE,
  canonicalTick,
  defaultAttestationEvidencePath,
  hashTick,
  runAttestConvexLive,
  sha256Hex,
  verifyAttestationHashChain,
  WRITES_NOT_BLOCKED,
} from '../../src/cutover/convex-live-attestation.ts';
import { writeDurableMigrationReadOnly } from '../../src/cutover/soak-fence.ts';
import {
  DISPOSABLE_SECRETS,
  holo,
  holoEnv,
  PLATFORM_IT,
  type PreexistingServing,
  REPO_ROOT,
  seedDisposableSecrets,
  startPreexistingServing,
  waitHealth,
  writeEvidence,
} from './sprint30-cutover-harness.ts';

if (!PLATFORM_IT) {
  throw new Error('sprint30-convex-live-attestation requires PLATFORM_IT=1');
}

const EVIDENCE = `${REPO_ROOT}/.tmp/D07-02`;

describe('D07-02: cutover:attest-convex-live (UC-SYNC-04 AC-1/AC-2)', () => {
  const priorSecrets = process.env.HOLO_SECRETS_PATH;
  const priorVerify = process.env.HOLO_VERIFY_BASE_URL;
  const priorSoak = process.env.HOLO_SOAK_BASE_URL;
  const priorPlatform = process.env.PLATFORM_URL;
  const priorConvex = process.env.EXPO_PUBLIC_CONVEX_URL;
  let liveServing: PreexistingServing | undefined;

  beforeEach(() => {
    seedDisposableSecrets({ readOnly: '1' });
    process.env.HOLO_SECRETS_PATH = DISPOSABLE_SECRETS;
    delete process.env.HOLO_VERIFY_BASE_URL;
    delete process.env.HOLO_SOAK_BASE_URL;
    delete process.env.PLATFORM_URL;
    liveServing = undefined;
  });

  afterEach(async () => {
    if (liveServing) {
      await liveServing.stop();
      liveServing = undefined;
    }
    if (priorSecrets !== undefined) process.env.HOLO_SECRETS_PATH = priorSecrets;
    else delete process.env.HOLO_SECRETS_PATH;
    if (priorVerify !== undefined) process.env.HOLO_VERIFY_BASE_URL = priorVerify;
    else delete process.env.HOLO_VERIFY_BASE_URL;
    if (priorSoak !== undefined) process.env.HOLO_SOAK_BASE_URL = priorSoak;
    else delete process.env.HOLO_SOAK_BASE_URL;
    if (priorPlatform !== undefined) process.env.PLATFORM_URL = priorPlatform;
    else delete process.env.PLATFORM_URL;
    if (priorConvex !== undefined) process.env.EXPO_PUBLIC_CONVEX_URL = priorConvex;
    else delete process.env.EXPO_PUBLIC_CONVEX_URL;
  });

  it('AC-1: 3-tick window ok when Convex reachable and writes blocked every tick', async () => {
    seedDisposableSecrets({ readOnly: '1' });
    liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
    await waitHealth(liveServing.baseUrl);

    const evidencePath = `${EVIDENCE}/convex-live-attestation.jsonl`;
    const reportPath = `${EVIDENCE}/attestation-report.json`;

    const report = await runAttestConvexLive({
      ticks: 3,
      intervalMs: 200,
      baseUrl: liveServing.baseUrl,
      evidencePath,
      reportPath,
      cwd: REPO_ROOT,
      skipSleep: false,
    });

    writeEvidence('ac1-attest-report.json', report, EVIDENCE);

    expect(report.ticks.length).toBe(3);
    expect(report.ticks.length).not.toBe(0);
    for (const t of report.ticks) {
      expect(t.reachable).toBe(true);
      expect(t.writes_blocked).toBe(true);
      expect(t.write_probe_status).toBe(423);
      expect(t.write_probe_body?.code).toBe('migration_read_only');
    }
    expect(report.ok).toBe(true);

    const chain = verifyAttestationHashChain(evidencePath);
    expect(chain.ok).toBe(true);
    expect(chain.lines).toBe(3);
  }, 120_000);

  it('AC-1-negative: unreachable Convex target → ok:false CONVEX_UNREACHABLE', async () => {
    // Bind then close an ephemeral port so the URL is genuinely unreachable.
    const closedPort = await new Promise<number>((resolve, reject) => {
      const s = createServer();
      s.listen(0, '127.0.0.1', () => {
        const addr = s.address();
        if (!addr || typeof addr === 'string') {
          s.close();
          reject(new Error('no port'));
          return;
        }
        const port = addr.port;
        s.close(() => resolve(port));
      });
    });

    process.env.EXPO_PUBLIC_CONVEX_URL = `http://127.0.0.1:${closedPort}`;
    process.env.CONVEX_URL = `http://127.0.0.1:${closedPort}`;

    seedDisposableSecrets({ readOnly: '1' });
    liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
    await waitHealth(liveServing.baseUrl);

    const report = await runAttestConvexLive({
      ticks: 2,
      intervalMs: 50,
      baseUrl: liveServing.baseUrl,
      evidencePath: `${EVIDENCE}/ac1-neg-attestation.jsonl`,
      reportPath: `${EVIDENCE}/ac1-neg-report.json`,
      cwd: REPO_ROOT,
      skipSleep: true,
    });

    writeEvidence('ac1-neg-report.json', report, EVIDENCE);

    expect(report.ok).toBe(false);
    expect(report.error?.code).toBe(CONVEX_UNREACHABLE);
    expect(report.ticks.length).toBe(2);
    expect(report.ticks.length).not.toBe(0);
    expect(report.ticks[0]?.reachable).toBe(false);
  }, 90_000);

  it('hash-chain: durable evidence file hash-chains every recorded tick', async () => {
    seedDisposableSecrets({ readOnly: '1' });
    liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
    await waitHealth(liveServing.baseUrl);

    const evidencePath = `${EVIDENCE}/hash-chain-attestation.jsonl`;
    const report = await runAttestConvexLive({
      ticks: 3,
      intervalMs: 50,
      baseUrl: liveServing.baseUrl,
      evidencePath,
      reportPath: `${EVIDENCE}/hash-chain-report.json`,
      cwd: REPO_ROOT,
      skipSleep: true,
    });

    expect(report.ticks.length).toBe(3);
    // tick[0].prev_hash is genesis zeros
    expect(report.ticks[0]?.prev_hash).toBe('0'.repeat(64));
    // tick[i].prev_hash === sha256(canonical(tick[i-1]))
    expect(report.ticks[1]?.prev_hash).toBe(sha256Hex(canonicalTick(report.ticks[0]!)));
    expect(report.ticks[2]?.prev_hash).toBe(sha256Hex(canonicalTick(report.ticks[1]!)));
    // Also equals hashTick helper
    expect(report.ticks[2]?.prev_hash).toBe(hashTick(report.ticks[1]!));

    const chain = verifyAttestationHashChain(evidencePath);
    expect(chain.ok).toBe(true);
    expect(chain.lines).toBe(3);

    // Evidence path matches default under .tmp/D07-02 when using default
    expect(defaultAttestationEvidencePath(REPO_ROOT)).toContain('.tmp/D07-02');
  }, 90_000);

  it('AC-2: every tick write probe returns 423 migration_read_only while fence armed', async () => {
    seedDisposableSecrets({ readOnly: '1' });
    writeDurableMigrationReadOnly('1', { secretsPath: DISPOSABLE_SECRETS });
    liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
    await waitHealth(liveServing.baseUrl);

    const report = await runAttestConvexLive({
      ticks: 3,
      intervalMs: 100,
      baseUrl: liveServing.baseUrl,
      evidencePath: `${EVIDENCE}/ac2-attestation.jsonl`,
      reportPath: `${EVIDENCE}/ac2-report.json`,
      cwd: REPO_ROOT,
      skipSleep: true,
    });

    writeEvidence('ac2-report.json', report, EVIDENCE);

    expect(report.ticks.length).toBe(3);
    expect(report.ticks.length).not.toBe(0);
    for (const t of report.ticks) {
      expect(t.writes_blocked).toBe(true);
      expect(t.write_probe_status).toBe(423);
      expect(t.write_probe_body?.code).toBe('migration_read_only');
      expect(t.write_probe_status).not.toBe(200);
      expect(t.write_probe_status).not.toBe(201);
    }
  }, 90_000);

  it('AC-2-negative: mid-window disarm is caught (WRITES_NOT_BLOCKED)', async () => {
    seedDisposableSecrets({ readOnly: '1' });
    writeDurableMigrationReadOnly('1', { secretsPath: DISPOSABLE_SECRETS });
    liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
    await waitHealth(liveServing.baseUrl);

    const report = await runAttestConvexLive({
      ticks: 3,
      intervalMs: 50,
      baseUrl: liveServing.baseUrl,
      evidencePath: `${EVIDENCE}/ac2-neg-attestation.jsonl`,
      reportPath: `${EVIDENCE}/ac2-neg-report.json`,
      cwd: REPO_ROOT,
      skipSleep: true,
      onBeforeTick: async (i) => {
        // Before tick 2 (index 1), disarm the durable fence the live server re-reads.
        if (i === 1) {
          writeDurableMigrationReadOnly('0', { secretsPath: DISPOSABLE_SECRETS });
        }
      },
    });

    writeEvidence('ac2-neg-report.json', report, EVIDENCE);

    expect(report.ticks.length).toBe(3);
    expect(report.ticks.length).not.toBe(0);
    expect(report.ok).toBe(false);
    expect(report.error?.code).toBe(WRITES_NOT_BLOCKED);
    expect(report.ticks[1]?.writes_blocked).toBe(false);
    expect(report.ticks[1]?.write_probe_status).toBe(201);
  }, 90_000);

  it('CLI: cutover:attest-convex-live --json is registered and emits ticks', async () => {
    seedDisposableSecrets({ readOnly: '1' });
    liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
    await waitHealth(liveServing.baseUrl);

    const env = holoEnv(liveServing.baseUrl, liveServing.pid);
    const r = holo(
      [
        'cutover:attest-convex-live',
        '--ticks',
        '2',
        '--interval-ms',
        '100',
        '--json',
        '--output',
        `${EVIDENCE}/cli-attest-report.json`,
      ],
      env
    );

    writeEvidence(
      'cli-attest-stdout.txt',
      { status: r.status, stdout: r.stdout, stderr: r.stderr },
      EVIDENCE
    );

    // Verb must be known (not "unknown command")
    expect(r.stderr + r.stdout).not.toMatch(/unknown command/i);
    const parsed = JSON.parse(r.stdout || '{}') as {
      ok?: boolean;
      ticks?: unknown[];
      error?: { code?: string };
    };
    expect(Array.isArray(parsed.ticks)).toBe(true);
    expect((parsed.ticks ?? []).length).toBe(2);
  }, 120_000);
});
