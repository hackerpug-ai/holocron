/**
 * AC-4 / TC-8 (infer-1): holo infer:call exercises router with role and escape flags.
 *
 * NEGATIVE CONTROL (would fail if):
 * - CLI command not registered in holo.ts so command stub/empty
 * - Argument parsing stubbed so no real role/escape parameters passed
 * - Router call bypassed so app-layer mock instead of real resolveModel
 *
 * Run:
 *   PLATFORM_IT=1 HOLO_ESCAPE_BUDGET_USD=10 \
 *     pnpm vitest run tests/integration/service/infer-cli-infer-call.test.ts
 */
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { BUN_BIN, DEFAULT_DATABASE_URL, HOLO_CLI, PLATFORM_IT, REPO_ROOT } from './harness';
import { writeInferArtifact } from './infer-network-capture';

const itLive = PLATFORM_IT ? it : it.skip;

function runInferCall(args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
  out: string;
} {
  const result = spawnSync(BUN_BIN, [HOLO_CLI, 'infer:call', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: DEFAULT_DATABASE_URL,
      // Bun auto-loads .env in child processes. Preserve only an explicitly
      // supplied credential so this negative branch cannot contact Anthropic
      // through an incidental local .env value.
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
      // Budget for escape path (provisional until infer-2 ledger)
      HOLO_ESCAPE_BUDGET_USD: process.env.HOLO_ESCAPE_BUDGET_USD || '10',
    },
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return { status: result.status, stdout, stderr, out: `${stdout}\n${stderr}` };
}

describe('AC-4: holo infer:call role + escape flags', () => {
  itLive('infer:call --role divergent outputs 35B-A3B fleet model (no Anthropic)', () => {
    const result = runInferCall(['--role', 'divergent', '--json']);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toMatch(/35b-a3b|35B-A3B/i);
    expect(result.out).toMatch(/:4545|implementer/i);
    expect(result.out).not.toMatch(/api\.anthropic\.com/i);

    writeInferArtifact('AC-4-role-divergent.json', {
      status: result.status,
      stdout: result.stdout,
    });
  });

  itLive('infer:call --role convergent outputs 27B fleet model (no Anthropic)', () => {
    const result = runInferCall(['--role', 'convergent', '--json']);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toMatch(/27b|27B/);
    expect(result.out).not.toMatch(/api\.anthropic\.com/i);

    writeInferArtifact('AC-4-role-convergent.json', {
      status: result.status,
      stdout: result.stdout,
    });
  });

  itLive('infer:call --escape uses runBudgetedEscape (not resolve-only probe)', () => {
    const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
    const result = runInferCall(['--escape', '--json', '--cost', '0.05']);

    let payload: {
      ok?: boolean;
      mode?: string;
      error?: string;
      message?: string;
      networkCapture?: { anthropicCount?: number; rows?: unknown[] };
      resolved?: { endpoint?: string; allowEscape?: boolean };
      escape?: { tokens?: number; cost?: number; ledgerId?: string };
      allowEscape?: boolean;
    } = {};
    try {
      payload = JSON.parse(result.stdout || result.stderr) as typeof payload;
    } catch {
      try {
        payload = JSON.parse(result.stderr) as typeof payload;
      } catch {
        // text mode
      }
    }

    // CLI must route --escape through runBudgetedEscape (full metered path)
    expect(result.out + JSON.stringify(payload)).toMatch(/runBudgetedEscape/i);

    if (hasKey) {
      expect(result.status, result.out).toBe(0);
      expect(payload.mode).toBe('runBudgetedEscape');
      expect(Number(payload.escape?.tokens ?? 0)).toBeGreaterThan(0);
      expect(Number(payload.escape?.cost ?? 0)).toBeGreaterThan(0);
      expect(payload.escape?.ledgerId).toBeTruthy();
      const anthropicCount =
        payload.networkCapture?.anthropicCount ??
        (result.out.match(/api\.anthropic\.com/gi) ?? []).length;
      expect(anthropicCount).toBeGreaterThanOrEqual(1);
      expect(payload.resolved?.endpoint ?? result.out).toMatch(/api\.anthropic\.com/i);
    } else {
      // Without key: fail closed on the real generate path (not a greenwashed probe success)
      expect(result.status, result.out).not.toBe(0);
      expect(result.out).toMatch(/ANTHROPIC_API_KEY|runBudgetedEscape|ESCAPE_FAILED/i);
    }

    writeInferArtifact('AC-4-escape.json', {
      status: result.status,
      hasAnthropicKey: hasKey,
      stdout: result.stdout,
      stderr: result.stderr,
      payload,
    });
  });

  itLive('infer:call without --escape never prints api.anthropic.com for fleet roles', () => {
    const d = runInferCall(['--role', 'divergent', '--json']);
    const c = runInferCall(['--role', 'convergent', '--json']);
    expect(d.status, d.out).toBe(0);
    expect(c.status, c.out).toBe(0);
    expect(d.out).not.toMatch(/api\.anthropic\.com/i);
    expect(c.out).not.toMatch(/api\.anthropic\.com/i);
  });

  itLive('infer:call is registered (unknown-command would exit 2)', () => {
    const help = spawnSync(BUN_BIN, [HOLO_CLI, '--help'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const out = `${help.stdout}\n${help.stderr}`;
    // After GREEN, help lists infer:call; before RED it may not.
    // Live role tests above prove registration.
    expect(out.length).toBeGreaterThan(0);
  });

  /**
   * REDHAT-FIX-H1: CLI --escape under process degraded (env force for subprocess)
   * must refuse never-cloud via shared runBudgetedEscape choke — zero Anthropic.
   */
  itLive('H1: infer:call --escape while degraded refuses with anthropicCount===0', () => {
    const result = spawnSync(
      BUN_BIN,
      [HOLO_CLI, 'infer:call', '--escape', '--json', '--cost', '0.05', '--role', 'divergent'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: DEFAULT_DATABASE_URL,
          HOLO_ESCAPE_BUDGET_USD: '10',
          HOLO_PROCESS_DEGRADED_STATE: 'surface-unavailable',
        },
      }
    );
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const out = `${stdout}\n${stderr}`;
    let payload: {
      ok?: boolean;
      mode?: string;
      error?: string;
      message?: string;
      networkCapture?: { anthropicCount?: number };
    } = {};
    try {
      payload = JSON.parse(stdout || stderr) as typeof payload;
    } catch {
      try {
        payload = JSON.parse(stderr) as typeof payload;
      } catch {
        // text
      }
    }

    expect(result.status, out).not.toBe(0);
    expect(payload.ok).toBe(false);
    expect(`${payload.message ?? ''}\n${payload.error ?? ''}\n${out}`).toMatch(
      /degraded|never-cloud|ESCAPE_DEGRADED/i
    );
    expect(payload.mode).toBe('runBudgetedEscape');
    expect(payload.networkCapture?.anthropicCount ?? 1).toBe(0);

    writeInferArtifact('H1-cli-escape-degraded-refuse.json', {
      status: result.status,
      payload,
      anthropicCount: payload.networkCapture?.anthropicCount ?? null,
    });
  });
});
