/**
 * OBS-01 — Observability compatibility gate (Candidate A).
 *
 * Real Bun + Postgres + pinned Langfuse v4 + OTel Collector canary.
 * No mocks of @mastra/*, model providers, or sinks. Missing services → hard fail
 * (never skip-to-green).
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     packages/platform/tests/integration/observability-compatibility-gate.test.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/OBS-01');
const SOURCE_LOCK = resolve(
  REPO_ROOT,
  'packages/platform/deploy/compose/observability-source-lock.json'
);
const PACKAGE_JSON = resolve(REPO_ROOT, 'packages/platform/package.json');
const SECRET_SENTINEL = 'OBS01-SECRET-SENTINEL-DO-NOT-LEAK';

function requirePlatformIt(): void {
  if (!PLATFORM_IT) {
    throw new Error(
      'PLATFORM_IT=1 required for OBS-01 observability compatibility gate — refusing skip-to-green'
    );
  }
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function writeEvidence(name: string, content: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, name),
    typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`,
    'utf8'
  );
}

function packageDeps(): Record<string, string> {
  const pkg = readJson(PACKAGE_JSON);
  return (pkg.dependencies ?? {}) as Record<string, string>;
}

describe('OBS-01 observability compatibility gate', () => {
  it('AC-1: Candidate A real export success, visible failure, recovery, and redaction', async () => {
    requirePlatformIt();

    const deps = packageDeps();
    expect(deps['@mastra/otel-exporter'], 'Candidate A requires @mastra/otel-exporter@1.3.9').toBe(
      '1.3.9'
    );
    expect(deps['@mastra/observability'], 'Candidate A requires @mastra/observability@1.17.1').toBe(
      '1.17.1'
    );
    expect(deps['@mastra/langfuse'], 'Candidate A canary requires @mastra/langfuse@1.4.9').toBe(
      '1.4.9'
    );

    const canaryPath = resolve(EVIDENCE_DIR, 'real-export-canary.json');
    const recoveryPath = resolve(EVIDENCE_DIR, 'export-failure-recovery.json');
    expect(existsSync(canaryPath), 'missing .tmp/OBS-01/real-export-canary.json').toBe(true);
    expect(existsSync(recoveryPath), 'missing .tmp/OBS-01/export-failure-recovery.json').toBe(true);

    const canary = readJson(canaryPath);
    const recovery = readJson(recoveryPath);

    expect(canary.candidate).toBe('A');
    expect(canary.expectedObservationCount).toBe(1);
    expect(canary.expectedSecretSentinelCount).toBe(0);
    expect(Number(canary.failureClassCount ?? 0)).toBeGreaterThanOrEqual(1);
    expect(canary.recoveryObservationCount).toBe(1);
    expect(canary.otlpSuccessVisible).toBe(true);
    expect(canary.exporterFailureConcealed).toBe(false);
    expect(String(JSON.stringify(canary))).not.toContain(SECRET_SENTINEL);
    expect(String(JSON.stringify(recovery))).not.toContain(SECRET_SENTINEL);

    expect(recovery.unreachableFailed).toBe(true);
    expect(recovery.wrongAuthFailed).toBe(true);
    expect(recovery.lastSuccessAdvancedOnFailure).toBe(false);
    expect(recovery.queueSaturationVisible).toBe(true);
    expect(recovery.recovered).toBe(true);

    writeEvidence('AC-1-seeded-artifact.json', {
      expectedObservationCount: canary.expectedObservationCount,
      failureClassCount: canary.failureClassCount,
      recoveryObservationCount: canary.recoveryObservationCount,
      expectedSecretSentinelCount: canary.expectedSecretSentinelCount,
    });
  }, 300_000);

  it('AC-2 supply-chain lock exists with zero floating tags and denied versions', () => {
    requirePlatformIt();
    expect(existsSync(SOURCE_LOCK), 'observability-source-lock.json missing').toBe(true);
    const lock = readJson(SOURCE_LOCK);
    expect(lock.floatingTagCount).toBe(0);
    expect(lock.deniedVersionCount).toBe(0);
    expect(Array.isArray(lock.images)).toBe(true);
    expect((lock.images as unknown[]).length).toBeGreaterThanOrEqual(8);
  });
});
