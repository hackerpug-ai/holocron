/**
 * S31-OPS-03 — Isolate integration/gate harnesses from production config paths (R24).
 *
 * AC-1: HOLO_HARNESS=1 + production-suffix HOLO_PGBACKREST_CONF under .tmp/ → refuse write
 *       (mtime unchanged). NEVER touches real services/platform/config/pgbackrest/pgbackrest.conf.
 * AC-2: HOLO_HARNESS=1 secrets resolution stays under .tmp/ or deploy/nonprod/
 * AC-3: Backup integration tests use isolated roots (no production absolute conf / suffix in setup)
 *
 * Run:
 *   PLATFORM_IT=1 pnpm test:integration -- services/platform/tests/integration/sprint31-ops-03-harness-isolation.test.ts
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import {
  assertHarnessPgbackrestConfWritable,
  assertHarnessSecretsPathAllowed,
  HARNESS_PRODUCTION_PATH_REFUSED,
  isEphemeralHarnessPath,
  isHarnessMode,
  isProductionPgbackrestConfPath,
  isProductionSecretsPath,
  isStrictHarnessSecretsMode,
  PRODUCTION_PGBACKREST_CONF_SUFFIX,
  productionPgbackrestConfPath,
  productionSecretsPath,
  resolveHarnessPgbackrestConfPath,
  resolveHarnessSecretsPath,
} from '../../src/backup/harness-isolation.ts';
import { writePgbackrestConfig } from '../../src/backup/r2-provision.ts';
import { resolveRepoRoot } from '../../src/config/secrets.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/s31-ops-03');
const FIXTURE_ROOT = resolve(REPO_ROOT, '.tmp/s31-ops-03/harness_env');

/**
 * Synthetic production-suffix conf under .tmp/ — classified as production by
 * isProductionPgbackrestConfPath (ends with PRODUCTION_PGBACKREST_CONF_SUFFIX) but
 * NEVER the real operator file at services/platform/config/pgbackrest/pgbackrest.conf.
 */
const SYNTHETIC_PROD_CONF = resolve(
  FIXTURE_ROOT,
  'synthetic-prod-tree',
  PRODUCTION_PGBACKREST_CONF_SUFFIX
);

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

beforeAll(() => {
  mkdirSync(FIXTURE_ROOT, { recursive: true });
});

afterEach(() => {
  // Leave disposable roots; never touch the real production conf.
});

describe('S31-OPS-03 harness isolation (always — pure path guards)', () => {
  it('isHarnessMode is true for HOLO_HARNESS=1 or PLATFORM_IT=1', () => {
    expect(isHarnessMode({ HOLO_HARNESS: '1' })).toBe(true);
    expect(isHarnessMode({ PLATFORM_IT: '1' })).toBe(true);
    expect(isHarnessMode({ HOLO_HARNESS: '1', PLATFORM_IT: '1' })).toBe(true);
    expect(isHarnessMode({ HOLO_HARNESS: '0' })).toBe(false);
    expect(isHarnessMode({ PLATFORM_IT: '0' })).toBe(false);
    expect(isHarnessMode({})).toBe(false);
  });

  it('isStrictHarnessSecretsMode is true only for HOLO_HARNESS=1', () => {
    expect(isStrictHarnessSecretsMode({ HOLO_HARNESS: '1' })).toBe(true);
    expect(isStrictHarnessSecretsMode({ PLATFORM_IT: '1' })).toBe(false);
    expect(isStrictHarnessSecretsMode({})).toBe(false);
  });

  it('classifies production pgbackrest conf and secrets paths (including synthetic suffix)', () => {
    const conf = productionPgbackrestConfPath(REPO_ROOT);
    const secrets = productionSecretsPath(REPO_ROOT);
    expect(isProductionPgbackrestConfPath(conf, REPO_ROOT)).toBe(true);
    // Historical absolute path from R24 overwrite incident (main mini checkout)
    expect(
      isProductionPgbackrestConfPath(
        '/Users/inference1/Projects/holocron/services/platform/config/pgbackrest/pgbackrest.conf',
        REPO_ROOT
      )
    ).toBe(true);
    // Synthetic under .tmp/ that still ends with the production suffix
    expect(isProductionPgbackrestConfPath(SYNTHETIC_PROD_CONF, REPO_ROOT)).toBe(true);
    expect(isProductionSecretsPath(secrets, REPO_ROOT)).toBe(true);
    expect(isProductionSecretsPath(resolve(FIXTURE_ROOT, 'secrets.yaml'), REPO_ROOT)).toBe(false);
    expect(isEphemeralHarnessPath(resolve(FIXTURE_ROOT, 'pgbackrest.conf'), REPO_ROOT)).toBe(true);
    expect(
      isEphemeralHarnessPath(
        resolve(REPO_ROOT, 'services/platform/deploy/nonprod/pgbackrest.conf'),
        REPO_ROOT
      )
    ).toBe(true);
  });

  it('resolveHarnessPgbackrestConfPath prefers HOLO_PGBACKREST_CONF', () => {
    const ephemeral = resolve(FIXTURE_ROOT, 'pgbackrest.conf');
    const path = resolveHarnessPgbackrestConfPath(
      {
        HOLO_PGBACKREST_CONF: ephemeral,
        PGBACKREST_CONFIG: '/other/pgbackrest.conf',
      },
      REPO_ROOT
    );
    expect(path).toBe(ephemeral);
  });

  it('PLATFORM_IT alone refuses production-suffix conf write without HOLO_HARNESS', () => {
    expect(() =>
      assertHarnessPgbackrestConfWritable(SYNTHETIC_PROD_CONF, { PLATFORM_IT: '1' }, REPO_ROOT)
    ).toThrow(HARNESS_PRODUCTION_PATH_REFUSED);
  });
});

