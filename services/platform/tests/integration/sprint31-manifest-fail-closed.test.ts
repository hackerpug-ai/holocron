/**
 * S31-06 AC-2 + AC-3: manifest overclaim fails closed at startup; reconciled
 * committed manifest matches the live fleet with zero drift.
 *
 * NEGATIVE_CONTROL (would fail if):
 * - stub probe / static pass verdict / mock fleet / removed startup guard
 * - comparison against a cached or fixture probe map
 * - service becomes health-ready on an overclaiming manifest
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint31-manifest-fail-closed.test.ts
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUN_BIN,
  HOLO_CLI,
  PLATFORM_IT,
  REPO_ROOT,
  runHolo,
} from '../../../../tests/integration/service/harness';
import { loadFleetManifest } from '../../src/fleet/manifest';
import type { FleetRoleManifest } from '../../src/fleet/manifest.schema';
import { compareManifestToProbe, type RoleCapability } from '../../src/inference/probe-capability';

const FLEET_TIMEOUT = 420_000;
const BOOT_TIMEOUT = 300_000;
const itLive = PLATFORM_IT ? it : it.skip;

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-06/probe');
const TMP_DIR = resolve(REPO_ROOT, '.tmp/S31-06');
const COMMITTED_MANIFEST = resolve(REPO_ROOT, 'services/platform/fleet/manifest.json');
const FLEET_MODELS = 'http://127.0.0.1:4545/v1/models';

type RoleCap = RoleCapability;

function parseJsonOut(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  if (start < 0) throw new Error(`no JSON object in output:\n${text}`);
  return JSON.parse(trimmed.slice(start)) as Record<string, unknown>;
}

function writeArtifact(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = join(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close();
        reject(new Error('failed to bind ephemeral port'));
        return;
      }
      const port = addr.port;
      srv.close((err) => (err ? reject(err) : resolvePort(port)));
    });
  });
}

/**
 * Spawn `holo service:up` against a specific manifest. Returns exit metadata
 * plus whether /health ever returned 200 during the wait window.
 */
async function spawnServiceUp(options: {
  manifestPath: string;
  port: number;
  waitMs: number;
}): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  health200Count: number;
}> {
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;
  let exited = false;
  let health200Count = 0;

  const child: ChildProcess = spawn(BUN_BIN, [HOLO_CLI, 'service:up'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(options.port),
      HOLO_PORT: String(options.port),
      FLEET_MANIFEST_PATH: options.manifestPath,
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod',
      HOLO_KEY_RN: process.env.HOLO_KEY_RN ?? 'rn-test',
      HOLO_KEY_MCP: process.env.HOLO_KEY_MCP ?? 'mcp-test',
      HOLO_KEY_CONTROL: process.env.HOLO_KEY_CONTROL ?? 'ctl-test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (buf: Buffer) => {
    stdout += buf.toString('utf8');
  });
  child.stderr?.on('data', (buf: Buffer) => {
    stderr += buf.toString('utf8');
  });
  child.on('exit', (code) => {
    exited = true;
    exitCode = code;
  });

  const baseUrl = `http://127.0.0.1:${options.port}`;
  const deadline = Date.now() + options.waitMs;

  while (Date.now() < deadline && !exited) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2_000) });
      if (res.status === 200) health200Count += 1;
    } catch {
      // not ready / connection refused — expected during fail-closed boot
    }
    if (health200Count > 0 && !exited) {
      // Reconciled path: healthy — stop waiting once we observed 200.
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  // Always terminate if still running.
  if (!exited) {
    child.kill('SIGTERM');
    const killDeadline = Date.now() + 3_000;
    while (!exited && Date.now() < killDeadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!exited) child.kill('SIGKILL');
    // Wait briefly for exit code.
    await new Promise((r) => setTimeout(r, 200));
  }

  return { exitCode, stdout, stderr, health200Count };
}

