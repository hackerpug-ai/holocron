/**
 * S31-06 AC-1 + AC-4: extraction strategy comes from the boot capability probe;
 * repair-mode roles still fail explicitly past the cap.
 *
 * NEGATIVE_CONTROL (would fail if):
 * - stub probe / mock fleet / static capability map / empty probe result
 * - extract-structured has 0 references to probe-capability
 * - constrained (or probe-selected) path records committed false / wrong mode
 * - always-malformed succeeds or records attempts ≠ MAX_REPAIR_ATTEMPTS
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     packages/platform/tests/integration/sprint31-probe-driven-extraction.test.ts
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUN_BIN,
  HOLO_CLI,
  PLATFORM_IT,
  REPO_ROOT,
  runHolo,
} from '../../../../tests/integration/service/harness';

const FLEET_TIMEOUT = 420_000;
const itLive = PLATFORM_IT ? it : it.skip;

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-06/probe');
const EXTRACTIONS_DIR = join(REPO_ROOT, '.tmp', 'extractions');
const EXTRACT_STRUCTURED = resolve(
  REPO_ROOT,
  'packages/platform/src/inference/extract-structured.ts'
);
const FLEET_MODELS = 'http://127.0.0.1:4545/v1/models';

type RoleCap = {
  role: string;
  supportsJsonSchema: boolean;
  mode: 'constrained' | 'repair';
  endpoint: string;
  litellmModelId: string;
  error?: string;
};

function parseJsonOut(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  if (start < 0) throw new Error(`no JSON object in output:\n${text}`);
  return JSON.parse(trimmed.slice(start)) as Record<string, unknown>;
}

function writeArtifact(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = join(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function listExtractionIds(): Set<string> {
  if (!existsSync(EXTRACTIONS_DIR)) return new Set();
  return new Set(
    readdirSync(EXTRACTIONS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
  );
}

/** Fleet /v1/models can ECONNRESET under burst load — retry before declaring unreachable. */
async function assertFleetReachable(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(FLEET_MODELS, { signal: AbortSignal.timeout(10_000) });
      if (res.status === 200) return;
      lastErr = new Error(`fleet /v1/models HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `fleet unreachable at ${FLEET_MODELS}: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`
  );
}

describe('S31-06 AC-1: extraction consumes the boot probe', () => {
  itLive(
    'extractionConsumesTheBootProbe',
    async () => {
      // Confirm fleet is reachable before any probe.
      await assertFleetReachable();

      // Live probe via real CLI entrypoint.
      const probeRun = runHolo(['probe:capabilities', '--json']);
      expect(probeRun.status).toBe(0);
      const probeJson = parseJsonOut(probeRun.stdout);
      expect(probeJson.ok).toBe(true);
      const capabilities = probeJson.capabilities as Record<string, RoleCap>;
      writeArtifact('ac1-live-probe.json', probeJson);

      const roles = Object.keys(capabilities);
      expect(roles).toHaveLength(6);
      for (const role of roles) {
        const cap = capabilities[role];
        expect(cap).toBeDefined();
        if (!cap) continue;
        expect(cap.mode === 'constrained' || cap.mode === 'repair').toBe(true);
        expect(cap.endpoint).toBeTruthy();
        expect(cap.endpoint).not.toMatch(/placeholder|probe failed/i);
        expect(cap.litellmModelId).toBeTruthy();
        expect(cap.litellmModelId).not.toMatch(/placeholder|probe failed/i);
      }

      // Prefer a probe-constrained role; otherwise a chat role the probe selected as repair.
      // Live fleet (2026-08): all roles are repair (json_schema → content=null). The PRIMARY
      // proof is a committed extraction at attempts=1 under the probe-selected mode — the
      // historical 0/213 attempts=1 rate came from starting constrained then adapting.
      const constrainedRole = roles.find((r) => capabilities[r]?.mode === 'constrained');
      const chatRoles = ['divergent', 'convergent', 'judge'];
      const targetRole =
        constrainedRole ?? chatRoles.find((r) => capabilities[r]?.mode === 'repair') ?? 'divergent';
      const targetCap = capabilities[targetRole];
      expect(targetCap).toBeDefined();
      const probeMode = targetCap?.mode;
      expect(probeMode === 'constrained' || probeMode === 'repair').toBe(true);

      // Source must reference the probe module (TC-1).
      const extractSrc = readFileSync(EXTRACT_STRUCTURED, 'utf8');
      expect(extractSrc).toMatch(/probe-capability/);
      expect(
        (
          extractSrc.match(
            /probe-capability|probeRoleCapability|ensureBootCapabilityMap|bootCapabilityMap/g
          ) ?? []
        ).length
      ).toBeGreaterThanOrEqual(1);

      // Must not observe the historical contradiction: all repair while manifest claims true for 3.
      const manifest = JSON.parse(
        readFileSync(resolve(REPO_ROOT, 'packages/platform/fleet/manifest.json'), 'utf8')
      ) as {
        roles: Record<string, { structuredOutput: boolean }>;
      };
      const declaredTrue = Object.entries(manifest.roles)
        .filter(([, e]) => e.structuredOutput === true)
        .map(([name]) => name);
      const allRepair = roles.every((r) => capabilities[r]?.mode === 'repair');
      if (allRepair) {
        expect(declaredTrue).toHaveLength(0);
      }

      const before = listExtractionIds();
      const extract = runHolo(['extract', '--role', targetRole, '--fixture', 'good', '--json']);
      expect(extract.status, `extract stderr: ${extract.stderr}`).toBe(0);
      const extractOut = parseJsonOut(extract.stdout);
      expect(extractOut.ok).toBe(true);
      expect(extractOut.extractionId).toBeTruthy();
      expect(extractOut.result).toBeTruthy();

      const statusRun = runHolo(['extract:status', String(extractOut.extractionId), '--json']);
      expect(statusRun.status).toBe(0);
      const status = parseJsonOut(statusRun.stdout);
      writeArtifact('ac1-extract-status.json', status);

      expect(status.ok).toBe(true);
      expect(status.status).toBe('success');
      expect(status.committed).toBe(true);
      expect(status.attempts).toBe(1);
      // initialMode must equal the probe-selected mode for that role (TC-2/TC-3/TC-4).
      expect(status.initialMode).toBe(probeMode);
      expect(status.modeSource).toBe('boot-probe');
      expect(status.committed).not.toBe(false);

      // When a constrained role exists, it must be the path under test.
      if (constrainedRole) {
        expect(status.initialMode).toBe('constrained');
      }

      // Negative control residual: we created a new status file (not a static fixture).
      const after = listExtractionIds();
      expect([...after].some((id) => !before.has(id))).toBe(true);
    },
    FLEET_TIMEOUT
  );
});

describe('S31-06 AC-4: repair-mode roles still fail explicitly past the cap', () => {
  itLive(
    'repairModeStillFailsExplicitly',
    async () => {
      await assertFleetReachable();

      const probeRun = runHolo(['probe:capabilities', '--json']);
      expect(probeRun.status).toBe(0);
      const probeJson = parseJsonOut(probeRun.stdout);
      const capabilities = probeJson.capabilities as Record<string, RoleCap>;

      // Pick a chat role the probe reports as repair.
      const repairRole =
        ['divergent', 'convergent', 'judge'].find((r) => capabilities[r]?.mode === 'repair') ??
        'divergent';
      expect(capabilities[repairRole]?.mode).toBe('repair');

      const before = listExtractionIds();
      const extract = runHolo([
        'extract',
        '--role',
        repairRole,
        '--fixture',
        'always-malformed',
        '--json',
      ]);
      expect(extract.status).toBe(1);
      const err = parseJsonOut(extract.stderr);
      expect(err.ok).toBe(false);
      expect(err.error).toBe('EXTRACTION_FAILED');
      expect(err.attempts).toBe(3);

      const after = listExtractionIds();
      const created = [...after].filter((id) => !before.has(id));
      expect(created.length).toBeGreaterThanOrEqual(1);
      const extractionId = created.find((id) => {
        try {
          const raw = readFileSync(join(EXTRACTIONS_DIR, `${id}.json`), 'utf8');
          const rec = JSON.parse(raw) as {
            status?: string;
            committed?: boolean;
            attempts?: number;
            error?: { attempts?: number; code?: string };
            schemaErrors?: unknown[];
            result?: unknown;
          };
          return (
            rec.status === 'extraction_failed' &&
            rec.committed === false &&
            (rec.attempts === 3 || rec.error?.attempts === 3)
          );
        } catch {
          return false;
        }
      });
      expect(extractionId).toBeTruthy();

      const statusRun = runHolo(['extract:status', extractionId as string, '--json']);
      expect(statusRun.status).toBe(0);
      const status = parseJsonOut(statusRun.stdout);
      writeArtifact('ac4-extract-status.json', status);

      expect(status.status).toBe('extraction_failed');
      expect(status.committed).toBe(false);
      expect(status.attempts ?? (status.error as { attempts?: number } | undefined)?.attempts).toBe(
        3
      );
      expect((status.error as { code?: string } | undefined)?.code).toBe('EXTRACTION_FAILED');
      expect(Array.isArray(status.schemaErrors)).toBe(true);
      expect((status.schemaErrors as unknown[]).length).toBe(3);
      // No persisted result object on the failure path (TC-16).
      expect(status.result).toBeUndefined();
    },
    FLEET_TIMEOUT
  );
});

describe('S31-06 gating', () => {
  it('PLATFORM_IT gate is required for live fleet assertions', () => {
    expect(typeof PLATFORM_IT).toBe('boolean');
    expect(BUN_BIN).toBeTruthy();
    expect(HOLO_CLI).toContain('holo.ts');
  });
});