describe('S31-OPS-03 AC-1 productionConfWriteRefused', () => {
  itLive('production conf write attempt is refused — mtime unchanged (synthetic path only)', () => {
    expect(PLATFORM_IT, 'PLATFORM_IT=1 required for AC-1 live probe').toBe(true);

    // CRITICAL: never write the real production conf. Probe a synthetic path that
    // ends with PRODUCTION_PGBACKREST_CONF_SUFFIX under .tmp/ so classification
    // matches production while mutation stays disposable.
    const realProd = productionPgbackrestConfPath(REPO_ROOT);
    expect(SYNTHETIC_PROD_CONF).not.toBe(realProd);
    expect(SYNTHETIC_PROD_CONF.includes('/.tmp/')).toBe(true);
    expect(isProductionPgbackrestConfPath(SYNTHETIC_PROD_CONF, REPO_ROOT)).toBe(true);

    mkdirSync(resolve(SYNTHETIC_PROD_CONF, '..'), { recursive: true });

    // Sentinel contents — must survive the harness write attempt.
    const sentinel = `# S31-OPS-03 synthetic-prod sentinel ${Date.now()}\n# do-not-mutate-by-harness\n`;
    writeFileSync(SYNTHETIC_PROD_CONF, sentinel, { mode: 0o600 });
    const before = statSync(SYNTHETIC_PROD_CONF);
    const beforeMtimeMs = before.mtimeMs;
    const beforeContent = readFileSync(SYNTHETIC_PROD_CONF, 'utf8');

    // Capture real production conf mtime if present — must also remain untouched.
    const realBefore = existsSync(realProd)
      ? { mtimeMs: statSync(realProd).mtimeMs, content: readFileSync(realProd, 'utf8') }
      : null;

    const harnessEnv: NodeJS.ProcessEnv = {
      HOLO_HARNESS: '1',
      PLATFORM_IT: '1',
      HOLO_PGBACKREST_CONF: SYNTHETIC_PROD_CONF,
      PGBACKREST_CONFIG: SYNTHETIC_PROD_CONF,
    };

    // Guard itself
    let guardMsg = '';
    try {
      assertHarnessPgbackrestConfWritable(SYNTHETIC_PROD_CONF, harnessEnv, REPO_ROOT);
      throw new Error('expected assertHarnessPgbackrestConfWritable to throw');
    } catch (err) {
      guardMsg = err instanceof Error ? err.message : String(err);
    }
    expect(guardMsg).toContain(HARNESS_PRODUCTION_PATH_REFUSED);

    // writePgbackrestConfig entry (provision/PITR path)
    let writeMsg = '';
    let writeThrew = false;
    const prevHarness = process.env.HOLO_HARNESS;
    const prevPlatformIt = process.env.PLATFORM_IT;
    const prevConf = process.env.HOLO_PGBACKREST_CONF;
    try {
      process.env.HOLO_HARNESS = '1';
      process.env.PLATFORM_IT = '1';
      process.env.HOLO_PGBACKREST_CONF = SYNTHETIC_PROD_CONF;
      try {
        writePgbackrestConfig(SYNTHETIC_PROD_CONF, '# poisoned harness write\n');
      } catch (err) {
        writeThrew = true;
        writeMsg = err instanceof Error ? err.message : String(err);
      }
    } finally {
      if (prevHarness === undefined) delete process.env.HOLO_HARNESS;
      else process.env.HOLO_HARNESS = prevHarness;
      if (prevPlatformIt === undefined) delete process.env.PLATFORM_IT;
      else process.env.PLATFORM_IT = prevPlatformIt;
      if (prevConf === undefined) delete process.env.HOLO_PGBACKREST_CONF;
      else process.env.HOLO_PGBACKREST_CONF = prevConf;
    }

    const after = statSync(SYNTHETIC_PROD_CONF);
    const afterContent = readFileSync(SYNTHETIC_PROD_CONF, 'utf8');

    const realAfter =
      realBefore && existsSync(realProd)
        ? { mtimeMs: statSync(realProd).mtimeMs, content: readFileSync(realProd, 'utf8') }
        : null;

    const evidence = {
      ac: 'AC-1',
      syntheticConf: SYNTHETIC_PROD_CONF,
      realProductionConf: realProd,
      writeThrew,
      writeMsg,
      guardMsg,
      beforeMtimeMs,
      afterMtimeMs: after.mtimeMs,
      mtimeEqual: after.mtimeMs === beforeMtimeMs,
      contentUnchanged: afterContent === beforeContent,
      realProdUntouched:
        realBefore === null ||
        (realAfter !== null &&
          realAfter.mtimeMs === realBefore.mtimeMs &&
          realAfter.content === realBefore.content),
      neverWroteRealProd: SYNTHETIC_PROD_CONF !== realProd,
    };
    writeEvidence('ac1-production-conf-write-refused.json', evidence);

    expect(writeThrew, writeMsg).toBe(true);
    expect(writeMsg).toContain(HARNESS_PRODUCTION_PATH_REFUSED);
    expect(after.mtimeMs, 'mtime must be unchanged').toBe(beforeMtimeMs);
    expect(afterContent).toBe(beforeContent);
    expect(afterContent).not.toContain('poisoned harness write');
    expect(evidence.realProdUntouched, 'real production conf must not be touched').toBe(true);
  });

  itLive('ephemeral conf under .tmp/ is allowed when HOLO_HARNESS=1', () => {
    const ephemeral = resolve(FIXTURE_ROOT, 'allowed-pgbackrest.conf');
    const body = '# harness-allowed ephemeral conf\n';
    const prev = process.env.HOLO_HARNESS;
    process.env.HOLO_HARNESS = '1';
    try {
      expect(() =>
        assertHarnessPgbackrestConfWritable(ephemeral, { HOLO_HARNESS: '1' }, REPO_ROOT)
      ).not.toThrow();
      writePgbackrestConfig(ephemeral, body);
      expect(readFileSync(ephemeral, 'utf8')).toContain('harness-allowed');
    } finally {
      if (prev === undefined) delete process.env.HOLO_HARNESS;
      else process.env.HOLO_HARNESS = prev;
    }
    writeEvidence('ac1-ephemeral-conf-allowed.json', { path: ephemeral, ok: true });
  });
});

