/**
 * S31-07 AC-3 — every fleet call site writes telemetry through the instrumented client.
 *
 * Exercises 5 real CLI entrypoints; asserts inference_telemetry rows with
 * step_id (call_site) labels and non-null endpoint/role/wall_ms.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint31-telemetry-every-call.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSql } from '../../src/db/client';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const FLEET_TIMEOUT_MS = 300_000;
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-07');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const DATABASE_URL = process.env.DATABASE_URL?.includes('holocron_nonprod')
  ? process.env.DATABASE_URL
  : (process.env.DATABASE_URL?.replace(/\/holocron(?:\?|$)/, '/holocron_nonprod$1') ??
    'postgres://127.0.0.1:5432/holocron_nonprod');
const FLEET_URL = process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1';

const CALL_SITES = [
  'evals/scorers',
  'embed',
  'extract-structured',
  'probe-capability',
  'compat/cells/agent',
] as const;

const itLive = (
  name: string,
  fn: () => Promise<unknown> | undefined,
  timeout = FLEET_TIMEOUT_MS
) => {
  if (PLATFORM_IT) it(name, fn, timeout);
  else it.skip(name, fn);
};

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, name),
    typeof body === 'string' ? body : JSON.stringify(body, null, 2),
    'utf8'
  );
}

function runHolo(args: string[], timeoutMs = FLEET_TIMEOUT_MS) {
  const r = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: resolve(REPO_ROOT, 'services/platform'),
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL,
      FLEET_URL,
      FLEET_KEY: process.env.FLEET_KEY ?? 'sk-none',
    },
    timeout: timeoutMs,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    combined: `${r.stdout ?? ''}\n${r.stderr ?? ''}`,
  };
}

describe('S31-07 AC-3 everyFleetCallSiteWritesTelemetry', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    const fleet = await fetch(`${FLEET_URL}/models`).catch(() => null);
    if (!fleet?.ok) {
      throw new Error(`fleet unreachable at ${FLEET_URL}/models`);
    }
  });

  itLive('everyFleetCallSiteWritesTelemetry', async () => {
    const windowStart = new Date();
    // Marker so we can scope the case window tightly
    const caseMarker = `s31-07-ac3-${Date.now()}`;

    const sql = createSql(DATABASE_URL);
    try {
      const before = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n
        FROM inference_telemetry
        WHERE created_at >= ${windowStart}
      `;
      writeEvidence('ac3-before-count.json', { windowStart, before, caseMarker });
      // Soft: window may have concurrent rows; we assert by call_site presence after.

      const results: Record<string, { status: number | null; combined: string }> = {};

      // 1) evals:run → evals/scorers
      results['evals:run'] = runHolo(['evals:run', '--sample', 'known-good', '--json'], 180_000);

      // 2) embed:run → embed (document mode re-embed; may no-op if no NULL rows)
      // Prefer a direct one-shot via holo if available; also call through a tiny bun inline.
      // embed:run is the production entrypoint — it will call embed() for NULL vectors.
      results['embed:run'] = runHolo(['embed:run', '--json'], 180_000);

      // Force at least one embed telemetry row via a small production-path script that only
      // uses the public embed() helper (which routes through runFleetModelCall).
      const embedForce = spawnSync(
        BUN_BIN,
        [
          '-e',
          `
          import { embed } from './src/inference/embed.ts';
          const v = await embed('S31-07 AC-3 telemetry sweep ${caseMarker}', 'query', {
            runId: ${JSON.stringify(caseMarker)},
          });
          console.log(JSON.stringify({ ok: true, dim: v.length }));
          `,
        ],
        {
          cwd: resolve(REPO_ROOT, 'services/platform'),
          encoding: 'utf8',
          env: {
            ...process.env,
            DATABASE_URL,
            FLEET_URL,
            FLEET_KEY: process.env.FLEET_KEY ?? 'sk-none',
          },
          timeout: 120_000,
        }
      );
      results['embed:force'] = {
        status: embedForce.status,
        combined: `${embedForce.stdout ?? ''}\n${embedForce.stderr ?? ''}`,
      };

      // 3) extract — simple schema
      const extractSchema = resolve(EVIDENCE_DIR, 'ac3-extract-schema.json');
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(
        extractSchema,
        JSON.stringify({
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
          required: ['success', 'message'],
        }),
        'utf8'
      );
      // holo extract expects a named schema label — use built-in if any, else skip to probe path.
      // Fall back: call extractStructured via production CLI if available.
      results['extract'] = runHolo(
        [
          'extract',
          '--role',
          'divergent',
          '--input',
          'Return JSON with success=true and message="s31-07-ac3"',
          '--json',
        ],
        180_000
      );

      // 4) probe:capabilities
      results['probe:capabilities'] = runHolo(
        ['probe:capabilities', '--json', '--timeout', '45000'],
        300_000
      );

      // 5) compat:spike → compat/cells/agent
      results['compat:spike'] = runHolo(['compat:spike', '--json'], 300_000);

      writeEvidence('ac3-cli-results.json', results);

      // Core production entrypoints must succeed.
      expect(results['evals:run']?.status, results['evals:run']?.combined).toBe(0);
      expect(results['embed:force']?.status, results['embed:force']?.combined).toBe(0);
      expect(results['probe:capabilities']?.status, results['probe:capabilities']?.combined).toBe(
        0
      );
      // compat:spike may be red on OTel/storage cells; agent cell still writes telemetry.
      // Accept exit 0 or exit 1 as long as agent call site telemetry lands.

      // If extract CLI failed (missing schema label), force via extractStructured production path.
      if (results['extract']?.status !== 0) {
        const extractForce = spawnSync(
          BUN_BIN,
          [
            '-e',
            `
            import { z } from 'zod';
            import { randomUUID } from 'node:crypto';
            import { extractStructured } from './src/inference/extract-structured.ts';
            const schema = z.object({ success: z.boolean(), message: z.string() });
            try {
              const out = await extractStructured(
                schema,
                'Return a JSON object with success=true and message="s31-07-ac3".',
                'divergent',
                randomUUID()
              );
              console.log(JSON.stringify({ ok: true, object: out }));
            } catch (err) {
              // Telemetry is still written on model attempts; surface for evidence.
              console.log(JSON.stringify({
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              }));
              process.exit(0);
            }
            `,
          ],
          {
            cwd: resolve(REPO_ROOT, 'services/platform'),
            encoding: 'utf8',
            env: {
              ...process.env,
              DATABASE_URL,
              FLEET_URL,
              FLEET_KEY: process.env.FLEET_KEY ?? 'sk-none',
            },
            timeout: 180_000,
          }
        );
        results['extract:force'] = {
          status: extractForce.status,
          combined: `${extractForce.stdout ?? ''}\n${extractForce.stderr ?? ''}`,
        };
        writeEvidence('ac3-extract-force.json', results['extract:force']);
        expect(extractForce.status, results['extract:force'].combined).toBe(0);
      }

      const rows = await sql<
        {
          call_site: string | null;
          role: string;
          endpoint: string;
          tokens: number;
          wall_ms: number;
        }[]
      >`
        SELECT
          step_id AS call_site,
          role,
          endpoint,
          total_tokens AS tokens,
          wall_ms
        FROM inference_telemetry
        WHERE created_at >= ${windowStart}
        ORDER BY created_at DESC
        LIMIT 200
      `;
      writeEvidence('ac3-telemetry-rows.json', { windowStart, rows });

      expect(rows.length, 'at least 5 telemetry rows in case window').toBeGreaterThanOrEqual(5);

      const sites = new Set(rows.map((r) => r.call_site).filter(Boolean));
      writeEvidence('ac3-distinct-call-sites.json', { sites: [...sites] });

      for (const site of CALL_SITES) {
        expect(
          [...sites].some((s) => s === site || (s ?? '').includes(site)),
          `missing call_site ${site}; have ${[...sites].join(', ')}`
        ).toBe(true);
      }

      const nullBad = rows.filter((r) => r.endpoint == null || r.role == null || r.wall_ms == null);
      expect(nullBad, '0 rows with null endpoint/role/wall_ms').toEqual([]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
