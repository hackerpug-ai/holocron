/**
 * S31-07 AC-4 + AC-5 — fleet client bypass guard + observability module graph.
 *
 * AC-4: constructing a fleet model outside the instrumented client fails the guard.
 * AC-5: observability package has 0 test-only modules (exporter is production-reachable).
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run packages/platform/tests/integration/sprint31-fleet-client-bypass-guard.test.ts
 */
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanFleetClientBypass, scanObservabilityModuleGraph } from '../../src/inference/telemetry';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-07');
const SRC_ROOT = resolve(REPO_ROOT, 'packages/platform/src');
const PROBE_PATH = resolve(SRC_ROOT, 's31-07-bypass-probe-module.ts');

const itLive = PLATFORM_IT ? it : it.skip;

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, name),
    typeof body === 'string' ? body : JSON.stringify(body, null, 2),
    'utf8'
  );
}

describe('S31-07 AC-4/AC-5 fleet client bypass guard + observability graph', () => {
  itLive('guardCatchesAFutureBypass — AC-4', () => {
    const clean = scanFleetClientBypass({ srcRoot: SRC_ROOT });
    writeEvidence('ac4-clean-guard.json', clean);
    expect(clean.ok, `clean tree must pass guard: ${JSON.stringify(clean.violations)}`).toBe(true);
    expect(clean.scannedFiles).toBeGreaterThan(10);
    // Rule set is construction-site based — only definition + instrumented client allowed.
    // No hardcoded list of known good callers (evals/scorers, embed, …).
    expect(clean.violations).toEqual([]);

    mkdirSync(dirname(PROBE_PATH), { recursive: true });
    writeFileSync(
      PROBE_PATH,
      `/**
 * Temporary S31-07 probe — constructs a fleet model directly (bypass).
 * Added and deleted inside the guardCatchesAFutureBypass case.
 */
import { createFleetChatModel, resolveModel } from './inference/resolve-model.ts';

export async function s31BypassProbe() {
  const resolved = await resolveModel('divergent', { allowEscape: false });
  return createFleetChatModel(resolved);
}
`,
      'utf8'
    );

    try {
      const dirty = scanFleetClientBypass({ srcRoot: SRC_ROOT });
      writeEvidence('ac4-dirty-guard.json', dirty);
      expect(dirty.ok, 'guard must fail while probe module is present').toBe(false);
      expect(dirty.violations.length).toBeGreaterThan(0);
      const named = dirty.violations.some(
        (v) =>
          v.file.includes('s31-07-bypass-probe-module') && /createFleetChatModel/.test(v.snippet)
      );
      expect(
        named,
        `failure must name probe path + createFleetChatModel: ${JSON.stringify(dirty.violations)}`
      ).toBe(true);
    } finally {
      try {
        unlinkSync(PROBE_PATH);
      } catch {
        // ignore
      }
    }

    const cleaned = scanFleetClientBypass({ srcRoot: SRC_ROOT });
    writeEvidence('ac4-re-clean-guard.json', cleaned);
    expect(cleaned.ok, 'guard must pass again after probe deleted').toBe(true);
  });

  itLive('noObservabilityModuleIsTestOnly — AC-5', () => {
    const graph = scanObservabilityModuleGraph({
      platformRoot: resolve(REPO_ROOT, 'packages/platform/src'),
    });
    writeEvidence('ac5-module-graph.json', graph);

    expect(
      graph.productionReachable.some((m) => m.includes('langfuse-exporter')),
      `langfuse-exporter must be production-reachable: ${JSON.stringify(graph)}`
    ).toBe(true);
    expect(
      graph.productionReachable.some((m) => m.includes('mission-research')),
      `mission-research must be production-reachable: ${JSON.stringify(graph)}`
    ).toBe(true);
    expect(graph.productionReachable.length).toBeGreaterThanOrEqual(1);
    expect(
      graph.testOnly,
      `observability test-only set must be empty: ${JSON.stringify(graph.testOnly)}`
    ).toEqual([]);
    expect(graph.ok).toBe(true);
  });
});
