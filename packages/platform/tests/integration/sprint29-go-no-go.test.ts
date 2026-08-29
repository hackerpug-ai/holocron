/**
 * D06-02 / REDHAT-FIX-S29-C01 — cutover:go-no-go integration suite.
 *
 * Proves:
 *   AC-1  fail closed on failed gate (overall.ok=false, failed_count>=1)
 *   AC-2  production CLI / DEFAULT_GATE_SPECS path (no echo substitution for green claims)
 *   AC-3  gate-plan step 1 oracle requires overall.ok + failed_count==0 (not length alone)
 *   AC-4  report shape: git_sha, generated_at, 8 gates, failed_count, overall.ok
 *
 * Shape/parser tests may use short real shell subprocesses; they are labeled
 * non-production and MUST NOT be the sole coverage for cutover:go-no-go green.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     packages/platform/tests/integration/sprint29-go-no-go.test.ts
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_GATE_SPECS,
  evaluateGoNoGoOracle,
  formatGoNoGoText,
  type GateSpec,
  GO_NO_GO_GATE_NAMES,
  GO_NO_GO_STEP1_JQ_ORACLE,
  type GoNoGoReport,
  parseVitestCollectedTests,
  runGoNoGo,
} from '../../src/cutover/go-no-go.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const HOLO_CLI = resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/D06-02');
const C01_EVIDENCE = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-C01');
const GATE_PLAN = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json'
);
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const itLive = PLATFORM_IT ? it : it.skip;
const itIsolatedGoNoGo = PLATFORM_IT && process.env.HOLO_GO_NO_GO_ISOLATED === '1' ? it : it.skip;

const FIXTURE_PATH = resolve(REPO_ROOT, 'packages/platform/src/cutover/.tmp-gate-fixture.ts');

const tmpReports: string[] = [];
const transientRoots: string[] = [];

afterEach(() => {
  if (existsSync(FIXTURE_PATH)) {
    rmSync(FIXTURE_PATH, { force: true });
  }
  for (const p of tmpReports.splice(0)) {
    try {
      rmSync(p, { force: true });
    } catch {
      /* ignore */
    }
  }
  for (const p of transientRoots.splice(0)) {
    rmSync(p, { recursive: true, force: true });
  }
});

function isolatedLaneEnv(
  overrides: NodeJS.ProcessEnv = {},
  ambientEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const root = mkdtempSync(resolve(tmpdir(), 's29-go-no-go-test-pg-'));
  transientRoots.push(root);
  const secretsPath = resolve(root, 'secrets.yaml');
  writeFileSync(
    secretsPath,
    'R2_ENDPOINT: https://integration-r2.example.invalid\nR2_BUCKET_NAME: integration-bucket\nR2_PGBACKREST_PREFIX: pgbackrest\n',
    'utf8'
  );
  const env = { ...ambientEnv };
  // Preserve a full operator environment here so the production isolation
  // boundary—not the test helper—must remove broad restore credentials.
  const databaseUrl = 'postgres://integration:integration@127.0.0.1:65432/holocron_nonprod';
  const merged: NodeJS.ProcessEnv = {
    ...env,
    HOLO_GO_NO_GO_CONVEX_DEPLOYMENT: 'local:test-s29',
    HOLO_GO_NO_GO_CONVEX_SITE_URL: 'http://127.0.0.1:3211',
    HOLO_GO_NO_GO_CONVEX_URL: 'http://127.0.0.1:3210',
    HOLO_GO_NO_GO_DATABASE_URL: databaseUrl,
    // Keep owner endpoint aligned with the test DB URL. Ambient human-gate env
    // may inject HOLO_GO_NO_GO_DATABASE_URL_OWNER for :56594; mismatched owner
    // fails createIsolatedIntegrationEnv before shape/boundary gates run.
    HOLO_GO_NO_GO_DATABASE_URL_OWNER: databaseUrl,
    HOLO_GO_NO_GO_PGBACKREST_PG1_PATH: root,
    HOLO_GO_NO_GO_FLEET_URL: 'http://127.0.0.1:4545/v1',
    HOLO_GO_NO_GO_R2_PGBACKREST_PREFIX: 'integration/s29-go-no-go-test',
    // Nested shape/boundary suites do not need a live Zero; production go-no-go
    // still starts Zero via HOLO_GO_NO_GO_START_ZERO when :4848 is down.
    HOLO_GO_NO_GO_START_ZERO: '0',
    HOLO_SECRETS_PATH: secretsPath,
    ...overrides,
  };
  // If a caller overrides only DATABASE_URL, keep OWNER on the same endpoint.
  if (
    overrides.HOLO_GO_NO_GO_DATABASE_URL &&
    overrides.HOLO_GO_NO_GO_DATABASE_URL_OWNER === undefined
  ) {
    merged.HOLO_GO_NO_GO_DATABASE_URL_OWNER = overrides.HOLO_GO_NO_GO_DATABASE_URL;
  }
  return merged;
}

function runHolo(
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }
): { status: number | null; stdout: string; stderr: string; combined: string } {
  const r = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: opts?.cwd ?? REPO_ROOT,
    encoding: 'utf8',
    env: opts?.env ?? process.env,
    timeout: opts?.timeoutMs ?? 120_000,
  });
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  return {
    status: r.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
  };
}

/**
 * Non-production shape helper: real /bin/sh subprocess for parser/AND tests only.
 * NEVER used as the sole production CLI green path (C-01 / D06-02 AC-3).
 */
function shapeEchoGate(
  name: GateSpec['name'],
  script: string,
  kind: GateSpec['kind'] = 'plain'
): GateSpec {
  return {
    name,
    command: `sh -c ${JSON.stringify(script)}`,
    argv: ['sh', '-c', script],
    kind,
  };
}

function loadGatePlanStep1(): { literal_cmd: string; n: number; text: string } {
  const plan = JSON.parse(readFileSync(GATE_PLAN, 'utf8')) as {
    steps: Array<{ n: number; text: string; literal_cmd: string }>;
  };
  const step1 = plan.steps.find((s) => s.n === 1);
  if (!step1) throw new Error('gate-plan step 1 missing');
  return step1;
}

