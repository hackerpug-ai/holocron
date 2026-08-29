/**
 * D01-01 AC-3 — RED suite for laptop dev-parity stack boot under same config contract.
 *
 * Same `holo stack up` command works on mini and laptop; only env/secrets values differ.
 * Config contract is real files under packages/platform/config — not hardcoded mini paths.
 *
 * Pre-impl (before D01-03): suite FAILS — stack up absent / no portable config contract.
 * Post-impl: same command boots with laptop DATABASE_URL; mini config ≠ laptop config.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run packages/platform/src/cli/__tests__/dev-parity.test.ts
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT, REPO_ROOT, runCmd } from './fixtures/harness';

const itLive = PLATFORM_IT ? it : it.skip;

const CONFIG_DIR = resolve(REPO_ROOT, 'packages/platform/config');

function readIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

function collectConfigTexts(): { paths: string[]; blob: string } {
  const paths: string[] = [];
  const candidates = [
    resolve(CONFIG_DIR, 'secrets.example.yaml'),
    resolve(CONFIG_DIR, 'secrets.example.yml'),
    resolve(CONFIG_DIR, 'hosts.mini.yaml'),
    resolve(CONFIG_DIR, 'hosts.laptop.yaml'),
    resolve(CONFIG_DIR, 'mini.yaml'),
    resolve(CONFIG_DIR, 'laptop.yaml'),
    resolve(CONFIG_DIR, 'stack.yaml'),
    resolve(CONFIG_DIR, 'stack.example.yaml'),
    resolve(CONFIG_DIR, 'environments/mini.yaml'),
    resolve(CONFIG_DIR, 'environments/laptop.yaml'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) paths.push(p);
  }
  // Also pick up any *.yaml under config/ (portable contract surface)
  if (existsSync(CONFIG_DIR)) {
    try {
      for (const name of readdirSync(CONFIG_DIR)) {
        if (/\.ya?ml$/i.test(name) && !/secrets\.yaml$/i.test(name)) {
          const full = resolve(CONFIG_DIR, name);
          if (!paths.includes(full)) paths.push(full);
        }
      }
    } catch {
      // ignore
    }
  }
  const blob = paths.map((p) => readIfExists(p) ?? '').join('\n');
  return { paths, blob };
}

describe('AC-3: laptop dev-parity under portable config contract', () => {
  itLive(
    'config contract exists with distinct mini vs laptop DATABASE_URL (not hardcoded mono-env)',
    () => {
      expect(
        existsSync(CONFIG_DIR),
        'packages/platform/config must exist (consolidated config contract from D01-03/D01-04)'
      ).toBe(true);

      const { paths, blob } = collectConfigTexts();
      expect(
        paths.length,
        'portable config files must exist under packages/platform/config (example + host profiles)'
      ).toBeGreaterThan(0);

      // Contract must talk about DATABASE_URL (or database url) as a resolved key
      expect(blob, 'config contract must reference DATABASE_URL').toMatch(
        /DATABASE_URL|database_url/i
      );

      // Mini vs laptop values must be representable as different — either two host files
      // or documented placeholders that clearly differ.
      const miniPath =
        paths.find((p) => /mini/i.test(p)) ?? paths.find((p) => /secrets\.example/i.test(p));
      const laptopPath =
        paths.find((p) => /laptop|dev/i.test(p)) ?? paths.find((p) => /secrets\.example/i.test(p));

      expect(miniPath, 'mini (or shared example) config path required').toBeTruthy();
      expect(laptopPath, 'laptop (or shared example) config path required').toBeTruthy();

      // When both host profiles exist, their DATABASE_URL values must differ
      if (miniPath && laptopPath && miniPath !== laptopPath) {
        const miniText = readIfExists(miniPath) ?? '';
        const laptopText = readIfExists(laptopPath) ?? '';
        const miniDb = miniText.match(/DATABASE_URL\s*[:=]\s*["']?([^\s"']+)/i)?.[1];
        const laptopDb = laptopText.match(/DATABASE_URL\s*[:=]\s*["']?([^\s"']+)/i)?.[1];
        if (miniDb && laptopDb) {
          expect(
            miniDb,
            'mini DATABASE_URL must differ from laptop DATABASE_URL (dev/prod parity contract)'
          ).not.toEqual(laptopDb);
        } else {
          // Structural difference is enough if keys are env-substituted
          expect(miniText).not.toEqual(laptopText);
        }
      } else {
        // Single example file must document both environments or env-substitution
        expect(blob).toMatch(/laptop|mini|\$\{?DATABASE_URL\}?|env:/i);
      }
    }
  );

  itLive(
    'same holo stack up works under laptop DATABASE_URL (portable command, real CLI)',
    () => {
      // Laptop-shaped URL — different from a typical mini tailnet host
      const laptopDb =
        process.env.HOLO_LAPTOP_DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_dev';

      // Explicit laptop env so supervisor cannot hardcode mini URL
      const upLaptop = runCmd(
        process.env.BUN_BIN ?? 'bun',
        [resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts'), 'stack', 'up'],
        {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            DATABASE_URL: laptopDb,
            HOLO_ENV: 'laptop',
            HOLO_HOST_PROFILE: 'laptop',
          },
          timeoutMs: 90_000,
        }
      );

      const result = upLaptop;

      expect(
        result.status,
        `holo stack up must exit 0 on laptop config contract. pre-impl: command absent. out=${result.combined}`
      ).toBe(0);
      expect(result.combined).not.toMatch(/unknown command/i);

      const status = runCmd(
        process.env.BUN_BIN ?? 'bun',
        [resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts'), 'stack', 'status'],
        {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            DATABASE_URL: laptopDb,
            HOLO_ENV: 'laptop',
          },
          timeoutMs: 30_000,
        }
      );
      expect(status.status, status.combined).toBe(0);
      const text = status.combined.toLowerCase();
      expect(text).toMatch(/postgres[^\n]*healthy/);
      expect(text).toMatch(/mastra[^\n]*healthy/);
      // Scheduler is real worker (Sprint 11) — not /usr/bin/true placeholder
      expect(text).toMatch(/scheduler/);
      expect(text).not.toMatch(/\/usr\/bin\/true/);
      expect(text).toMatch(/queue[^\n]*(pg-boss|graphile-worker)/);
    },
    120_000
  );

  itLive('runtime parity: Darwin + bun available AND stack status works under portable env', () => {
    const uname = runCmd('uname', []);
    expect(uname.status).toBe(0);
    expect(uname.stdout.trim()).toMatch(/Darwin/i);

    const bun = runCmd('which', ['bun']);
    expect(bun.status, 'bun runtime must be on PATH for stack supervisor').toBe(0);
    expect(bun.stdout.trim().length).toBeGreaterThan(0);

    // Config contract must exist (pre-impl RED: packages/platform/config absent)
    expect(
      existsSync(CONFIG_DIR),
      'packages/platform/config required for portable runtime (D01-03/D01-04)'
    ).toBe(true);
    const { paths } = collectConfigTexts();
    expect(paths.length, 'portable config yaml files required').toBeGreaterThan(0);

    // Same stack status command must work (not mini-only)
    const status = runCmd(
      process.env.BUN_BIN ?? 'bun',
      [resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts'), 'stack', 'status'],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          DATABASE_URL:
            process.env.HOLO_LAPTOP_DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_dev',
          HOLO_ENV: 'laptop',
        },
        timeoutMs: 30_000,
      }
    );
    expect(status.status, `stack status under laptop env: ${status.combined}`).toBe(0);
    expect(status.combined).not.toMatch(/unknown command/i);
  });
});