describe('S31-OPS-03 AC-2 harnessSecretsPathEphemeral', () => {
  itLive('harness secrets stay ephemeral — production path refused', () => {
    const prodSecrets = productionSecretsPath(REPO_ROOT);
    const ephemeralSecrets = resolve(FIXTURE_ROOT, 'secrets.yaml');
    writeFileSync(ephemeralSecrets, 'R2_ACCOUNT_ID: test-account\n', 'utf8');

    const harnessEnv: NodeJS.ProcessEnv = {
      HOLO_HARNESS: '1',
      // Explicit production path must be refused
      HOLO_SECRETS_PATH: prodSecrets,
    };

    let refusedMsg = '';
    try {
      resolveHarnessSecretsPath(harnessEnv, REPO_ROOT);
      throw new Error('expected resolveHarnessSecretsPath to refuse production secrets');
    } catch (err) {
      refusedMsg = err instanceof Error ? err.message : String(err);
    }
    expect(refusedMsg).toContain(HARNESS_PRODUCTION_PATH_REFUSED);

    // Default (no override) also refuses production when harness mode is on
    let defaultMsg = '';
    try {
      resolveHarnessSecretsPath({ HOLO_HARNESS: '1' }, REPO_ROOT);
      throw new Error('expected default production secrets path to be refused under harness');
    } catch (err) {
      defaultMsg = err instanceof Error ? err.message : String(err);
    }
    expect(defaultMsg).toContain(HARNESS_PRODUCTION_PATH_REFUSED);

    // PLATFORM_IT alone does not refuse secrets (live R2 gates need operator secrets)
    expect(() =>
      assertHarnessSecretsPathAllowed(prodSecrets, { PLATFORM_IT: '1' }, REPO_ROOT)
    ).not.toThrow();

    // Ephemeral path under .tmp/ is accepted
    const resolved = resolveHarnessSecretsPath(
      { HOLO_HARNESS: '1', HOLO_SECRETS_PATH: ephemeralSecrets },
      REPO_ROOT
    );
    expect(resolved).toBe(ephemeralSecrets);
    expect(isEphemeralHarnessPath(resolved, REPO_ROOT)).toBe(true);
    expect(() =>
      assertHarnessSecretsPathAllowed(ephemeralSecrets, { HOLO_HARNESS: '1' }, REPO_ROOT)
    ).not.toThrow();

    // deploy/nonprod/ is also accepted (path classification — no write of secrets into deploy/)
    const nonprodSecrets = resolve(
      REPO_ROOT,
      'services/platform/deploy/nonprod/secrets.harness.example.yaml'
    );
    expect(isEphemeralHarnessPath(nonprodSecrets, REPO_ROOT)).toBe(true);
    expect(() =>
      assertHarnessSecretsPathAllowed(nonprodSecrets, { HOLO_HARNESS: '1' }, REPO_ROOT)
    ).not.toThrow();

    writeEvidence('ac2-harness-secrets-ephemeral.json', {
      ac: 'AC-2',
      productionRefused: refusedMsg,
      defaultRefused: defaultMsg,
      ephemeralResolved: resolved,
      nonprodSecrets,
      prose: 'Harness secrets stay ephemeral',
    });
  });
});

