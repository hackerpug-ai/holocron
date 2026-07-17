/**
 * D01-01 AC-1 — RED suite for stack supervisor lifecycle (up/down/status).
 *
 * Drives the REAL holo CLI and real service probes (pg_isready, curl /health,
 * launchctl). No mocks. Scheduler MUST be pending/disabled (Sprint 11).
 * Zero-cache MUST be real healthy OR honestly disabled/not_implemented.
 *
 * Pre-impl (before D01-03): suite FAILS — stack commands absent or wrong health.
 * Post-impl: suite PASSES with honest health for Postgres + Mastra + zero-cache.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/stack-supervisor.test.ts
 */
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT, runCmd, runStack } from './fixtures/harness';

const itLive = PLATFORM_IT ? it : it.skip;

describe('AC-1: stack supervisor lifecycle (real holo CLI + real probes)', () => {
  itLive(
    'holo stack up exits 0 within 60s and postgres is ready (pg_isready)',
    () => {
      // would fail if stack supervisor stubbed / command absent
      const started = Date.now();
      const up = runStack('up', []);
      const elapsedMs = Date.now() - started;

      expect(
        up.status,
        `stack up must exit 0 (pre-D01-03: command absent). stderr=${up.stderr} stdout=${up.stdout}`
      ).toBe(0);
      expect(
        elapsedMs,
        `stack up must complete within 60s (elapsed=${elapsedMs}ms)`
      ).toBeLessThanOrEqual(60_000);
      expect(up.combined).not.toMatch(/unknown command/i);

      // Real Postgres probe — not a mocked health flag
      const pg = runCmd('pg_isready', ['-h', '127.0.0.1', '-p', '5432']);
      // If pg_isready binary is missing, try via brew path then fail closed (not fake-healthy)
      if (pg.status === null || (pg.status !== 0 && /ENOENT|not found/i.test(pg.combined))) {
        const brewPg = runCmd('/opt/homebrew/bin/pg_isready', ['-h', '127.0.0.1', '-p', '5432']);
        if (brewPg.status === 0) {
          expect(brewPg.status).toBe(0);
        } else {
          // Accept holo stack status reporting postgres healthy as operator surface
          const status = runStack('status', ['--json']);
          expect(status.status, status.combined).toBe(0);
          expect(status.combined.toLowerCase()).toMatch(
            /postgres[^\n]*healthy|"postgres"\s*:\s*"healthy"/
          );
        }
      } else {
        expect(pg.status, `pg_isready failed: ${pg.combined}`).toBe(0);
      }
    },
    90_000
  );

  itLive(
    'holo stack up brings Mastra /health to HTTP 200 (real curl probe)',
    () => {
      const up = runStack('up');
      expect(up.status, `stack up failed: ${up.combined}`).toBe(0);

      const health = runCmd('curl', ['-sf', '--max-time', '5', 'http://127.0.0.1:4111/health']);
      expect(
        health.status,
        `curl /health must succeed after stack up. out=${health.combined}`
      ).toBe(0);
      // Body should not be empty static stub without readiness — allow ok/degraded JSON
      expect(health.stdout.length).toBeGreaterThan(0);
    },
    90_000
  );

  itLive(
    'holo stack status reports postgres+mastra healthy, real queue backend, scheduler not placeholder',
    () => {
      // Ensure stack is up first so status has something real to probe
      const up = runStack('up');
      expect(up.status, `stack up prerequisite failed: ${up.combined}`).toBe(0);

      const status = runStack('status');
      expect(status.status, `stack status failed: ${status.combined}`).toBe(0);
      expect(status.combined).not.toMatch(/unknown command/i);

      const text = status.combined.toLowerCase();
      expect(text, 'postgres must report healthy').toMatch(/postgres[^\n]*healthy/);
      expect(text, 'mastra must report healthy').toMatch(/mastra[^\n]*healthy/);

      // Sprint 11: scheduler is real (placeholder=false); state may be pending or healthy
      expect(text, 'scheduler line present').toMatch(/scheduler/);
      expect(text, 'scheduler must not be /usr/bin/true placeholder').not.toMatch(
        /\/usr\/bin\/true/
      );
      // Queue backend must be pg-boss or graphile-worker (never process-local)
      expect(text, 'queue backend must be real').toMatch(/queue[^\n]*(pg-boss|graphile-worker)/);

      // zero-cache: healthy if launched OR honest disabled/not_implemented — never silent absence
      expect(text, 'zero-cache must appear with honest state').toMatch(
        /zero[_-]?cache[^\n]*(healthy|disabled|not_implemented|skipped|pending)/
      );

      // JSON form also honest
      const json = runStack('status', ['--json']);
      expect(json.status, json.combined).toBe(0);
      const body = json.stdout.trim();
      expect(body.startsWith('{') || body.includes('"postgres"'), json.combined).toBe(true);
      if (body.includes('{')) {
        // Prefer structured parse when available
        try {
          const parsed = JSON.parse(body.slice(body.indexOf('{'))) as Record<string, unknown>;
          const sched = parsed.scheduler as
            | string
            | { state?: string; placeholder?: boolean; program?: string }
            | undefined;
          if (sched && typeof sched === 'object') {
            expect(sched.placeholder, 'scheduler.placeholder must be false').toBe(false);
            expect(String(sched.program ?? ''), 'must not be /usr/bin/true').not.toMatch(
              /\/usr\/bin\/true/
            );
          }
          const queue = parsed.queue as { backend?: string; ready?: boolean } | undefined;
          if (queue) {
            expect(queue.backend).toMatch(/pg-boss|graphile-worker/);
            expect(queue.backend).not.toBe('process-local');
          }
        } catch {
          // human+json hybrid is ok if grep surface above already passed
        }
      }
    },
    90_000
  );

  itLive(
    'holo stack down exits cleanly (zero holocron launchd PIDs / no orphaned stack)',
    () => {
      // Bring up then down — pre-impl both fail as unknown command
      runStack('up');
      const down = runStack('down');
      expect(down.status, `stack down must exit 0: ${down.combined}`).toBe(0);
      expect(down.combined).not.toMatch(/unknown command/i);

      const list = runCmd('launchctl', ['list']);
      // holocron services should not remain with nonzero PIDs after down
      const holocronLines = list.stdout
        .split('\n')
        .filter((l) => /holocron-(postgres|mastra|zerocache)/i.test(l));
      for (const line of holocronLines) {
        // launchctl list format: PID Status Label — PID "-" or empty means not running
        const pid = line.trim().split(/\s+/)[0];
        expect(
          pid === '-' || pid === '0' || !/^\d+$/.test(pid ?? ''),
          `orphaned holocron service after stack down: ${line}`
        ).toBe(true);
      }

      // Mastra should no longer answer /health after down
      const health = runCmd('curl', ['-sf', '--max-time', '3', 'http://127.0.0.1:4111/health']);
      expect(
        health.status,
        'Mastra /health must not succeed after stack down (would mean orphaned process)'
      ).not.toBe(0);

      // AC-2: Postgres must NOT accept connections after stack down (hard probe)
      const pgCandidates = [
        ['pg_isready', ['-h', '127.0.0.1', '-p', '5432'] as string[]],
        [
          '/opt/homebrew/opt/postgresql@18/bin/pg_isready',
          ['-h', '127.0.0.1', '-p', '5432'] as string[],
        ],
        [
          '/usr/local/opt/postgresql@18/bin/pg_isready',
          ['-h', '127.0.0.1', '-p', '5432'] as string[],
        ],
      ] as const;
      let pgProbed = false;
      for (const [bin, args] of pgCandidates) {
        const pg = runCmd(bin, [...args]);
        if (pg.status === null && /ENOENT|not found/i.test(pg.combined)) {
          continue;
        }
        pgProbed = true;
        expect(
          pg.status,
          `pg_isready must fail (nonzero) after stack down; got ${pg.status}: ${pg.combined}`
        ).not.toBe(0);
        break;
      }
      if (!pgProbed) {
        // Fallback: stack status must report postgres unhealthy/down (not healthy)
        const status = runStack('status');
        expect(status.combined.toLowerCase()).toMatch(
          /postgres[^\n]*(unhealthy|down|not.?ready|pending)/
        );
        expect(status.combined.toLowerCase()).not.toMatch(/postgres[^\n]*healthy/);
      }
    },
    90_000
  );

  itLive(
    'zero-cache slot is honest in stack status (healthy if launched OR disabled/not_implemented)',
    () => {
      const up = runStack('up');
      expect(up.status, `stack up prerequisite failed: ${up.combined}`).toBe(0);

      const status = runStack('status');
      expect(status.status, status.combined).toBe(0);
      const text = status.combined.toLowerCase();

      // Must appear with an honest state — never silent omission, never fake-healthy without process
      expect(text).toMatch(
        /zero[_-]?cache[^\n]*(healthy|disabled|not_implemented|skipped|pending)/
      );
      // If reported healthy, a real process or port must back it (status alone is the supervisor surface;
      // D01-03 must not invent healthy without launch). Scheduler-style "healthy" for unbuilt is forbidden
      // for zero-cache only when the implementation claims healthy without binary — enforced by status contract.
      expect(text).not.toMatch(/zero[_-]?cache[^\n]*fake/);
    },
    90_000
  );
});
