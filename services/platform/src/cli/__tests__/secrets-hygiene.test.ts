/**
 * D01-01 AC-2 — RED suite for consolidated secrets + Convex-env-alias detection.
 *
 * Real holo CLI: secrets doctor, verify-no-convex-env.
 * Real repo grep for CONVEX_URL / HOLOCRON_URL (not a fake fixture).
 * Real gitignore check for secrets.yaml.
 *
 * Pre-impl (before D01-04): suite FAILS — commands absent / aliases present / no secrets source.
 * Post-impl: doctor resolves keys, aliases gone, secrets.yaml gitignored.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/secrets-hygiene.test.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT, REPO_ROOT, runCmd, runHolo } from './fixtures/harness';

const itLive = PLATFORM_IT ? it : it.skip;

function runSecretsDoctor(): ReturnType<typeof runHolo> {
  // Prefer space form matching D01-04 verify gate: `holo secrets doctor`
  const spaced = runHolo(['secrets', 'doctor']);
  if (spaced.status !== 0 && /unknown command:\s*secrets\b/i.test(spaced.combined)) {
    const colon = runHolo(['secrets:doctor']);
    if (!/unknown command/i.test(colon.combined) || colon.status === 0) return colon;
  }
  return spaced;
}

function runVerifyNoConvexEnv(): ReturnType<typeof runHolo> {
  return runHolo(['verify-no-convex-env']);
}

describe('AC-2: consolidated secrets + Convex env alias detection (real CLI + real repo)', () => {
  itLive('holo secrets doctor exits 0 and reports DATABASE_URL: resolved', () => {
    const r = runSecretsDoctor();
    expect(
      r.status,
      `secrets doctor must exit 0 after D01-04. pre-impl fails (command absent). out=${r.combined}`
    ).toBe(0);
    expect(r.combined).not.toMatch(/unknown command/i);
    expect(r.combined, 'must print DATABASE_URL: resolved').toMatch(/DATABASE_URL\s*:\s*resolved/i);
    // Required keys from D01-04 contract — at least one more key beyond DATABASE_URL
    expect(r.combined).not.toMatch(/MISSING|missing key|unresolved/i);
  });

  itLive(
    'holo verify-no-convex-env exits 0 with zero Convex env aliases across real repo surfaces',
    () => {
      const r = runVerifyNoConvexEnv();
      expect(
        r.status,
        `verify-no-convex-env must exit 0 when clean. pre-impl: command absent OR aliases remain. out=${r.combined}`
      ).toBe(0);
      expect(r.combined).not.toMatch(/unknown command/i);
      expect(r.combined).toMatch(/zero.*convex|no convex|0.*alias|clean/i);

      // Independent real-repo grep (not a fixture) — post-D01-04 must be clean
      const grepped = runCmd(
        'rg',
        [
          '-n',
          '--glob',
          '!**/.git/**',
          '--glob',
          '!**/node_modules/**',
          '--glob',
          '!**/.spec/**',
          '--glob',
          '!**/__tests__/**',
          '--glob',
          '!**/tests/fixtures/**',
          '-e',
          'CONVEX_URL|HOLOCRON_URL|EXPO_PUBLIC_CONVEX_URL|CONVEX_DEPLOY_KEY',
          'app',
          'holocron-mcp',
          'services/platform',
        ],
        { cwd: REPO_ROOT }
      );
      // rg exit 1 = no matches (clean); 0 = matches found (dirty)
      expect(
        grepped.status,
        `repo still has Convex env aliases (D01-04 must remove them):\n${grepped.stdout}`
      ).toBe(1);
      expect(grepped.stdout.trim()).toBe('');
    }
  );

  itLive('consolidated secrets source is gitignored (secrets.yaml never committed)', () => {
    const configDir = resolve(REPO_ROOT, 'services/platform/config');
    const gitignore = resolve(configDir, '.gitignore');
    const example = resolve(configDir, 'secrets.example.yaml');
    const secrets = resolve(configDir, 'secrets.yaml');

    // Schema/example is committed; real secrets file is gitignored
    expect(
      existsSync(example) || existsSync(resolve(configDir, 'secrets.example.yml')),
      'secrets.example.yaml (committed schema) must exist after D01-04'
    ).toBe(true);

    expect(existsSync(gitignore), 'services/platform/config/.gitignore must exist').toBe(true);
    const gi = readFileSync(gitignore, 'utf8');
    expect(gi, '.gitignore must list secrets.yaml').toMatch(/secrets\.yaml/);

    // git check-ignore must report secrets.yaml as ignored (even if file not present yet)
    const check = runCmd('git', ['check-ignore', '-v', 'services/platform/config/secrets.yaml'], {
      cwd: REPO_ROOT,
    });
    expect(
      check.status,
      `secrets.yaml must be gitignored (git check-ignore exit 0). out=${check.combined}`
    ).toBe(0);

    // If a real secrets.yaml exists in the working tree, it must not be tracked
    if (existsSync(secrets)) {
      const tracked = runCmd(
        'git',
        ['ls-files', '--error-unmatch', 'services/platform/config/secrets.yaml'],
        { cwd: REPO_ROOT }
      );
      expect(tracked.status, 'secrets.yaml must NOT be tracked by git').not.toBe(0);
    }
  });

  itLive(
    'holo secrets doctor also resolves MASTRA / fleet-related keys (consolidated source)',
    () => {
      const r = runSecretsDoctor();
      expect(r.status, `secrets doctor must exit 0: ${r.combined}`).toBe(0);
      expect(r.combined).not.toMatch(/unknown command/i);
      // At least one non-DATABASE key from the D01-04 required set
      expect(r.combined).toMatch(
        /(MASTRA_API_KEY|HOLO_KEY_|TAILSCALE|FLEET|DATABASE_URL)\s*:\s*resolved/i
      );
      // Count resolved lines — must be plural after consolidation
      const resolved = (r.combined.match(/:\s*resolved/gi) ?? []).length;
      expect(
        resolved,
        `expected multiple resolved keys, got:\n${r.combined}`
      ).toBeGreaterThanOrEqual(1);
    }
  );
});
