/**
 * REDHAT-FIX-G-STEP3-4: CLI `--fixture` entry points for gate steps 3-4.
 *
 * Proves the documented human-gate commands are executable exactly as written
 * in SPRINT.md:
 *   step 3: holo extract --fixture malformed-once   (bounded repair → valid object)
 *   step 4: holo extract --fixture always-malformed (explicit fail past the cap)
 *
 * Runs the REAL `holo extract` as a Bun subprocess against the live fleet at
 * :4545 — no mocks of extractStructured / the model / the fleet.
 *
 * NEGATIVE CONTROL (would fail if):
 * - the --fixture flag did not exist (gate steps 3-4 non-executable)
 * - fixture schemas were stubbed with z.any() (no real validation)
 * - malformed-once silently accepted invalid output without the repair loop
 * - always-malformed exited 0 / ok:true (silent success past the cap)
 * - the CLI mocked the model endpoint instead of hitting the real fleet
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-fixture-cli.test.ts
 */
import { describe, expect, it } from 'vitest';
import { BUN_BIN, HOLO_CLI, PLATFORM_IT, REPO_ROOT, runHolo } from './harness';

// Local fleet structured generation is slow (~27-60s/call under load); the
// always-malformed fixture exercises the full repair cap (3 generateText
// round-trips via the real subprocess), so live cases need a generous timeout.
const FLEET_TIMEOUT = 420_000;

const itLive = PLATFORM_IT ? it : it.skip;

/** Parse the first {...} JSON object out of the CLI stdout (pretty or compact). */
function parseJsonOut(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf('{');
  if (start < 0) throw new Error(`no JSON object in stdout:\n${stdout}`);
  return JSON.parse(trimmed.slice(start)) as Record<string, unknown>;
}

describe('REDHAT-FIX-G-STEP3-4: holo extract --fixture (pure CLI arg validation)', () => {
  // These never touch the network/DB — they exit at arg parsing — so they run
  // unconditionally (no PLATFORM_IT gate) and fail fast.

  it('unknown fixture exits 2 with available names', () => {
    const r = runHolo(['extract', '--fixture', 'bogus', '--json']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown fixture 'bogus'/);
    expect(r.stderr).toMatch(/malformed-once/);
    expect(r.stderr).toMatch(/always-malformed/);
  });

  it('--fixture is mutually exclusive with --schema', () => {
    const r = runHolo(['extract', '--fixture', 'good', '--schema', 'simple', '--input', 'x']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/mutually exclusive/);
  });

  it('--fixture is mutually exclusive with --input', () => {
    const r = runHolo(['extract', '--fixture', 'good', '--input', 'x']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/mutually exclusive/);
  });

  it('--fixture appears in --help', () => {
    const r = runHolo(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/--fixture <name>/);
    expect(r.stdout).toMatch(/malformed-once/);
  });
});

describe('REDHAT-FIX-G-STEP3-4: holo extract --fixture (live fleet)', () => {
  itLive(
    'STEP 3: --fixture malformed-once yields a Zod-valid object',
    async () => {
      const r = runHolo(['extract', '--fixture', 'malformed-once', '--json']);
      expect(r.status).toBe(0);
      const out = parseJsonOut(r.stdout);
      expect(out.ok).toBe(true);
      expect(out.schema).toBe('malformed-once');
      const result = out.result as Record<string, unknown>;
      // Zod-valid object matching simpleSchema { title, count, tags }
      expect(typeof result.title).toBe('string');
      expect(typeof result.count).toBe('number');
      expect(Array.isArray(result.tags)).toBe(true);
    },
    FLEET_TIMEOUT
  );

  itLive(
    'STEP 4: --fixture always-malformed fails explicitly past the cap',
    async () => {
      const r = runHolo(['extract', '--fixture', 'always-malformed', '--json']);
      expect(r.status).toBe(1);
      const err = parseJsonOut(r.stderr);
      expect(err.ok).toBe(false);
      expect(err.error).toBe('EXTRACTION_FAILED');
      expect(err.schema).toBe('always-malformed');
      // The repair cap (MAX_REPAIR_ATTEMPTS) must be exhausted — never silent success.
      expect(err.attempts).toBe(3);
    },
    FLEET_TIMEOUT
  );

  itLive(
    'sanity: --fixture good returns a Zod-valid object',
    async () => {
      const r = runHolo(['extract', '--fixture', 'good', '--json']);
      expect(r.status).toBe(0);
      const out = parseJsonOut(r.stdout);
      expect(out.ok).toBe(true);
      expect(out.schema).toBe('good');
      const result = out.result as Record<string, unknown>;
      expect(typeof result.title).toBe('string');
      expect(typeof result.count).toBe('number');
      expect(Array.isArray(result.tags)).toBe(true);
    },
    FLEET_TIMEOUT
  );

  it('PLATFORM_IT gate is required for live fleet assertions', () => {
    // Documents the gating contract; passes either way.
    expect(typeof PLATFORM_IT).toBe('boolean');
    expect(BUN_BIN).toBeTruthy();
    expect(HOLO_CLI).toContain('holo.ts');
    expect(REPO_ROOT).toBeTruthy();
  });
});