/** Shell-evaluate the post-CLI jq oracle against a report file (C-01). */
function jqStep1Oracle(reportPath: string): {
  status: number | null;
  stdout: string;
} {
  const r = spawnSync('jq', ['-e', GO_NO_GO_STEP1_JQ_ORACLE, reportPath], {
    encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout ?? '' };
}

describe('D06-02 cutover:go-no-go', () => {
  it('DEFAULT_GATE_SPECS enumerates exactly the 8 named production gates (not echo)', () => {
    expect(DEFAULT_GATE_SPECS).toHaveLength(8);
    expect(DEFAULT_GATE_SPECS.map((g) => g.name)).toEqual([...GO_NO_GO_GATE_NAMES]);
    for (const g of DEFAULT_GATE_SPECS) {
      expect(g.command.length, g.name).toBeGreaterThan(0);
      expect(g.argv.length, g.name).toBeGreaterThan(0);
      // Production gates never shell-echo success stubs.
      expect(g.command, g.name).not.toMatch(/\becho\b/);
      expect(g.command, g.name).not.toMatch(/\bprintf\b/);
    }
    // typecheck uses sh -c wrapper for fixture — argv[0] is sh; command string is pnpm tsgo.
    const typecheck = DEFAULT_GATE_SPECS.find((g) => g.name === 'typecheck')!;
    expect(typecheck.command.startsWith('pnpm tsgo')).toBe(true);
    expect(typecheck.argv[0]).toBe('sh');
    // Other production gates invoke pnpm/bun directly (not echo sh wrappers).
    for (const g of DEFAULT_GATE_SPECS.filter((x) => x.name !== 'typecheck')) {
      expect(['pnpm', 'bun'], g.name).toContain(g.argv[0]);
    }
    expect(DEFAULT_GATE_SPECS[0]!.command.startsWith('pnpm biome check')).toBe(true);
    expect(DEFAULT_GATE_SPECS.find((g) => g.name === 'unit')!.command).toContain(
      'pnpm vitest run --project unit'
    );
    expect(DEFAULT_GATE_SPECS.find((g) => g.name === 'integration')!.command).toContain(
      'pnpm vitest run --project integration'
    );
    expect(DEFAULT_GATE_SPECS.find((g) => g.name === 'integration')!.argv).toEqual(
      expect.arrayContaining(['--no-file-parallelism', '--maxWorkers=1'])
    );
    expect(DEFAULT_GATE_SPECS.find((g) => g.name === 'live')!.command).toContain(
      'pnpm vitest run --project live'
    );
  });

  it('parseVitestCollectedTests reads real vitest summary parentheses (never hardcodes)', () => {
    const sample = [
      ' RUN  v4.1.0',
      ' ✓ |unit| foo.test.ts (4 tests) 10ms',
      '',
      ' Test Files  1 passed (1)',
      '      Tests  4 passed (4)',
      '   Duration  100ms',
    ].join('\n');
    expect(parseVitestCollectedTests(sample)).toBe(4);

    const mixed = '      Tests  3 passed | 1 failed (4)\n';
    expect(parseVitestCollectedTests(mixed)).toBe(4);

    expect(parseVitestCollectedTests('')).toBe(0);
    expect(parseVitestCollectedTests('no tests found')).toBe(0);
    expect(parseVitestCollectedTests('Tests  no tests')).toBe(0);
  });

  it('shape-only: runGoNoGo ANDs gate.pass, parses collectedTests, writes durable report', () => {
    // NON-PRODUCTION shape/parser coverage — short real shell gates only.
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const reportPath = resolve(EVIDENCE_DIR, 'unit-shape-go-no-go-report.json');
    tmpReports.push(reportPath);

    const gates: GateSpec[] = [
      shapeEchoGate('lint', 'echo lint-ok; exit 0'),
      shapeEchoGate('typecheck', 'echo typecheck-ok; exit 0'),
      shapeEchoGate(
        'unit',
        'printf "Test Files  1 passed (1)\\n      Tests  2 passed (2)\\n"; exit 0',
        'vitest'
      ),
      shapeEchoGate(
        'integration',
        'printf "Test Files  1 passed (1)\\n      Tests  3 passed (3)\\n"; exit 0',
        'vitest'
      ),
      shapeEchoGate(
        'live',
        'printf "Test Files  1 passed (1)\\n      Tests  1 passed (1)\\n"; exit 0',
        'vitest'
      ),
      shapeEchoGate('lanes', 'echo lanes-ok; exit 0'),
      shapeEchoGate('no-convex-client', 'echo no-convex-client-ok; exit 0'),
      shapeEchoGate('no-convex-env', 'echo no-convex-env-ok; exit 0'),
    ];

    const report = runGoNoGo({
      repoRoot: REPO_ROOT,
      cwd: REPO_ROOT,
      reportPath,
      gates,
      env: isolatedLaneEnv(),
    });

    expect(report.gates).toHaveLength(8);
    expect(report.overall.ok).toBe(true);
    expect(report.failed_count).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.git_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(report.generated_at.length).toBeGreaterThan(0);
    expect(existsSync(reportPath)).toBe(true);
    expect(evaluateGoNoGoOracle(report).ok).toBe(true);

    const unit = report.gates.find((g) => g.name === 'unit');
    expect(unit?.collectedTests).toBe(2);
    expect(unit?.pass).toBe(true);
    expect(unit?.duration_ms).toBeGreaterThan(0);

    // Fail-closed: vitest gate with 0 collectedTests is not pass even if exit 0.
    const emptyVitest = runGoNoGo({
      repoRoot: REPO_ROOT,
      reportPath: resolve(EVIDENCE_DIR, 'empty-vitest-report.json'),
      skipWrite: true,
      gates: [
        shapeEchoGate(
          'unit',
          'printf "Test Files  no tests\\n      Tests  no tests\\n"; exit 0',
          'vitest'
        ),
      ],
    });
    expect(emptyVitest.gates[0]!.collectedTests).toBe(0);
    expect(emptyVitest.gates[0]!.pass).toBe(false);
    expect(emptyVitest.overall.ok).toBe(false);
    expect(emptyVitest.failed_count).toBe(1);
    expect(evaluateGoNoGoOracle(emptyVitest).ok).toBe(false);

    // AND: one failing plain gate flips overall.ok + failed_count
    const oneFail = runGoNoGo({
      repoRoot: REPO_ROOT,
      skipWrite: true,
      gates: [
        shapeEchoGate('lint', 'echo ok; exit 0'),
        shapeEchoGate('typecheck', 'echo boom; exit 2'),
      ],
    });
    expect(oneFail.gates[0]!.pass).toBe(true);
    expect(oneFail.gates[1]!.pass).toBe(false);
    expect(oneFail.overall.ok).toBe(false);
    expect(oneFail.failed_count).toBeGreaterThanOrEqual(1);
  });

  it('integration child receives only explicit nonprod DB/Convex/R2 targets and temp secrets are removed', () => {
    const root = mkdtempSync(resolve(tmpdir(), 's29-go-no-go-boundary-'));
    transientRoots.push(root);
    const durableSecrets = resolve(root, 'operator-secrets.yaml');
    const pg1Path = resolve(root, 'isolated-pgdata');
    const childPath = resolve(root, 'boundary-child.ts');
    const snapshotPath = resolve(root, 'snapshot.json');
    mkdirSync(pg1Path, { recursive: true });
    writeFileSync(
      durableSecrets,
      [
        'DATABASE_URL: postgres://operator@127.0.0.1:5432/holocron',
        'PGBACKREST_CONFIG: /operator/pgbackrest.conf',
        'PGBACKREST_PG1_PATH: /operator/postgresql@18',
        'R2_ACCOUNT_ID: test-account',
        'R2_ENDPOINT: https://example.invalid',
        'R2_BUCKET_NAME: test-bucket',
        'R2_ACCESS_KEY_ID: fake-writer-key',
        'R2_SECRET_ACCESS_KEY: fake-writer-secret',
        'FLEET_KEY: operator-fleet-key-must-not-cross-boundary',
        'FLEET_URL: https://operator-fleet.example.invalid/v1',
        'R2_REPO_CIPHER_PASS: fake-cipher',
        'R2_PGBACKREST_PREFIX: pgbackrest',
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o600 }
    );
    const durableBefore = readFileSync(durableSecrets, 'utf8');

    writeFileSync(
      childPath,
      [
        "import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';",
        `import { applyConsolidatedSecretsToEnv } from ${JSON.stringify(resolve(REPO_ROOT, 'packages/platform/src/config/secrets.ts'))};`,
        `import { ensureResticPrefixSecret } from ${JSON.stringify(resolve(REPO_ROOT, 'packages/platform/src/backup/restic-mirror.ts'))};`,
        `const out = ${JSON.stringify(snapshotPath)};`,
        'const ambient = {',
        '  backupR2Id: process.env.BACKUP_R2_ACCESS_KEY_ID ?? null,',
        '  backupR2Secret: process.env.BACKUP_R2_SECRET_ACCESS_KEY ?? null,',
        '  backupR2Token: process.env.BACKUP_R2_SECRET_ACCESS_API_TOKEN ?? null,',
        '  r2ParentId: process.env.R2_PARENT_ACCESS_KEY_ID ?? null,',
        '  r2AccessId: process.env.R2_ACCESS_KEY_ID ?? null,',
        '  r2Secret: process.env.R2_SECRET_ACCESS_KEY ?? null,',
        '  restoreAccessId: process.env.R2_RESTORE_ACCESS_KEY_ID ?? null,',
        '  restoreSecret: process.env.R2_RESTORE_SECRET_ACCESS_KEY ?? null,',
        '  restoreToken: process.env.R2_RESTORE_SESSION_TOKEN ?? null,',
        '  r2Cipher: process.env.R2_REPO_CIPHER_PASS ?? null,',
        '  resticPassword: process.env.RESTIC_PASSWORD ?? null,',
        '  expoToken: process.env.EXPO_TOKEN ?? null,',
        '  r2Prefix: process.env.R2_PGBACKREST_PREFIX ?? null,',
        '};',
        'const applied = applyConsolidatedSecretsToEnv();',
        'const resticPrefix = ensureResticPrefixSecret();',
        "const secretsPath = process.env.HOLO_SECRETS_PATH ?? '';",
        "const secrets = readFileSync(secretsPath, 'utf8');",
        'writeFileSync(out, JSON.stringify({',
        '  databaseUrl: process.env.DATABASE_URL,',
        '  ownerUrl: process.env.DATABASE_URL_OWNER,',
        '  convexDeployment: process.env.CONVEX_DEPLOYMENT,',
        '  convexUrl: process.env.EXPO_PUBLIC_CONVEX_URL,',
        '  convexSiteUrl: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,',
        '  fleetUrl: process.env.FLEET_URL,',
        '  fleetKey: process.env.FLEET_KEY,',
        '  appliedSecretsPath: applied.secretsPath,',
        '  r2Prefix: process.env.R2_PGBACKREST_PREFIX,',
        '  resticRepository: process.env.RESTIC_REPOSITORY,',
        '  resticConfig: process.env.HOLO_RESTIC_CONFIG_PATH,',
        '  resticCache: process.env.RESTIC_CACHE_DIR,',
        '  pgHost: process.env.PGHOST,',
        '  pgPort: process.env.PGPORT,',
        '  pgDatabase: process.env.PGDATABASE,',
        '  pgdata: process.env.PGDATA,',
        '  pg1Path: process.env.PGBACKREST_PG1_PATH,',
        '  pgbackrestConfig: process.env.PGBACKREST_CONFIG,',
        '  secretsPath,',
        '  secretsExists: existsSync(secretsPath),',
        '  secretsMode: statSync(secretsPath).mode & 0o777,',
        "  secretsHasNonprod: secrets.includes('/holocron_nonprod'),",
        "  secretsHasOperatorDatabase: secrets.includes('/holocron\\n'),",
        "  secretsHasOperatorFleetKey: secrets.includes('operator-fleet-key-must-not-cross-boundary'),",
        "  secretsHasOperatorRestore: secrets.includes('operator-restore-reader-must-not-cross-boundary'),",
        "  secretsHasIntegrationRestore: secrets.includes('integration-reader-id'),",
        "  integrationWriterMapped: process.env.R2_ACCESS_KEY_ID === 'integration-writer-id',",
        "  integrationRestoreMapped: process.env.R2_RESTORE_ACCESS_KEY_ID === 'integration-reader-id',",
        '  inheritedProductionConvex: process.env.CONVEX_DEPLOY_KEY ?? null,',
        '  inheritedProductionBase: process.env.HOLO_PRODUCTION_BASE_URL ?? null,',
        '  inheritedCloudflareAdmin: process.env.CLOUDFLARE_API_TOKEN ?? null,',
        '  inheritedR2S3Id: process.env.R2_S3_ID ?? null,',
        '  inheritedR2S3Token: process.env.R2_S3_TOKEN ?? null,',
        '  inheritedR2S3KeyId: process.env.R2_S3_KEY_ID ?? null,',
        '  inheritedR2S3Secret: process.env.R2_S3_SECRET ?? null,',
        '  inheritedBackupR2Id: ambient.backupR2Id,',
        '  inheritedBackupR2Secret: ambient.backupR2Secret,',
        '  inheritedBackupR2Token: ambient.backupR2Token,',
        '  inheritedR2ParentId: ambient.r2ParentId,',
        '  inheritedR2AccessId: ambient.r2AccessId,',
        '  inheritedR2Secret: ambient.r2Secret,',
        '  inheritedRestoreAccessId: ambient.restoreAccessId,',
        '  inheritedRestoreSecret: ambient.restoreSecret,',
        '  inheritedRestoreToken: ambient.restoreToken,',
        '  inheritedR2Cipher: ambient.r2Cipher,',
        '  inheritedResticPassword: ambient.resticPassword,',
        '  inheritedExpoToken: ambient.expoToken,',
        '  inheritedR2Prefix: ambient.r2Prefix,',
        '  inheritedMintRequest: process.env.MINT_R2_PREFIX_RESTORE ?? null,',
        '  inheritedIntegrationWriter: process.env.R2_INTEGRATION_ACCESS_KEY_ID ?? null,',
        '  inheritedGoNoGoDatabase: process.env.HOLO_GO_NO_GO_DATABASE_URL ?? null,',
        '  inheritedGoNoGoDatabaseOwner: process.env.HOLO_GO_NO_GO_DATABASE_URL_OWNER ?? null,',
        '  inheritedGoNoGoConvexDeployment: process.env.HOLO_GO_NO_GO_CONVEX_DEPLOYMENT ?? null,',
        '  inheritedGoNoGoConvexUrl: process.env.HOLO_GO_NO_GO_CONVEX_URL ?? null,',
        '  inheritedGoNoGoConvexSiteUrl: process.env.HOLO_GO_NO_GO_CONVEX_SITE_URL ?? null,',
        '  inheritedGoNoGoFleetUrl: process.env.HOLO_GO_NO_GO_FLEET_URL ?? null,',
        '  inheritedGoNoGoR2Prefix: process.env.HOLO_GO_NO_GO_R2_PGBACKREST_PREFIX ?? null,',
        '  inheritedGoNoGoPg1Path: process.env.HOLO_GO_NO_GO_PGBACKREST_PG1_PATH ?? null,',
        '  resticSecretsPath: resticPrefix.secretsPath,',
        '}));',
        "console.log('Test Files  1 passed (1)');",
        "console.log('Tests  1 passed (1)');",
        '',
      ].join('\n'),
      'utf8'
    );

    const databaseUrl = 'postgres://integration:integration@127.0.0.1:65433/holocron_nonprod';
    const report = runGoNoGo({
      repoRoot: REPO_ROOT,
      cwd: REPO_ROOT,
      skipWrite: true,
      gates: [
        {
          name: 'integration',
          command: 'bun boundary-child.ts',
          argv: ['bun', childPath],
          kind: 'vitest',
        },
      ],
      env: isolatedLaneEnv(
        {
          BACKUP_R2_ACCESS_KEY_ID: 'operator-backup-id-must-not-cross-boundary',
          BACKUP_R2_SECRET_ACCESS_API_TOKEN: 'operator-backup-token-must-not-cross-boundary',
          BACKUP_R2_SECRET_ACCESS_KEY: 'operator-backup-secret-must-not-cross-boundary',
          CLOUDFLARE_API_TOKEN: 'operator-admin-must-not-cross-boundary',
          CONVEX_DEPLOY_KEY: 'operator-deploy-key-must-not-cross-boundary',
          DATABASE_URL: 'postgres://operator@127.0.0.1:5432/holocron',
          EXPO_TOKEN: 'operator-expo-token-must-not-cross-boundary',
          EXPO_PUBLIC_CONVEX_SITE_URL: 'https://operator.example.invalid',
          EXPO_PUBLIC_CONVEX_URL: 'https://operator.example.invalid',
          HOLO_GO_NO_GO_CONVEX_DEPLOYMENT: 'local:boundary-test',
          HOLO_GO_NO_GO_CONVEX_SITE_URL: 'http://127.0.0.1:3211',
          HOLO_GO_NO_GO_CONVEX_URL: 'http://127.0.0.1:3210',
          HOLO_GO_NO_GO_DATABASE_URL: databaseUrl,
          HOLO_GO_NO_GO_DATABASE_URL_OWNER: 'postgres://owner@127.0.0.1:65433/holocron_nonprod',
          HOLO_GO_NO_GO_FLEET_URL: 'http://127.0.0.1:4545/v1',
          HOLO_GO_NO_GO_PGBACKREST_PG1_PATH: pg1Path,
          HOLO_GO_NO_GO_R2_PGBACKREST_PREFIX: 'integration/s29-boundary-test',
          HOLO_PRODUCTION_BASE_URL: 'http://192.0.2.10:44111',
          HOLO_SECRETS_PATH: durableSecrets,
          R2_S3_ID: 'operator-r2-account-must-not-cross-boundary',
          R2_S3_KEY_ID: 'operator-r2-admin-key-must-not-cross-boundary',
          R2_S3_SECRET: 'operator-r2-admin-secret-must-not-cross-boundary',
          R2_S3_TOKEN: 'operator-r2-token-must-not-cross-boundary',
          R2_ACCESS_KEY_ID: 'operator-r2-access-id-must-not-cross-boundary',
          R2_PARENT_ACCESS_KEY_ID: 'operator-r2-parent-id-must-not-cross-boundary',
          R2_REPO_CIPHER_PASS: 'operator-r2-cipher-must-not-cross-boundary',
          R2_SECRET_ACCESS_KEY: 'operator-r2-secret-must-not-cross-boundary',
          RESTIC_PASSWORD: 'operator-restic-password-must-not-cross-boundary',
          MINT_R2_PREFIX_RESTORE: '1',
          R2_INTEGRATION_ACCESS_KEY_ID: 'integration-writer-id',
          R2_INTEGRATION_SECRET_ACCESS_KEY: 'integration-writer-secret',
          R2_INTEGRATION_SESSION_TOKEN: 'integration-writer-session',
          R2_INTEGRATION_RESTORE_ACCESS_KEY_ID: 'integration-reader-id',
          R2_INTEGRATION_RESTORE_SECRET_ACCESS_KEY: 'integration-reader-secret',
          R2_INTEGRATION_RESTORE_SESSION_TOKEN: 'integration-reader-session',
        },
        {
          ...process.env,
          R2_RESTORE_ACCESS_KEY_ID: 'operator-restore-reader-must-not-cross-boundary',
          R2_RESTORE_SECRET_ACCESS_KEY: 'operator-restore-secret-must-not-cross-boundary',
          R2_RESTORE_SESSION_TOKEN: 'operator-restore-session-must-not-cross-boundary',
        }
      ),
    });

    expect(report.overall.ok).toBe(true);
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as Record<string, unknown>;
    expect(snapshot.databaseUrl).toBe(databaseUrl);
    expect(snapshot.ownerUrl).toBe('postgres://owner@127.0.0.1:65433/holocron_nonprod');
    expect(snapshot.convexDeployment).toBe('local:boundary-test');
    expect(snapshot.convexUrl).toBe('http://127.0.0.1:3210');
    expect(snapshot.convexSiteUrl).toBe('http://127.0.0.1:3211');
    expect(snapshot.fleetUrl).toBe('http://127.0.0.1:4545/v1');
    expect(snapshot.fleetKey).toBe('sk-none');
    expect(snapshot.appliedSecretsPath).toBe(snapshot.secretsPath);
    expect(snapshot.r2Prefix).toBe('integration/s29-boundary-test');
    expect(snapshot.resticRepository).toContain('/integration/s29-boundary-test/restic');
    expect(String(snapshot.resticConfig)).toMatch(/holocron-go-no-go-.*restic-mirror\.conf$/);
    expect(String(snapshot.resticCache)).toMatch(/holocron-go-no-go-.*restic-cache$/);
    expect(snapshot.pgHost).toBe('127.0.0.1');
    expect(snapshot.pgPort).toBe('65433');
    expect(snapshot.pgDatabase).toBe('holocron_nonprod');
    // Preserve the server-visible path spelling for pgBackRest (/tmp and
    // /private/tmp are the same inode on macOS but not the same cluster path).
    expect(snapshot.pgdata).toBe(resolve(pg1Path));
    expect(snapshot.pg1Path).toBe(resolve(pg1Path));
    expect(String(snapshot.pgbackrestConfig)).toMatch(/holocron-go-no-go-.*pgbackrest\.conf$/);
    expect(snapshot.secretsExists).toBe(true);
    expect(snapshot.secretsMode).toBe(0o600);
    expect(snapshot.secretsHasNonprod).toBe(true);
    expect(snapshot.secretsHasOperatorDatabase).toBe(false);
    expect(snapshot.secretsHasOperatorFleetKey).toBe(false);
    expect(snapshot.secretsHasOperatorRestore).toBe(false);
    expect(snapshot.secretsHasIntegrationRestore).toBe(true);
    expect(snapshot.integrationWriterMapped).toBe(true);
    expect(snapshot.integrationRestoreMapped).toBe(true);
    expect(snapshot.inheritedProductionConvex).toBeNull();
    expect(snapshot.inheritedProductionBase).toBeNull();
    expect(snapshot.inheritedCloudflareAdmin).toBeNull();
    expect(snapshot.inheritedR2S3Id).toBeNull();
    expect(snapshot.inheritedR2S3Token).toBeNull();
    expect(snapshot.inheritedR2S3KeyId).toBeNull();
    expect(snapshot.inheritedR2S3Secret).toBeNull();
    expect(snapshot.inheritedBackupR2Id).toBeNull();
    expect(snapshot.inheritedBackupR2Secret).toBeNull();
    expect(snapshot.inheritedBackupR2Token).toBeNull();
    expect(snapshot.inheritedR2ParentId).toBeNull();
    expect(snapshot.inheritedR2AccessId).toBeNull();
    expect(snapshot.inheritedR2Secret).toBeNull();
    expect(snapshot.inheritedRestoreAccessId).toBeNull();
    expect(snapshot.inheritedRestoreSecret).toBeNull();
    expect(snapshot.inheritedRestoreToken).toBeNull();
    expect(snapshot.inheritedR2Cipher).toBeNull();
    expect(snapshot.inheritedResticPassword).toBeNull();
    expect(snapshot.inheritedExpoToken).toBeNull();
    expect(snapshot.inheritedR2Prefix).toBeNull();
    expect(snapshot.inheritedMintRequest).toBeNull();
    expect(snapshot.inheritedIntegrationWriter).toBeNull();
    expect(snapshot.inheritedGoNoGoDatabase).toBeNull();
    expect(snapshot.inheritedGoNoGoDatabaseOwner).toBeNull();
    expect(snapshot.inheritedGoNoGoConvexDeployment).toBeNull();
    expect(snapshot.inheritedGoNoGoConvexUrl).toBeNull();
    expect(snapshot.inheritedGoNoGoConvexSiteUrl).toBeNull();
    expect(snapshot.inheritedGoNoGoFleetUrl).toBeNull();
    expect(snapshot.inheritedGoNoGoR2Prefix).toBeNull();
    expect(snapshot.inheritedGoNoGoPg1Path).toBeNull();
    expect(snapshot.resticSecretsPath).toBe(snapshot.secretsPath);
    expect(existsSync(String(snapshot.secretsPath))).toBe(false);
    expect(readFileSync(durableSecrets, 'utf8')).toBe(durableBefore);
    expect(statSync(durableSecrets).mode & 0o777).toBe(0o600);
  });

  itLive(
    'fresh service boot reads database, Fleet, and auth only from HOLO_SECRETS_PATH',
    () => {
      const databaseUrl = process.env.DATABASE_URL;
      const fleetUrl = process.env.FLEET_URL;
      expect(databaseUrl).toMatch(/\/holocron_nonprod(?:\?|$)/);
      expect(fleetUrl).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])/);

      const root = mkdtempSync(resolve(tmpdir(), 's29-service-secret-boot-'));
      transientRoots.push(root);
      const secretsPath = resolve(root, 'secrets.yaml');
      const childPath = resolve(root, 'service-boot-child.ts');
      const snapshotPath = resolve(root, 'service-boot-snapshot.json');
      writeFileSync(
        secretsPath,
        [
          `DATABASE_URL: ${JSON.stringify(databaseUrl)}`,
          `FLEET_URL: ${JSON.stringify(fleetUrl)}`,
          'FLEET_KEY: sk-none',
          'HOLO_KEY_CONTROL: service-boot-control-key',
          'HOLO_KEY_MCP: service-boot-mcp-key',
          'HOLO_KEY_RN: service-boot-rn-key',
          'MASTRA_API_KEY: service-boot-mastra-key',
          'HOLO_MIGRATION_READ_ONLY: 0',
          'HOLO_CUTOVER_SCHEDULES_DISABLED: 0',
          '',
        ].join('\n'),
        { encoding: 'utf8', mode: 0o600 }
      );
      writeFileSync(
        childPath,
        [
          "import { writeFileSync } from 'node:fs';",
          `const service = await import(${JSON.stringify(resolve(REPO_ROOT, 'packages/platform/src/index.ts'))});`,
          `const mastraConfig = await import(${JSON.stringify(resolve(REPO_ROOT, 'packages/platform/src/mastra.ts'))});`,
          "const handle = await service.startService({ port: 0, hostname: '127.0.0.1', log: false });",
          'try {',
          '  const response = await fetch(`http://127.0.0.1:${handle.server.port}/health`);',
          '  const health = await response.json();',
          `  writeFileSync(${JSON.stringify(snapshotPath)}, JSON.stringify({`,
          '    databaseUrl: process.env.DATABASE_URL,',
          '    capturedDatabaseUrl: mastraConfig.DATABASE_URL,',
          '    fleetUrl: process.env.FLEET_URL,',
          '    authFromSecrets: Boolean(process.env.HOLO_KEY_CONTROL && process.env.HOLO_KEY_MCP && process.env.HOLO_KEY_RN && process.env.MASTRA_API_KEY),',
          '    status: response.status,',
          '    postgresReady: health.postgres?.ready,',
          '    queueReady: health.queue?.ready,',
          '    fleetReady: health.fleet?.ready,',
          '  }));',
          '} finally {',
          '  await handle.stop();',
          '}',
          '',
        ].join('\n'),
        'utf8'
      );

      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        HOLO_SECRETS_PATH: secretsPath,
      };
      for (const key of [
        'DATABASE_URL',
        'DATABASE_URL_OWNER',
        'FLEET_KEY',
        'FLEET_URL',
        'HOLO_KEY_CONTROL',
        'HOLO_KEY_MCP',
        'HOLO_KEY_RN',
        'MASTRA_API_KEY',
        'HOLO_MIGRATION_READ_ONLY',
        'HOLO_CUTOVER_SCHEDULES_DISABLED',
        'HOLO_DANGEROUS_ALLOW_PROD_DB',
        'HOLO_PRODUCTION_READINESS',
        'HOLO_PRODUCTION_BASE_URL',
        'HOLO_VERIFY_BASE_URL',
        'PLATFORM_URL',
        'PORT',
        'HOLO_PORT',
      ]) {
        delete childEnv[key];
      }

      const child = spawnSync(BUN_BIN, [childPath], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: childEnv,
        timeout: 120_000,
      });
      expect(child.status, `${child.stdout ?? ''}\n${child.stderr ?? ''}`).toBe(0);
      const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as Record<string, unknown>;
      expect(snapshot.databaseUrl).toBe(databaseUrl);
      expect(snapshot.capturedDatabaseUrl).toBe(databaseUrl);
      expect(snapshot.fleetUrl).toBe(fleetUrl);
      expect(snapshot.authFromSecrets).toBe(true);
      expect(snapshot.status).toBe(200);
      expect(snapshot.postgresReady).toBe(true);
      expect(snapshot.queueReady).toBe(true);
      expect(snapshot.fleetReady).toBe(true);
    },
    150_000
  );

  itIsolatedGoNoGo(
    'backup:wal uses the isolated non-default port/database and pg_ctl without launchctl',
    () => {
      const pgdata = process.env.PGBACKREST_PG1_PATH;
      const configPath = process.env.PGBACKREST_CONFIG;
      const port = process.env.PGPORT;
      expect(pgdata).toBeTruthy();
      expect(configPath).toBeTruthy();
      expect(port).toMatch(/^\d+$/);
      expect(port).not.toBe('5432');
      expect(process.env.PGDATABASE).toBe('holocron_nonprod');

      const root = mkdtempSync(resolve(tmpdir(), 's29-wal-restart-boundary-'));
      transientRoots.push(root);
      const fakeBin = resolve(root, 'bin');
      const launchctlSentinel = resolve(root, 'launchctl-called');
      const postgresRestartLog = resolve(root, 'postgres-restart.log');
      mkdirSync(fakeBin);
      writeFileSync(
        resolve(fakeBin, 'launchctl'),
        `#!/bin/sh\ntouch ${JSON.stringify(launchctlSentinel)}\nexit 99\n`,
        { encoding: 'utf8', mode: 0o755 }
      );

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
        PGLOG: postgresRestartLog,
      };
      const setMode = spawnSync(
        'psql',
        ['-v', 'ON_ERROR_STOP=1', '-c', "ALTER SYSTEM SET archive_mode = 'on'"],
        { cwd: REPO_ROOT, encoding: 'utf8', env, timeout: 30_000 }
      );
      expect(setMode.status, `${setMode.stdout ?? ''}\n${setMode.stderr ?? ''}`).toBe(0);
      const restart = spawnSync(
        '/opt/homebrew/opt/postgresql@18/bin/pg_ctl',
        ['-D', pgdata ?? '', 'restart', '-m', 'fast'],
        { cwd: REPO_ROOT, encoding: 'utf8', env, timeout: 60_000 }
      );
      expect(restart.status, `${restart.stdout ?? ''}\n${restart.stderr ?? ''}`).toBe(0);

      const wal = runHolo(['backup:wal', '--json'], {
        env,
        timeoutMs: 300_000,
      });
      expect(wal.status, wal.combined).toBe(0);
      const report = JSON.parse(wal.stdout) as {
        ok: boolean;
        archiveMode?: string;
      };
      expect(report.ok).toBe(true);
      expect(report.archiveMode).toBe('always');
      expect(existsSync(launchctlSentinel)).toBe(false);
      expect(
        existsSync(postgresRestartLog),
        'isolated pg_ctl must write the configured PGLOG'
      ).toBe(true);
      expect(readFileSync(postgresRestartLog, 'utf8')).toMatch(/ready to accept connections/i);

      const config = readFileSync(configPath ?? '', 'utf8');
      expect(config).toContain(`pg1-path=${pgdata}`);
      expect(config).toContain(`pg1-port=${port}`);
      const target = spawnSync(
        'psql',
        ['-Atc', "select current_database() || ':' || current_setting('port')"],
        { cwd: REPO_ROOT, encoding: 'utf8', env, timeout: 30_000 }
      );
      expect(target.status, `${target.stdout ?? ''}\n${target.stderr ?? ''}`).toBe(0);
      expect(target.stdout.trim()).toBe(`holocron_nonprod:${port}`);
    },
    360_000
  );

  itIsolatedGoNoGo(
    'isolated gate cleanup removes its temporary pgBackRest archive_command before deleting config',
    () => {
      const databaseUrl = process.env.DATABASE_URL;
      const pgdata = process.env.PGBACKREST_PG1_PATH;
      expect(databaseUrl).toBeTruthy();
      expect(pgdata).toBeTruthy();

      const root = mkdtempSync(resolve(tmpdir(), 's29-archive-cleanup-boundary-'));
      transientRoots.push(root);
      const childPath = resolve(root, 'set-temporary-archive-command.ts');
      const snapshotPath = resolve(root, 'temporary-config-path.txt');
      writeFileSync(
        childPath,
        [
          "import { spawnSync } from 'node:child_process';",
          "import { writeFileSync } from 'node:fs';",
          "const configPath = process.env.PGBACKREST_CONFIG ?? '';",
          "const snapshotPath = process.env.S29_ARCHIVE_CLEANUP_SNAPSHOT ?? '';",
          "writeFileSync(configPath, '# test-owned temporary pgBackRest config\\n', { mode: 0o600 });",
          "writeFileSync(snapshotPath, configPath, 'utf8');",
          'const command = `/opt/homebrew/bin/pgbackrest --config=${configPath} --stanza=main archive-push %p`;',
          "const sql = `ALTER SYSTEM SET archive_command = '${command.replaceAll(\"'\", \"''\")}'`;",
          "const set = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', env: process.env });",
          "if (set.status !== 0) throw new Error(`${set.stdout ?? ''}\\n${set.stderr ?? ''}`);",
          "const reload = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT pg_reload_conf()'], { encoding: 'utf8', env: process.env });",
          "if (reload.status !== 0) throw new Error(`${reload.stdout ?? ''}\\n${reload.stderr ?? ''}`);",
          "console.log('Test Files  1 passed (1)');",
          "console.log('Tests  1 passed (1)');",
          '',
        ].join('\n'),
        'utf8'
      );

      const report = runGoNoGo({
        repoRoot: REPO_ROOT,
        cwd: REPO_ROOT,
        skipWrite: true,
        gates: [
          {
            name: 'integration',
            command: 'bun set-temporary-archive-command.ts',
            argv: [BUN_BIN, childPath],
            kind: 'vitest',
          },
        ],
        env: isolatedLaneEnv({
          DATABASE_URL: undefined,
          HOLO_GO_NO_GO_DATABASE_URL: databaseUrl,
          HOLO_GO_NO_GO_PGBACKREST_PG1_PATH: pgdata,
          HOLO_GO_NO_GO_R2_PGBACKREST_PREFIX: 'integration/s29-archive-cleanup-boundary',
          PGBACKREST_PG1_PATH: undefined,
          PGDATA: undefined,
          S29_ARCHIVE_CLEANUP_SNAPSHOT: snapshotPath,
        }),
      });

      expect(report.overall.ok).toBe(true);
      const temporaryConfigPath = readFileSync(snapshotPath, 'utf8');
      expect(existsSync(temporaryConfigPath)).toBe(false);
      const show = spawnSync('psql', ['-X', '-Atc', 'SHOW archive_command'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: process.env,
        timeout: 30_000,
      });
      expect(show.status, `${show.stdout ?? ''}\n${show.stderr ?? ''}`).toBe(0);
      expect(show.stdout).not.toContain(temporaryConfigPath);
    },
    120_000
  );

  it('integration isolation refuses the operator database endpoint', () => {
    expect(() =>
      runGoNoGo({
        repoRoot: REPO_ROOT,
        skipWrite: true,
        gates: [shapeEchoGate('integration', 'exit 0', 'vitest')],
        env: isolatedLaneEnv({
          DATABASE_URL: 'postgres://operator@localhost:65433/holocron',
          HOLO_GO_NO_GO_DATABASE_URL: 'postgresql://integration@127.0.0.1:65433/holocron_nonprod',
        }),
      })
    ).toThrow(/must not reuse the operator database server endpoint/);
  });

  it('integration isolation accepts bracketed IPv6 loopback endpoints', () => {
    const report = runGoNoGo({
      repoRoot: REPO_ROOT,
      skipWrite: true,
      gates: [shapeEchoGate('integration', "printf 'Tests  1 passed (1)\\n'", 'vitest')],
      env: isolatedLaneEnv({
        DATABASE_URL: 'postgres://operator@127.0.0.1:5432/holocron',
        HOLO_GO_NO_GO_CONVEX_SITE_URL: 'http://[::1]:3211',
        HOLO_GO_NO_GO_CONVEX_URL: 'http://[::1]:3210',
        HOLO_GO_NO_GO_DATABASE_URL: 'postgresql://integration@[::1]:65434/holocron_nonprod',
        HOLO_GO_NO_GO_FLEET_URL: 'http://[::1]:4545/v1',
      }),
    });

    expect(report.overall.ok).toBe(true);
  });

  it('integration isolation accepts R2 endpoint and bucket supplied only by environment', () => {
    const root = mkdtempSync(resolve(tmpdir(), 's29-go-no-go-env-r2-'));
    transientRoots.push(root);
    const secretsPath = resolve(root, 'secrets.yaml');
    writeFileSync(secretsPath, 'TEST_ONLY_PLACEHOLDER: present\n', 'utf8');
    const report = runGoNoGo({
      repoRoot: REPO_ROOT,
      skipWrite: true,
      gates: [shapeEchoGate('integration', "printf 'Tests  1 passed (1)\\n'", 'vitest')],
      env: isolatedLaneEnv({
        HOLO_SECRETS_PATH: secretsPath,
        R2_BUCKET_NAME: 'environment-only-integration-bucket',
        R2_ENDPOINT: 'https://environment-only-r2.example.invalid',
      }),
    });

    expect(report.overall.ok).toBe(true);
  });

  it.each([
    [
      'non-loopback database',
      {
        HOLO_GO_NO_GO_DATABASE_URL:
          'postgres://integration@db.example.invalid:65432/holocron_nonprod',
      },
      /loopback-only integration service/,
    ],
    [
      'non-Postgres database protocol',
      { HOLO_GO_NO_GO_DATABASE_URL: 'http://127.0.0.1:65432/holocron_nonprod' },
      /must use postgres:\/\/ or postgresql:\/\//,
    ],
    [
      'wrong database name',
      {
        HOLO_GO_NO_GO_DATABASE_URL: 'postgres://integration@127.0.0.1:65432/holocron',
      },
      /must target the holocron_nonprod database/,
    ],
    [
      'default Postgres port',
      {
        HOLO_GO_NO_GO_DATABASE_URL: 'postgres://integration@127.0.0.1:5432/holocron_nonprod',
      },
      /must use an explicit non-default Postgres port/,
    ],
    [
      'cloud Convex deployment',
      { HOLO_GO_NO_GO_CONVEX_DEPLOYMENT: 'dev:operator-cloud' },
      /must name a local Convex deployment/,
    ],
    [
      'non-loopback Convex URL',
      { HOLO_GO_NO_GO_CONVEX_URL: 'https://operator-convex.example.invalid' },
      /loopback-only integration service/,
    ],
    [
      'non-loopback Convex site URL',
      {
        HOLO_GO_NO_GO_CONVEX_SITE_URL: 'https://operator-site.example.invalid',
      },
      /loopback-only integration service/,
    ],
    [
      'non-loopback Fleet URL',
      { HOLO_GO_NO_GO_FLEET_URL: 'https://operator-fleet.example.invalid/v1' },
      /loopback-only integration service/,
    ],
    [
      'operator-shaped R2 prefix',
      { HOLO_GO_NO_GO_R2_PGBACKREST_PREFIX: 'pgbackrest' },
      /must start with integration\//,
    ],
    [
      'missing isolated PGDATA',
      { HOLO_GO_NO_GO_PGBACKREST_PG1_PATH: '/no/such/s29-isolated-pgdata' },
      /does not exist/,
    ],
  ])('integration isolation refuses %s', (_label, overrides, expected) => {
    expect(() =>
      runGoNoGo({
        repoRoot: REPO_ROOT,
        skipWrite: true,
        gates: [shapeEchoGate('integration', 'exit 0', 'vitest')],
        env: isolatedLaneEnv(overrides),
      })
    ).toThrow(expected);
  });

  it('integration isolation refuses the operator PGDATA path', () => {
    const root = mkdtempSync(resolve(tmpdir(), 's29-go-no-go-pgdata-boundary-'));
    transientRoots.push(root);
    const secretsPath = resolve(root, 'operator-secrets.yaml');
    const operatorPgdata = resolve(root, 'operator-pgdata');
    const aliasPgdata = resolve(root, 'operator-pgdata-alias');
    mkdirSync(operatorPgdata);
    symlinkSync(operatorPgdata, aliasPgdata);
    writeFileSync(
      secretsPath,
      `DATABASE_URL: postgres://operator@127.0.0.1:5432/holocron\nPGBACKREST_PG1_PATH: ${operatorPgdata}\nR2_PGBACKREST_PREFIX: pgbackrest\n`,
      'utf8'
    );

    expect(() =>
      runGoNoGo({
        repoRoot: REPO_ROOT,
        skipWrite: true,
        gates: [shapeEchoGate('integration', 'exit 0', 'vitest')],
        env: isolatedLaneEnv({
          HOLO_GO_NO_GO_PGBACKREST_PG1_PATH: aliasPgdata,
          HOLO_SECRETS_PATH: secretsPath,
          PGBACKREST_PG1_PATH: operatorPgdata,
          PGDATA: operatorPgdata,
        }),
      })
    ).toThrow(/must differ from the operator Postgres data path/);
  });

  it('integration isolation refuses the operator R2 prefix supplied by the environment', () => {
    expect(() =>
      runGoNoGo({
        repoRoot: REPO_ROOT,
        skipWrite: true,
        gates: [shapeEchoGate('integration', 'exit 0', 'vitest')],
        env: isolatedLaneEnv({
          HOLO_GO_NO_GO_R2_PGBACKREST_PREFIX: 'integration/operator-collision',
          R2_PGBACKREST_PREFIX: 'integration/operator-collision',
        }),
      })
    ).toThrow(/must differ from the operator backup prefix/);
  });

  it('AC-1 / failed_count: deliberately broken typecheck fails closed (production gate runner)', () => {
    mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
    writeFileSync(FIXTURE_PATH, 'const x: string = 123;\n', 'utf8');
    expect(existsSync(FIXTURE_PATH)).toBe(true);

    const reportPath = resolve(EVIDENCE_DIR, 'ac2-broken-typecheck-report.json');
    tmpReports.push(reportPath);
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    mkdirSync(C01_EVIDENCE, { recursive: true });

    // REAL production typecheck gate from DEFAULT_GATE_SPECS — not echo.
    const typecheckSpec = DEFAULT_GATE_SPECS.find((g) => g.name === 'typecheck');
    expect(typecheckSpec).toBeTruthy();
    expect(typecheckSpec!.command).toContain('pnpm tsgo');

    const report = runGoNoGo({
      repoRoot: REPO_ROOT,
      cwd: REPO_ROOT,
      reportPath,
      gates: [typecheckSpec!],
    });

    const tc = report.gates.find((g) => g.name === 'typecheck');
    expect(tc, 'typecheck gate missing').toBeTruthy();
    expect(tc!.pass).toBe(false);
    expect(tc!.exit_code).not.toBe(0);
    expect(report.overall.ok).toBe(false);
    expect(report.failed_count).toBeGreaterThanOrEqual(1);
    expect(evaluateGoNoGoOracle(report).ok).toBe(false);
    expect(
      evaluateGoNoGoOracle(report).reasons.some((r) => /failed_count|overall\.ok/.test(r))
    ).toBe(true);

    const blob = `${tc!.stderr_tail}\n${tc!.stdout_tail}`;
    expect(blob).toMatch(/\.tmp-gate-fixture\.ts/);

    writeFileSync(resolve(EVIDENCE_DIR, 'ac2-typecheck-excerpt.txt'), blob.slice(0, 4000), 'utf8');
    writeFileSync(
      resolve(C01_EVIDENCE, 'forced-fail-typecheck-report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );

    rmSync(FIXTURE_PATH, { force: true });
  }, 120_000);

  it('AC-3 formatGoNoGoText emits literal status: OK or status: FAIL', () => {
    const ok = runGoNoGo({
      repoRoot: REPO_ROOT,
      skipWrite: true,
      gates: [shapeEchoGate('lint', 'exit 0')],
    });
    const okText = formatGoNoGoText(ok);
    expect(okText).toContain('status: OK');
    expect(ok.overall.ok).toBe(true);
    expect(ok.failed_count).toBe(0);

    const fail = runGoNoGo({
      repoRoot: REPO_ROOT,
      skipWrite: true,
      gates: [shapeEchoGate('lint', 'exit 1')],
    });
    const failText = formatGoNoGoText(fail);
    expect(failText).toContain('status: FAIL');
    expect(fail.overall.ok).toBe(false);
    expect(fail.failed_count).toBeGreaterThanOrEqual(1);
  });

  it('CLI registers cutover:go-no-go in --help', () => {
    const help = runHolo(['--help']);
    expect(help.combined).toMatch(/cutover:go-no-go/);
  });

  it('CLI text mode exit code mirrors overall.ok for a failing short path (AC-3)', () => {
    const fail = runGoNoGo({
      repoRoot: REPO_ROOT,
      skipWrite: true,
      gates: [shapeEchoGate('lanes', 'echo fail; exit 7')],
    });
    expect(fail.overall.ok).toBe(false);
    expect(fail.failed_count).toBeGreaterThanOrEqual(1);
    const text = formatGoNoGoText(fail);
    expect(text).toMatch(/status: FAIL/);
    // CLI does process.exit(report.overall.ok ? 0 : 1)
    expect(fail.overall.ok ? 0 : 1).toBe(1);

    const ok = runGoNoGo({
      repoRoot: REPO_ROOT,
      skipWrite: true,
      gates: [shapeEchoGate('lanes', 'exit 0')],
    });
    expect(ok.overall.ok ? 0 : 1).toBe(0);
    expect(ok.failed_count).toBe(0);
    expect(formatGoNoGoText(ok)).toMatch(/status: OK/);
  });

  it('persisted report git_sha equals real git rev-parse HEAD (TC-6)', () => {
    const reportPath = resolve(EVIDENCE_DIR, 'git-sha-report.json');
    tmpReports.push(reportPath);
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const report = runGoNoGo({
      repoRoot: REPO_ROOT,
      reportPath,
      gates: [shapeEchoGate('lint', 'exit 0')],
    });
    const head = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(report.git_sha).toBe((head.stdout ?? '').trim());
    const onDisk = JSON.parse(readFileSync(reportPath, 'utf8')) as {
      git_sha: string;
    };
    expect(onDisk.git_sha).toBe(report.git_sha);
  });

  describe('REDHAT-FIX-S29-C01 — false go/no-go oracle', () => {
    it('gate-plan step 1 literal_cmd invokes real cutover:go-no-go CLI and requires overall.ok + failed_count==0', () => {
      const step1 = loadGatePlanStep1();
      expect(step1.literal_cmd).toMatch(/bun services\/platform\/src\/cli\/holo\.ts/);
      expect(step1.literal_cmd).toMatch(/cutover:go-no-go/);
      expect(step1.literal_cmd).toMatch(/--json/);
      expect(step1.literal_cmd).toMatch(/overall\.ok/);
      expect(step1.literal_cmd).toMatch(/failed_count/);
      // C-01: must not be length-only false pass.
      expect(step1.literal_cmd).not.toMatch(/length == 8/);
      // Must not be a pure jq-on-existing-report without running the CLI.
      expect(step1.literal_cmd.trim().startsWith('jq ')).toBe(false);
    });

    it('C-01 step1-oracle rejects failed_count=5 false-pass fixture despite gates.length==8', () => {
      mkdirSync(C01_EVIDENCE, { recursive: true });
      const fixturePath = resolve(C01_EVIDENCE, 'false-pass-failed-count-5.json');

      // Lineage of .gate-evidence/20260802T004525Z/step1.log: length 8 + failed_count 5.
      const fixture: GoNoGoReport = {
        ok: false,
        overall: { ok: false },
        git_sha: '2b966c7b60559ec9986cf737ed5322a6146c7960',
        generated_at: '2026-08-02T00:45:25.000Z',
        report_path: fixturePath,
        failed_count: 5,
        gates: GO_NO_GO_GATE_NAMES.map((name, i) => ({
          name,
          command: DEFAULT_GATE_SPECS[i]!.command,
          exit_code: i < 3 ? 0 : 1,
          duration_ms: 10,
          pass: i < 3,
          collectedTests: name === 'unit' || name === 'integration' || name === 'live' ? 1 : null,
          stdout_tail: '',
          stderr_tail: i < 3 ? '' : 'fail',
        })),
      };
      // Force the C-01 shape: 8 gates, 5 failed, overall false (even if vitest counts look green).
      fixture.failed_count = 5;
      fixture.overall.ok = false;
      fixture.ok = false;
      for (let i = 0; i < fixture.gates.length; i++) {
        const g = fixture.gates[i]!;
        if (i >= 3) {
          g.pass = false;
          g.exit_code = 1;
        }
      }
      writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

      // Old false oracle would green on length alone.
      const lengthOnly = spawnSync('jq', ['-e', '.gates | length == 8', fixturePath], {
        encoding: 'utf8',
      });
      expect(lengthOnly.status, 'length-only still true on fixture (negative control)').toBe(0);

      // Remediated oracle fails closed.
      const oracle = evaluateGoNoGoOracle(fixture);
      expect(oracle.ok).toBe(false);
      expect(oracle.reasons.join(';')).toMatch(/failed_count|overall\.ok/);

      const jq = jqStep1Oracle(fixturePath);
      expect(jq.status, `step1 jq oracle must fail: ${jq.stdout}`).not.toBe(0);

      writeFileSync(
        resolve(C01_EVIDENCE, 'false-pass-oracle-result.json'),
        `${JSON.stringify({ oracle, jq_status: jq.status, length_only_status: lengthOnly.status }, null, 2)}\n`,
        'utf8'
      );
    });

    it('production DEFAULT_GATE_SPECS runners: real no-convex + typecheck identity (not echo)', () => {
      // Execute real production gate runners from DEFAULT_GATE_SPECS (unbound echo).
      const production = DEFAULT_GATE_SPECS.filter(
        (g) => g.name === 'no-convex-client' || g.name === 'no-convex-env'
      );
      expect(production).toHaveLength(2);
      for (const g of production) {
        expect(g.command).toContain('holo.ts');
        expect(g.command).not.toMatch(/\becho\b/);
      }

      mkdirSync(C01_EVIDENCE, { recursive: true });
      const reportPath = resolve(C01_EVIDENCE, 'production-partial-gates-report.json');
      tmpReports.push(reportPath);

      const report = runGoNoGo({
        repoRoot: REPO_ROOT,
        cwd: REPO_ROOT,
        reportPath,
        gates: production,
      });

      expect(report.gates).toHaveLength(2);
      for (const g of report.gates) {
        expect(g.command).toContain('holo.ts');
        expect(g.duration_ms).toBeGreaterThan(0);
        // Real subprocess ran (exit code is a number from the process).
        expect(typeof g.exit_code).toBe('number');
      }
      // Fail-closed invariant: overall.ok iff failed_count===0 and every gate.pass.
      expect(report.failed_count).toBe(report.gates.filter((g) => !g.pass).length);
      expect(report.overall.ok).toBe(
        report.failed_count === 0 && report.gates.every((g) => g.pass)
      );
    }, 120_000);

    itLive(
      'production CLI cutover:go-no-go --json executes real DEFAULT_GATE_SPECS runners (fail-closed)',
      () => {
        mkdirSync(C01_EVIDENCE, { recursive: true });
        mkdirSync(EVIDENCE_DIR, { recursive: true });
        const reportPath = resolve(C01_EVIDENCE, 'production-cli-go-no-go-report.json');

        // Real CLI path via bun packages/platform/src/cli/holo.ts (not a PATH holo stub).
        // HOLO_GO_NO_GO_ONLY keeps this finite inside the integration lane (avoids nested
        // full unit/integration/live re-entry). Production gate-plan step 1 does NOT set
        // HOLO_GO_NO_GO_ONLY — operator runs all 8 DEFAULT_GATE_SPECS unbound.
        // PLATFORM_IT=0 also prevents nested itLive re-entry.
        const only = 'lint,no-convex-client,no-convex-env';
        const r = runHolo(['cutover:go-no-go', '--json', '--output', reportPath], {
          timeoutMs: 300_000,
          env: {
            ...process.env,
            PLATFORM_IT: '0',
            HOLO_GO_NO_GO_ONLY: only,
          },
        });

        expect(
          existsSync(reportPath),
          `CLI must write report to ${reportPath}\n${r.combined}`
        ).toBe(true);
        const report = JSON.parse(readFileSync(reportPath, 'utf8')) as GoNoGoReport;

        expect(report.gates.length).toBeGreaterThanOrEqual(3);
        expect(typeof report.failed_count).toBe('number');
        expect(typeof report.overall.ok).toBe('boolean');
        expect(report.git_sha).toMatch(/^[0-9a-f]{40}$/);
        expect(report.generated_at.length).toBeGreaterThan(0);

        // Production commands from DEFAULT_GATE_SPECS — never echo stubs.
        for (const g of report.gates) {
          expect(g.command.length, g.name).toBeGreaterThan(0);
          expect(g.command, g.name).not.toMatch(/\becho\b/);
          expect(g.command, g.name).not.toMatch(/\bprintf\b/);
          expect(g.duration_ms, g.name).toBeGreaterThan(0);
          const expected = DEFAULT_GATE_SPECS.find((s) => s.name === g.name);
          expect(expected, g.name).toBeTruthy();
          expect(g.command).toBe(expected!.command);
        }

        // Exit code mirrors overall.ok (CLI process.exit).
        const expectedExit = report.overall.ok ? 0 : 1;
        expect(r.status, `CLI exit must mirror overall.ok=${report.overall.ok}`).toBe(expectedExit);

        // Fail-closed: never green with failures.
        expect(report.failed_count).toBe(report.gates.filter((g) => !g.pass).length);
        if (report.failed_count > 0) {
          expect(report.overall.ok).toBe(false);
        }
        if (report.overall.ok) {
          expect(report.failed_count).toBe(0);
        }

        writeFileSync(
          resolve(C01_EVIDENCE, 'production-cli-summary.json'),
          `${JSON.stringify(
            {
              exit: r.status,
              overall_ok: report.overall.ok,
              failed_count: report.failed_count,
              gates: report.gates.map((g) => ({
                name: g.name,
                pass: g.pass,
                command: g.command,
                exit_code: g.exit_code,
              })),
              note: 'HOLO_GO_NO_GO_ONLY used for finite CLI proof; gate-plan step1 runs unbound 8 gates',
            },
            null,
            2
          )}\n`,
          'utf8'
        );
      },
      300_000
    );
  });
});