describe('S31-06 AC-2: unconfirmable declared capability is a startup error', () => {
  itLive(
    'manifestFailsClosedOnUnconfirmedCapability',
    async () => {
      const models = await fetch(FLEET_MODELS, { signal: AbortSignal.timeout(10_000) });
      expect(models.status).toBe(200);

      mkdirSync(TMP_DIR, { recursive: true });
      const overclaimPath = join(TMP_DIR, 'manifest-overclaim.json');
      const raw = JSON.parse(readFileSync(COMMITTED_MANIFEST, 'utf8')) as FleetRoleManifest;
      // Flip embed structuredOutput false → true (probe cannot confirm for embed).
      raw.roles.embed.structuredOutput = true;
      writeFileSync(overclaimPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
      writeArtifact('manifest-overclaim.json', raw);

      const port = await freePort();
      // Fail-closed should exit during the probe (before Listening). Bound wait.
      const result = await spawnServiceUp({
        manifestPath: overclaimPath,
        port,
        waitMs: 240_000,
      });
      writeArtifact('ac2-overclaim-service.json', {
        exitCode: result.exitCode,
        health200Count: result.health200Count,
        stderr: result.stderr.slice(0, 4000),
        stdout: result.stdout.slice(0, 2000),
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.exitCode).not.toBeNull();
      const combined = `${result.stderr}\n${result.stdout}`;
      expect(combined).toMatch(/MANIFEST_CAPABILITY_UNCONFIRMED/);
      expect(combined).toMatch(/embed/);
      expect(result.health200Count).toBe(0);
      // Must not log a silent repair downgrade and continue.
      expect(combined).not.toMatch(/downgrad(?:e|ing).*repair.*continu/i);

      // Positive control: reconciled committed manifest reaches /health 200.
      const okPort = await freePort();
      const ok = await spawnServiceUp({
        manifestPath: COMMITTED_MANIFEST,
        port: okPort,
        waitMs: 240_000,
      });
      writeArtifact('ac2-reconciled-service.json', {
        exitCode: ok.exitCode,
        health200Count: ok.health200Count,
        stderr: ok.stderr.slice(0, 2000),
        stdout: ok.stdout.slice(0, 2000),
      });
      expect(ok.health200Count).toBeGreaterThanOrEqual(1);
      expect(`${ok.stderr}\n${ok.stdout}`).not.toMatch(/MANIFEST_CAPABILITY_UNCONFIRMED/);
    },
    BOOT_TIMEOUT + FLEET_TIMEOUT
  );
});

describe('S31-06 AC-3: committed manifest matches live fleet with zero drift', () => {
  itLive(
    'manifestMatchesLiveFleet',
    async () => {
      const models = await fetch(FLEET_MODELS, { signal: AbortSignal.timeout(10_000) });
      expect(models.status).toBe(200);

      const probeRun = runHolo(['probe:capabilities', '--json']);
      expect(probeRun.status).toBe(0);
      const probeJson = parseJsonOut(probeRun.stdout);
      expect(probeJson.ok).toBe(true);
      const capabilities = probeJson.capabilities as Record<string, RoleCap>;
      writeArtifact('ac3-live-probe.json', probeJson);

      const roles = Object.keys(capabilities);
      expect(roles).toHaveLength(6);
      for (const role of roles) {
        const cap = capabilities[role];
        expect(cap).toBeDefined();
        if (!cap) continue;
        expect(cap.endpoint).toBeTruthy();
        expect(cap.endpoint).not.toMatch(/placeholder|\(probe failed\)/i);
        expect(cap.litellmModelId).toBeTruthy();
        expect(cap.litellmModelId).not.toMatch(/placeholder|\(probe failed\)/i);
      }

      const manifest = loadFleetManifest(COMMITTED_MANIFEST);
      const drift = compareManifestToProbe(manifest, capabilities);
      writeArtifact('ac3-drift.json', { drift, roleCount: roles.length });
      expect(drift).toHaveLength(0);

      // Deliberately flip divergent structuredOutput and re-compare against the
      // same live probe map → exactly 1 named drift entry.
      const flipped = structuredClone(manifest) as FleetRoleManifest;
      const original = flipped.roles.divergent.structuredOutput;
      flipped.roles.divergent.structuredOutput = !original;
      const flippedDrift = compareManifestToProbe(flipped, capabilities);
      writeArtifact('ac3-flipped-drift.json', {
        flippedRole: 'divergent',
        original,
        flippedTo: flipped.roles.divergent.structuredOutput,
        drift: flippedDrift,
      });
      expect(flippedDrift).toHaveLength(1);
      const entry = flippedDrift[0];
      expect(entry).toBeDefined();
      expect(entry?.role).toBe('divergent');
      expect(entry?.declared).toBe(flipped.roles.divergent.structuredOutput);
      expect(entry?.probed).toBe(capabilities.divergent?.mode === 'constrained');
    },
    FLEET_TIMEOUT
  );
});

describe('S31-06 gating', () => {
  it('PLATFORM_IT gate is required for live fleet assertions', () => {
    expect(typeof PLATFORM_IT).toBe('boolean');
    expect(BUN_BIN).toBeTruthy();
    expect(HOLO_CLI).toContain('holo.ts');
    expect(readFileSync(COMMITTED_MANIFEST, 'utf8')).toMatch(/schemaVersion/);
  });
});
