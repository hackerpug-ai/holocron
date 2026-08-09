/**
 * S31-OPS-03 — Isolate integration/gate harnesses from production config paths (R24).
 *
 * AC-1: HOLO_HARNESS=1 + production HOLO_PGBACKREST_CONF → refuse write (mtime unchanged)
 * AC-2: HOLO_HARNESS=1 secrets resolution stays under .tmp/ or deploy/nonprod/
 * AC-3: Backup integration tests use isolated roots (no production absolute conf in setup)
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
  // Leave disposable roots; never touch production conf between cases beyond AC-1 probe.
});

describe('S31-OPS-03 harness isolation (always — pure path guards)', () => {
  it('isHarnessMode is true only when HOLO_HARNESS=1', () => {
    expect(isHarnessMode({ HOLO_HARNESS: '1' })).toBe(true);
    expect(isHarnessMode({ HOLO_HARNESS: '0' })).toBe(false);
    expect(isHarnessMode({ PLATFORM_IT: '1' })).toBe(false);
    expect(isHarnessMode({})).toBe(false);
  });

  it('classifies production pgbackrest conf and secrets paths', () => {
    const conf = productionPgbackrestConfPath(REPO_ROOT);
    const secrets = productionSecretsPath(REPO_ROOT);
    expect(isProductionPgbackrestConfPath(conf, REPO_ROOT)).toBe(true);
    expect(
      isProductionPgbackrestConfPath(
        '/Users/inference1/Projects/holocron/services/platform/config/pgbackrest/pgbackrest.conf',
        REPO_ROOT
      )
    ).toBe(true);
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
});

describe('S31-OPS-03 AC-1 productionConfWriteRefused', () => {
  itLive('production conf write attempt is refused — mtime unchanged', () => {
    expect(PLATFORM_IT, 'PLATFORM_IT=1 required for AC-1 live probe').toBe(true);

    const prodConf = productionPgbackrestConfPath(REPO_ROOT);
    mkdirSync(resolve(prodConf, '..'), { recursive: true });

    // Sentinel contents — must survive the harness write attempt.
    const sentinel = `# S31-OPS-03 sentinel ${Date.now()}\n# do-not-mutate-by-harness\n`;
    writeFileSync(prodConf, sentinel, { mode: 0o600 });
    const before = statSync(prodConf);
    const beforeMtimeMs = before.mtimeMs;
    const beforeContent = readFileSync(prodConf, 'utf8');

    const harnessEnv: NodeJS.ProcessEnv = {
      HOLO_HARNESS: '1',
      HOLO_PGBACKREST_CONF: prodConf,
      PGBACKREST_CONFIG: prodConf,
    };

    // Guard itself
    let guardMsg = '';
    try {
      assertHarnessPgbackrestConfWritable(prodConf, harnessEnv, REPO_ROOT);
      throw new Error('expected assertHarnessPgbackrestConfWritable to throw');
    } catch (err) {
      guardMsg = err instanceof Error ? err.message : String(err);
    }
    expect(guardMsg).toContain(HARNESS_PRODUCTION_PATH_REFUSED);

    // writePgbackrestConfig entry (provision/PITR path)
    let writeMsg = '';
    let writeThrew = false;
    try {
      // Temporarily mark harness mode on process.env so writePgbackrestConfig sees it.
      const prev = process.env.HOLO_HARNESS;
      process.env.HOLO_HARNESS = '1';
      process.env.HOLO_PGBACKREST_CONF = prodConf;
      try {
        writePgbackrestConfig(prodConf, '# poisoned harness write\n');
      } finally {
        if (prev === undefined) delete process.env.HOLO_HARNESS;
        else process.env.HOLO_HARNESS = prev;
        delete process.env.HOLO_PGBACKREST_CONF;
      }
    } catch (err) {
      writeThrew = true;
      writeMsg = err instanceof Error ? err.message : String(err);
    }

    const after = statSync(prodConf);
    const afterContent = readFileSync(prodConf, 'utf8');

    const evidence = {
      ac: 'AC-1',
      productionConf: prodConf,
      writeThrew,
      writeMsg,
      guardMsg,
      beforeMtimeMs,
      afterMtimeMs: after.mtimeMs,
      mtimeEqual: after.mtimeMs === beforeMtimeMs,
      contentUnchanged: afterContent === beforeContent,
    };
    writeEvidence('ac1-production-conf-write-refused.json', evidence);

    expect(writeThrew, writeMsg).toBe(true);
    expect(writeMsg).toContain(HARNESS_PRODUCTION_PATH_REFUSED);
    expect(after.mtimeMs, 'mtime must be unchanged').toBe(beforeMtimeMs);
    expect(afterContent).toBe(beforeContent);
    expect(afterContent).not.toContain('poisoned harness write');
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
    'backup integration tests use isolated roots — no production absolute conf in setup',
    () => {
      const integrationDir = resolve(REPO_ROOT, 'services/platform/tests/integration');
      const productionAbs =
        '/Users/inference1/Projects/holocron/services/platform/config/pgbackrest/pgbackrest.conf';
      const offenders: Array<{ file: string; line: string }> = [];

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

      for (const file of walk(integrationDir)) {
        // This isolation suite may mention the path as a negative-control string.
        if (file.endsWith('sprint31-ops-03-harness-isolation.test.ts')) continue;
        const text = readFileSync(file, 'utf8');
        if (text.includes(productionAbs)) {
          for (const line of text.split('\n')) {
            if (line.includes(productionAbs)) {
              offenders.push({ file: file.replace(`${REPO_ROOT}/`, ''), line: line.trim() });
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
      expect(seedHelper).not.toContain(productionAbs);

      // Harness isolation module refuses the canonical production conf path.
      expect(
        isProductionPgbackrestConfPath(productionPgbackrestConfPath(REPO_ROOT), REPO_ROOT)
      ).toBe(true);
      expect(isProductionPgbackrestConfPath(productionAbs, REPO_ROOT)).toBe(true);

      // Ephemeral template for nonprod harnesses exists.
      const nonprodTemplate = resolve(
        REPO_ROOT,
        'services/platform/deploy/nonprod/pgbackrest.conf.example'
      );
      expect(existsSync(nonprodTemplate), `missing ${nonprodTemplate}`).toBe(true);

      writeEvidence('ac3-backup-tests-isolated-roots.json', {
        ac: 'AC-3',
        offenders,
        productionAbs,
        nonprodTemplate,
        prose: 'Backup integration tests use isolated roots',
      });

      expect(
        offenders,
        `production absolute conf still referenced:\n${JSON.stringify(offenders, null, 2)}`
      ).toEqual([]);
    }
  );

  it('repo root resolution is stable for path guards', () => {
    const root = resolveRepoRoot();
    expect(existsSync(resolve(root, 'services/platform'))).toBe(true);
    expect(productionPgbackrestConfPath(root)).toContain(
      'services/platform/config/pgbackrest/pgbackrest.conf'
    );
  });
});
