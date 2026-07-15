/**
 * RH-1 — consolidated secrets applied at Mastra service:up (real process + curl).
 *
 * RED (pre-fix): launchd/service:up without HOLO_KEY_* in env → Bearer from
 * secrets.yaml → 401 "unknown API key".
 * GREEN: startService loads secrets into process.env before middleware → same
 * Bearer is accepted (not "unknown API key").
 *
 * Uses a real Bun service:up subprocess with a launchd-like clean env (no
 * HOLO_KEY_*), secrets.yaml on disk, and real curl. No mocks.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/mastra-secrets-runtime.test.ts
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BUN_BIN, HOLO_CLI, PLATFORM_IT, REPO_ROOT, runCmd, runHolo } from './fixtures/harness';

const itLive = PLATFORM_IT ? it : it.skip;

const SECRETS_PATH = resolve(REPO_ROOT, 'services/platform/config/secrets.yaml');
const SECRETS_EXAMPLE = resolve(REPO_ROOT, 'services/platform/config/secrets.example.yaml');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-RH-1');

function ensureSecretsYaml(): void {
  if (existsSync(SECRETS_PATH)) return;
  if (!existsSync(SECRETS_EXAMPLE)) {
    throw new Error(`missing secrets schema: ${SECRETS_EXAMPLE}`);
  }
  writeFileSync(SECRETS_PATH, readFileSync(SECRETS_EXAMPLE, 'utf8'), 'utf8');
}

function readSecretKey(key: string): string {
  ensureSecretsYaml();
  const text = readFileSync(SECRETS_PATH, 'utf8');
  const re = new RegExp(`${key}:\\s*["']?([^\\s"']+)`);
  const m = re.exec(text);
  if (!m?.[1]) throw new Error(`${key} not found in secrets.yaml`);
  return m[1];
}

async function freePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      if (!addr || typeof addr === 'string') {
        s.close();
        reject(new Error('failed to bind ephemeral port'));
        return;
      }
      const port = addr.port;
      s.close((err) => (err ? reject(err) : resolvePort(port)));
    });
    s.on('error', reject);
  });
}

async function waitForHealth(port: number, timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    // -s only (not -f): /health may be degraded but still proves the process is up
    const r = runCmd('curl', ['-s', '--max-time', '2', `http://127.0.0.1:${port}/health`]);
    last = `status=${r.status} body=${r.stdout.slice(0, 200)} err=${r.stderr.slice(0, 120)}`;
    if (
      r.status === 0 &&
      r.stdout.length > 0 &&
      !/Could not connect|Connection refused/i.test(r.combined)
    ) {
      return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Mastra /health not ready on :${port} within ${timeoutMs}ms. last=${last}`);
}

function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    process.kill(child.pid, 'SIGTERM');
  } catch {
    // already dead
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // no process group
  }
}

function curlScoped(port: number, bearer: string, outName: string): { code: string; body: string } {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const bodyPath = resolve(EVIDENCE_DIR, outName);
  const curl = runCmd('curl', [
    '-s',
    '-o',
    bodyPath,
    '-w',
    '%{http_code}',
    '-H',
    `Authorization: Bearer ${bearer}`,
    `http://127.0.0.1:${port}/api/missions`,
  ]);
  const code = curl.stdout.trim();
  const body = existsSync(bodyPath) ? readFileSync(bodyPath, 'utf8') : curl.stderr;
  return { code, body };
}

describe('RH-1: consolidated secrets applied at service:up (real process + curl)', () => {
  const children: ChildProcess[] = [];
  afterAll(() => {
    for (const c of children) killTree(c);
  });

  itLive(
    'service:up with launchd-like clean env accepts Bearer HOLO_KEY_RN from secrets.yaml',
    async () => {
      ensureSecretsYaml();
      const rnKey = readSecretKey('HOLO_KEY_RN');
      expect(rnKey.length, 'HOLO_KEY_RN must be non-empty').toBeGreaterThan(0);

      mkdirSync(EVIDENCE_DIR, { recursive: true });
      const port = await freePort();
      const logPath = resolve(EVIDENCE_DIR, `service-up-${port}.log`);

      // Launchd-like clean env: NO HOLO_KEY_*, NO MASTRA_API_KEY, NO FLEET_KEY.
      // Fix must load them from secrets.yaml at process start.
      const child = spawn(BUN_BIN, [HOLO_CLI, 'service:up'], {
        cwd: REPO_ROOT,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          PATH: process.env.PATH ?? '/usr/bin:/bin:/opt/homebrew/bin',
          HOME: process.env.HOME ?? '',
          USER: process.env.USER ?? '',
          TMPDIR: process.env.TMPDIR ?? '/tmp',
          LANG: process.env.LANG ?? 'en_US.UTF-8',
          HOLO_ROOT: REPO_ROOT,
          DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron',
          PORT: String(port),
          FLEET_URL: 'http://127.0.0.1:4545/v1',
        },
      });
      children.push(child);
      if (!child.pid) throw new Error('failed to spawn service:up');

      let logBuf = '';
      child.stdout?.on('data', (d: Buffer) => {
        logBuf += d.toString();
      });
      child.stderr?.on('data', (d: Buffer) => {
        logBuf += d.toString();
      });
      child.on('exit', (code, signal) => {
        logBuf += `\n[exit code=${code} signal=${signal}]\n`;
        try {
          writeFileSync(logPath, logBuf, 'utf8');
        } catch {
          // best-effort evidence
        }
      });

      try {
        await waitForHealth(port);
      } catch (err) {
        writeFileSync(logPath, logBuf, 'utf8');
        throw new Error(
          `${err instanceof Error ? err.message : String(err)}\n--- service log ---\n${logBuf.slice(-2000)}`
        );
      }

      const { code, body } = curlScoped(port, rnKey, `it-missions-${port}.json`);
      writeFileSync(
        resolve(EVIDENCE_DIR, `it-missions-${port}.meta.txt`),
        `HTTP_${code}\n${body}\n`,
        'utf8'
      );

      // Must NOT be the pre-fix failure mode
      expect(body, `body must not be unknown API key (HTTP ${code})`).not.toMatch(
        /unknown API key/i
      );
      expect(code, `expected HTTP 200 after scoped auth; body=${body}`).toBe('200');

      killTree(child);
    },
    90_000
  );

  itLive(
    'holo stack up Mastra accepts doctor-resolved HOLO_KEY_RN (runtime, not just doctor)',
    async () => {
      ensureSecretsYaml();
      const doctor = runHolo(['secrets', 'doctor']);
      expect(doctor.status, `secrets doctor must pass: ${doctor.combined}`).toBe(0);
      expect(doctor.combined).toMatch(/HOLO_KEY_RN\s*:\s*resolved/i);

      const rnKey = readSecretKey('HOLO_KEY_RN');
      const uid = process.getuid?.() ?? 501;

      // Force mastra restart so stack up re-materializes plists with worktree HOLO_ROOT
      // (fast-path "already healthy" would leave main-clone code without RH-1 fix).
      runCmd('launchctl', ['bootout', `gui/${uid}/holocron-mastra`], { timeoutMs: 15_000 });
      // brief settle so probeMastra sees down
      await new Promise((r) => setTimeout(r, 500));

      const up = runHolo(['stack', 'up'], {
        env: {
          HOLO_ROOT: REPO_ROOT,
          DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron',
        },
        timeoutMs: 90_000,
      });
      expect(up.status, `stack up failed: ${up.combined}`).toBe(0);
      writeFileSync(resolve(EVIDENCE_DIR, 'it-stack-up.txt'), up.combined, 'utf8');

      // Confirm launchd now points at this worktree (or at least process is up)
      const print = runCmd('launchctl', ['print', `gui/${uid}/holocron-mastra`], {
        timeoutMs: 10_000,
      });
      writeFileSync(resolve(EVIDENCE_DIR, 'it-launchctl-print.txt'), print.combined, 'utf8');

      await waitForHealth(4111, 45_000);

      const { code, body } = curlScoped(4111, rnKey, 'it-stack-missions-body.json');
      writeFileSync(
        resolve(EVIDENCE_DIR, 'it-stack-missions.meta.txt'),
        `HTTP_${code}\n${body}\n`,
        'utf8'
      );

      expect(
        body,
        `stack Mastra must not reject secrets.yaml key: HTTP ${code} ${body}`
      ).not.toMatch(/unknown API key/i);
      expect(code, `expected HTTP 200; body=${body}`).toBe('200');
    },
    120_000
  );
});