describe('S31-OPS-03 AC-3 backupTestsUseIsolatedRoots', () => {
  itLive(
    'backup integration tests use isolated roots — no production conf path/suffix in setup',
    () => {
      const integrationDir = resolve(REPO_ROOT, 'services/platform/tests/integration');
      const productionAbsMain =
        '/Users/inference1/Projects/holocron/services/platform/config/pgbackrest/pgbackrest.conf';
      const productionAbsWorktree = productionPgbackrestConfPath(REPO_ROOT);
      // Match any absolute path ending with the production suffix, or the bare suffix
      // as a write/setup target (not mere comments about isolation).
      const productionSuffix = PRODUCTION_PGBACKREST_CONF_SUFFIX;
      const offenders: Array<{ file: string; line: string; reason: string }> = [];

      const walk = (dir: string): string[] => {
        const out: string[] = [];
        for (const ent of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, ent.name);
          if (ent.isDirectory()) {
            if (ent.name === 'node_modules' || ent.name === 'fixtures') continue;
            out.push(...walk(full));
          } else if (ent.isFile() && ent.name.endsWith('.ts')) {
            out.push(full);
          }
        }
        return out;
      };

      /** Lines that clearly assign/write the production conf (not docs/negatives). */
      const isSetupReference = (line: string): boolean => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false;
        // Explicit absolute production paths in active code
        if (t.includes(productionAbsMain) || t.includes(productionAbsWorktree)) return true;
        // writeFileSync / writePgbackrestConfig / mkdirSync aimed at production suffix path
        if (
          /write(FileSync|PgbackrestConfig)|mkdirSync|HOLO_PGBACKREST_CONF\s*[:=]/.test(t) &&
          t.includes(productionSuffix)
        ) {
          return true;
        }
        // Hardcoded join/resolve to the production relative path as conf target
        // (read-via productionPgbackrestConfPath() is the allowed shared helper).
        if (
          /(?:join|resolve)\([^)]*['"`]services\/platform\/config\/pgbackrest\/pgbackrest\.conf['"`]/.test(
            t
          )
        ) {
          return true;
        }
        return false;
      };

      for (const file of walk(integrationDir)) {
        // This isolation suite may mention the path as a negative-control string.
        if (file.endsWith('sprint31-ops-03-harness-isolation.test.ts')) continue;
        const text = readFileSync(file, 'utf8');
        for (const line of text.split('\n')) {
          if (isSetupReference(line)) {
            offenders.push({
              file: file.replace(`${REPO_ROOT}/`, ''),
              line: line.trim(),
              reason: 'production conf path/suffix used as setup target',
            });
          }
        }
        // Expanded suffix grep: any absolute path containing the production suffix
        // as a literal in non-comment code (catch worktree + main + alternate checkouts).
        if (text.includes(productionSuffix)) {
          for (const line of text.split('\n')) {
            const t = line.trim();
            if (t.startsWith('//') || t.startsWith('*')) continue;
            // Absolute path literals ending with the suffix
            if (
              /['"`]\/[^'"`]*services\/platform\/config\/pgbackrest\/pgbackrest\.conf['"`]/.test(t)
            ) {
              // Allow read-only dual-archive seed *inputs* that document productionConfigPath
              // variable names without writing to that path — still flag literal absolute strings.
              if (
                !offenders.some((o) => o.file === file.replace(`${REPO_ROOT}/`, '') && o.line === t)
              ) {
                offenders.push({
                  file: file.replace(`${REPO_ROOT}/`, ''),
                  line: t,
                  reason: 'absolute production-suffix conf literal',
                });
              }
            }
          }
        }
      }

      // Helpers that seed pgBackRest must write conf under workDir / .tmp / integration — not prod.
      const seedHelper = readFileSync(
        resolve(integrationDir, 'helpers/pgbackrest-seed.ts'),
        'utf8'
      );
      expect(seedHelper).toMatch(/join\(workDir,\s*'pgbackrest\.conf'\)/);
      expect(seedHelper).not.toContain(productionAbsMain);
      expect(seedHelper).not.toContain(`writeFileSync(${productionSuffix}`);
      // Seed helper may *read* productionConfigPath for dual-archive restore, but must
      // never write conf to PRODUCTION_PGBACKREST_CONF_SUFFIX.
      expect(seedHelper).not.toMatch(
        new RegExp(`writeFileSync\\([^)]*${productionSuffix.replace(/\//g, '\\/')}`)
      );

      // Harness isolation module refuses the canonical production conf path + synthetic suffix.
      expect(
        isProductionPgbackrestConfPath(productionPgbackrestConfPath(REPO_ROOT), REPO_ROOT)
      ).toBe(true);
      expect(isProductionPgbackrestConfPath(productionAbsMain, REPO_ROOT)).toBe(true);
      expect(isProductionPgbackrestConfPath(SYNTHETIC_PROD_CONF, REPO_ROOT)).toBe(true);

      // Ephemeral template for nonprod harnesses exists.
      const nonprodTemplate = resolve(
        REPO_ROOT,
        'services/platform/deploy/nonprod/pgbackrest.conf.example'
      );
      expect(existsSync(nonprodTemplate), `missing ${nonprodTemplate}`).toBe(true);

      writeEvidence('ac3-backup-tests-isolated-roots.json', {
        ac: 'AC-3',
        offenders,
        productionSuffix,
        productionAbsMain,
        productionAbsWorktree,
        nonprodTemplate,
        prose: 'Backup integration tests use isolated roots',
      });

      expect(
        offenders,
        `production conf path/suffix still referenced in setup:\n${JSON.stringify(offenders, null, 2)}`
      ).toEqual([]);
    }
  );

  it('repo root resolution is stable for path guards', () => {
    const root = resolveRepoRoot();
    expect(existsSync(resolve(root, 'services/platform'))).toBe(true);
    expect(productionPgbackrestConfPath(root)).toContain(PRODUCTION_PGBACKREST_CONF_SUFFIX);
  });
});
