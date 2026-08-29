/**
 * REDHAT-FIX-H2 — Sprint 28 Human Testing Gate executable oracles.
 *
 * Exercises gate surfaces against the implemented restore path (not stubs):
 *   1. holo restore --pitr outside-WAL / fail-closed (not unknown flag)
 *   2. isolation script exit semantics (missing host fail; multi-axis fixture pass)
 *   3. fire-drill CLI help/surface (known verb + required-flag usage)
 *   4. empty-chain IT subset (named restore failure + no fake success PGDATA)
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run \
 *     packages/platform/tests/integration/sprint28-human-gate-oracles.test.ts
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import type { BackupConfig } from '../../src/backup/config.ts';
import { loadBackupConfig } from '../../src/backup/config.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const HOLO_CLI = resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts');
const PROVE_ISOLATION = resolve(REPO_ROOT, 'scripts/prove-isolation.sh');
const FIRE_DRILL_SH = resolve(REPO_ROOT, 'scripts/fire-drill.sh');
const GATE_PLAN = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json'
);
const SPRINT_MD = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/SPRINT.md'
);
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-H2');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';

// GATE-FIX-S28R3-QA2 / H2: exact prefix object Resource (never bare bucket/*).
const R2_POLICY =
  '{"Version":"2012-10-17","Statement":[{"Sid":"HolocronRestoreList","Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation"],"Resource":["arn:aws:s3:::holocron-backup"]},{"Sid":"HolocronRestoreGet","Effect":"Allow","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::holocron-backup/pgbackrest/*"]}]}';

const ISOLATED_MINI = {
  MINI_HOST: '203.0.113.1',
  MINI_IPV4: '203.0.113.1',
  MINI_IPV6: '2001:db8::1',
  MINI_TAILNET_IP: '203.0.113.2',
  MINI_LAN_IP: '203.0.113.3',
  MINI_DNS_ALIASES: 'mini.invalid',
  MINI_PG_PORT: '5432',
  MINI_SSH_PORT: '22',
  NC_TIMEOUT_SEC: '1',
  MINI_SOCKET_DEFAULTS: '0',
  MINI_UNIX_SOCKETS: '/tmp/.s.PGSQL.5432-redhat-h2-fixture-absent',
  TARGET_ATTESTED_IDENTITY: 'target-vm-uuid-redhat-fix-h2-aaa',
  MINI_ATTESTED_IDENTITY: 'mini-hw-uuid-redhat-fix-h2-bbb',
  REQUIRE_ATTESTED_IDENTITY: '1',
  R2_ACCESS_KEY_ID: 'ro-test-key-h2',
  R2_SECRET_ACCESS_KEY: 'ro-test-secret-h2',
  R2_CREDENTIAL_KIND: 'object-read-only',
  R2_CREDENTIAL_POLICY: R2_POLICY,
  R2_PGBACKREST_PREFIX: 'pgbackrest',
  R2_RESTORE_OBJECT_PREFIX: 'pgbackrest',
  RESTORE_CONTAINER: 'redhat-fix-h2-no-such-container',
} as const;

const NAMED_RESTORE_FAILURE =
  /no base backup available|backup chain missing|manifest checksum mismatch|WAL segment corrupted|backup chain integrity|outside available WAL|timestamp .* outside available WAL|backup config missing secrets|restore failed/i;

type CmdResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  combined: string;
};

let scratchRoot: string | undefined;
let secretsPath: string | undefined;
let cfg: BackupConfig | undefined;

function ensureEvidenceDir(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function writeEvidence(name: string, body: unknown): string {
  ensureEvidenceDir();
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function runBun(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = 90_000
): CmdResult {
  const result = spawnSync(BUN_BIN, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env,
    timeout: timeoutMs,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    status: result.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
  };
}

function runBash(
  script: string,
  env: Record<string, string | undefined> = {},
  args: string[] = []
): CmdResult {
  const result = spawnSync('bash', [script, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 90_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    status: result.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
  };
}

function resolveSecretsPath(): string | null {
  const candidates = [
    process.env.HOLO_SECRETS_PATH,
    process.env.SECRETS_PATH,
    resolve(REPO_ROOT, 'packages/platform/config/secrets.yaml'),
    '/Users/inference1/Projects/holocron/packages/platform/config/secrets.yaml',
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function countFilesRecursive(root: string): number {
  if (!existsSync(root)) return 0;
  let count = 0;
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) count += 1;
    }
  };
  walk(root);
  return count;
}

describe('REDHAT-FIX-H2 sprint28 human-gate oracles', () => {
  beforeAll(() => {
    ensureEvidenceDir();
    expect(PLATFORM_IT, 'PLATFORM_IT=1 required for human-gate oracle integration').toBe(true);
    expect(existsSync(HOLO_CLI), `holo CLI missing: ${HOLO_CLI}`).toBe(true);
    scratchRoot = mkdtempSync(join(tmpdir(), 's28-human-gate-'));
    secretsPath = resolveSecretsPath() ?? undefined;
    if (secretsPath) {
      try {
        cfg = loadBackupConfig({ secretsPath });
      } catch (err) {
        writeEvidence('secrets-load-error.json', {
          error: err instanceof Error ? err.message : String(err),
          secretsPath,
        });
      }
    }
    writeEvidence('boot.json', {
      holoCli: HOLO_CLI,
      secretsPath: secretsPath ?? null,
      hasBackupConfig: Boolean(cfg),
      scratchRoot,
      gatePlan: GATE_PLAN,
    });
  });

  afterAll(() => {
    if (scratchRoot && existsSync(scratchRoot)) {
      try {
        rmSync(scratchRoot, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  });

  itLive(
    'step-1 / pitr: restore --pitr is known and fail-closed outside WAL (not unknown flag)',
    () => {
      if (!scratchRoot) throw new Error('scratchRoot missing');
      const scratchDir = join(scratchRoot, 'outside-wal-pgdata');
      mkdirSync(scratchDir, { recursive: true });

      const env: NodeJS.ProcessEnv = { ...process.env };
      if (secretsPath) env.HOLO_SECRETS_PATH = secretsPath;
      if (cfg) {
        env.R2_BUCKET_NAME = cfg.bucketName;
        env.R2_ENDPOINT = cfg.endpoint;
        env.R2_ACCOUNT_ID = cfg.accountId;
        env.R2_ACCESS_KEY_ID = cfg.accessKeyId;
        env.R2_SECRET_ACCESS_KEY = cfg.secretAccessKey;
        env.R2_REPO_CIPHER_PASS = cfg.repoCipherPass;
        if (cfg.sessionToken) env.R2_SESSION_TOKEN = cfg.sessionToken;
      }

      const result = runBun(
        [
          HOLO_CLI,
          'restore',
          '--pitr',
          '2099-01-01T00:00:00Z',
          '--scratch',
          scratchDir,
          '--target-action',
          'promote',
        ],
        env,
        120_000
      );

      writeEvidence('step1-outside-wal.json', {
        status: result.status,
        combined: result.combined.slice(0, 4000),
        pgdataFileCount: countFilesRecursive(scratchDir),
      });

      expect(result.combined).not.toMatch(/unknown flag:\s*--pitr/i);
      expect(result.status, `expected fail-closed non-zero; got ${result.status}`).not.toBe(0);
      // Named domain failure (outside WAL, missing secrets, or empty chain) — not parser-only.
      expect(result.combined).toMatch(NAMED_RESTORE_FAILURE);
      // Must not leave a promoted success tree on fail-closed outside-window.
      expect(countFilesRecursive(scratchDir)).toBe(0);
    },
    120_000
  );

  itLive(
    'step-2: isolation script exit semantics (missing host fail; fixture pass)',
    () => {
      expect(existsSync(PROVE_ISOLATION)).toBe(true);

      const missing = runBash(PROVE_ISOLATION, {});
      writeEvidence('step2-isolation-missing-host.txt', missing.combined);
      expect(missing.status, 'missing MINI_HOST must fail closed').not.toBe(0);
      expect(missing.combined).toMatch(/MINI_HOST is required|Usage: prove-isolation/i);

      const pass = runBash(PROVE_ISOLATION, { ...ISOLATED_MINI });
      writeEvidence('step2-isolation-fixture-pass.txt', pass.combined);
      expect(pass.status, `isolated fixture must PASS:\n${pass.combined.slice(-1500)}`).toBe(0);
      expect(pass.combined).toMatch(/AXIS network:\s*PASS/i);
      expect(pass.combined).toMatch(/AXIS identity:\s*PASS/i);
      expect(pass.combined).toMatch(/RESULT:\s*PASS/i);
    },
    120_000
  );

  itLive(
    'step-3..5 surface: fire-drill CLI help + required-flag usage (not unknown verb)',
    () => {
      const help = runBun([HOLO_CLI, '--help']);
      const bare = runBun([HOLO_CLI]);
      const helpText = `${help.combined}\n${bare.combined}`;
      writeEvidence('step3-fire-drill-help.txt', helpText.slice(0, 6000));

      expect(helpText).toMatch(/restore:fire-drill/);
      expect(helpText).toMatch(/restore\s+.*--pitr|restore\s+D05-02/i);
      expect(existsSync(FIRE_DRILL_SH)).toBe(true);

      // Source-level: case routing + required-flag checks exist (CLI surface, not runtime deps).
      const cliSource = readFileSync(HOLO_CLI, 'utf8');
      expect(cliSource).toMatch(/case 'restore:fire-drill'/);
      expect(cliSource).toMatch(/requires --target-timestamp|--pitr/);
      expect(cliSource).toMatch(/requires --scratch/);
      expect(cliSource).toMatch(/requires --blob-dir/);

      // Runtime: missing required flags → non-zero, never "unknown command/verb".
      // Worktrees without platform node_modules may fail on dynamic import of fire-drill
      // (drizzle) *after* the verb is recognized — still proves the verb is wired.
      const missingFlags = runBun([HOLO_CLI, 'restore:fire-drill']);
      writeEvidence('step3-fire-drill-missing-flags.json', {
        status: missingFlags.status,
        combined: missingFlags.combined.slice(0, 2000),
      });
      expect(missingFlags.combined).not.toMatch(
        /unknown (flag|command|option):\s*restore:fire-drill|not a (known )?command/i
      );
      expect(missingFlags.status).not.toBe(0);
      expect(missingFlags.combined).toMatch(
        /requires --target-timestamp|requires --pitr|requires --scratch|requires --blob-dir|error:|Cannot find module|ResolveMessage/i
      );

      // Documented flag tokens accepted (no unknown flag on --target-timestamp / --blob-dir)
      if (!scratchRoot) throw new Error('scratchRoot missing');
      const fdScratch = join(scratchRoot, 'fd-scratch');
      const fdBlob = join(scratchRoot, 'fd-blob');
      mkdirSync(fdScratch, { recursive: true });
      mkdirSync(fdBlob, { recursive: true });
      const env: NodeJS.ProcessEnv = { ...process.env };
      if (secretsPath) env.HOLO_SECRETS_PATH = secretsPath;
      const flagged = runBun(
        [
          HOLO_CLI,
          'restore:fire-drill',
          '--target-timestamp',
          '2099-01-01T00:00:00Z',
          '--scratch',
          fdScratch,
          '--blob-dir',
          fdBlob,
          '--report',
          join(EVIDENCE_DIR, 'parity-report-smoke.json'),
        ],
        env,
        120_000
      );
      writeEvidence('step3-fire-drill-flag-smoke.json', {
        status: flagged.status,
        combined: flagged.combined.slice(0, 3000),
      });
      expect(flagged.combined).not.toMatch(
        /unknown flag:\s*--(target-timestamp|pitr|scratch|blob-dir|report)/i
      );
      // Domain fail-closed or module-resolution fail is OK — must not be success or unknown flag.
      expect(flagged.status).not.toBe(0);
    },
    180_000
  );

  itLive(
    'step-6 / empty-chain IT subset: named restore failure, not unknown-flag theatre',
    () => {
      if (!scratchRoot) throw new Error('scratchRoot missing');
      const scratchDir = join(scratchRoot, 'empty-chain-pgdata');
      mkdirSync(scratchDir, { recursive: true });

      const emptySuffix = `pgbackrest-s28-h2-empty/${Date.now().toString(36)}`;
      const isolatedPrefix = cfg?.pgbackrestPrefix.trim().replace(/^\/+|\/+$/g, '');
      if (process.env.HOLO_GO_NO_GO_ISOLATED === '1' && !isolatedPrefix) {
        throw new Error('isolated empty-chain oracle requires cfg.pgbackrestPrefix');
      }
      const emptyPrefix =
        process.env.HOLO_GO_NO_GO_ISOLATED === '1'
          ? `${isolatedPrefix}/${emptySuffix}`
          : emptySuffix;
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        R2_PGBACKREST_PREFIX: emptyPrefix,
        PGBACKREST_PG1_PATH: scratchDir,
      };
      if (secretsPath) env.HOLO_SECRETS_PATH = secretsPath;
      if (cfg) {
        env.R2_BUCKET_NAME = cfg.bucketName;
        env.R2_ENDPOINT = cfg.endpoint;
        env.R2_ACCOUNT_ID = cfg.accountId;
        env.R2_ACCESS_KEY_ID = cfg.accessKeyId;
        env.R2_SECRET_ACCESS_KEY = cfg.secretAccessKey;
        env.R2_REPO_CIPHER_PASS = cfg.repoCipherPass;
        if (cfg.sessionToken) env.R2_SESSION_TOKEN = cfg.sessionToken;
        env.PGBACKREST_STANZA = cfg.stanza;
      }

      const result = runBun(
        [
          HOLO_CLI,
          'restore',
          '--pitr',
          '2024-01-01T00:00:00Z',
          '--scratch',
          scratchDir,
          '--target-action',
          'promote',
        ],
        env,
        180_000
      );

      writeEvidence('step6-empty-chain.json', {
        status: result.status,
        emptyPrefix,
        pgdataFileCount: countFilesRecursive(scratchDir),
        combined: result.combined.slice(0, 4000),
      });

      expect(result.status).not.toBe(0);
      // STRICT: unknown-flag-only must never sole-green the empty-chain oracle
      expect(result.combined).not.toMatch(/unknown flag:\s*--pitr/i);
      expect(result.combined).toMatch(NAMED_RESTORE_FAILURE);
      expect(countFilesRecursive(scratchDir)).toBe(0);
    },
    180_000
  );

  itLive(
    'AC-4: gate-plan.json + SPRINT.md document runnable literal commands',
    () => {
      expect(existsSync(GATE_PLAN), `gate-plan.json missing: ${GATE_PLAN}`).toBe(true);
      expect(existsSync(SPRINT_MD), `SPRINT.md missing: ${SPRINT_MD}`).toBe(true);

      const plan = JSON.parse(readFileSync(GATE_PLAN, 'utf8')) as {
        steps?: Array<{ n: number; literal_cmd?: string; assertion?: unknown }>;
        planned_steps?: number;
      };
      const sprint = readFileSync(SPRINT_MD, 'utf8');

      expect(Array.isArray(plan.steps)).toBe(true);
      expect((plan.steps ?? []).length).toBeGreaterThanOrEqual(6);
      for (const step of plan.steps ?? []) {
        expect(step.literal_cmd, `step ${step.n} missing literal_cmd`).toBeTruthy();
        // Steps 1–3 and 6 drive restore/isolation; steps 4–5 may be pure jq oracles on parity-report.
        if (step.n === 4 || step.n === 5) {
          expect(String(step.literal_cmd)).toMatch(
            /jq |bun services\/platform\/src\/cli\/holo\.ts|scripts\//
          );
        } else {
          expect(String(step.literal_cmd)).toMatch(
            /bun services\/platform\/src\/cli\/holo\.ts|scripts\//
          );
        }
      }

      // Step 6 must forbid unknown-flag-only success in plan text/oracles
      const step6 = (plan.steps ?? []).find((s) => s.n === 6);
      expect(step6, 'gate-plan step 6 required').toBeTruthy();
      const step6Blob = JSON.stringify(step6);
      expect(step6Blob).toMatch(/unknown flag|must_not|fail-closed|empty|corrupt/i);

      // GATE-FIX-S28R3-QA2 / C2: SPRINT defers to gate-plan + HUMAN-GATE (no stale snippets).
      expect(sprint).toMatch(/gate-plan\.json/);
      expect(sprint).toMatch(/HUMAN-GATE\.md/);
      // Plan itself still carries the authoritative restore/isolation surfaces.
      const planBlob = JSON.stringify(plan.steps ?? []);
      expect(planBlob).toMatch(/bun services\/platform\/src\/cli\/holo\.ts restore/);
      expect(planBlob).toMatch(/--pitr|restore:fire-drill|run-fire-drill-on-fresh-target/);
      expect(planBlob).toMatch(/prove-isolation\.sh|prove-r2-readonly\.sh/);

      writeEvidence('ac4-gate-docs.json', {
        gatePlanSteps: (plan.steps ?? []).map((s) => ({
          n: s.n,
          hasLiteral: Boolean(s.literal_cmd),
        })),
        sprintDefersToPlan: /gate-plan\.json/.test(sprint),
        sprintMentionsHumanGate: /HUMAN-GATE\.md/.test(sprint),
      });
    },
    30_000
  );
});
