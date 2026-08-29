/**
 * S31-CX-04 — Derive the referential edge set from convex/schema.ts and
 * fail-close the FK audit gate on unenforced edges.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     pnpm test:integration -- packages/platform/tests/integration/sprint31-cx04-referential-edges.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultCatalogPath, loadCatalog } from '../../src/catalog/catalog-loader.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../../src/db/connection.ts';
import { runFkAudit } from '../../src/etl/fk-audit.ts';
import {
  buildTopologicalLoadOrder,
  DEFAULT_REFERENTIAL_EDGES_ARTIFACT,
  extractReferentialEdges,
  loadReferentialEdgesArtifact,
  writeReferentialEdgesArtifact,
} from '../../src/etl/referential-edges.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
if (!PLATFORM_IT) {
  throw new Error('sprint31-cx04-referential-edges requires PLATFORM_IT=1');
}

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const HOLO = resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts');
const SCHEMA_PATH = resolve(REPO_ROOT, 'convex/schema.ts');
const CATALOG_PATH = defaultCatalogPath(REPO_ROOT);
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-CX-04');
const ARTIFACT_PATH = resolve(EVIDENCE_DIR, 'convex-referential-edges.json');
const DURABLE_ARTIFACT_PATH = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/convex-referential-edges.json'
);

const DATABASE_URL = resolveHolocronNonprodDatabaseUrl({
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod',
  context: 'sprint31-cx04-referential-edges test',
});

const HAND_MAINTAINED_LOAD_ORDER = [
  'conversations',
  'documents',
  'tasks',
  'researchSessions',
  'deepResearchSessions',
  'audioJobs',
  'improvementRequests',
  'voiceSessions',
  'toolCalls',
  'chatMessages',
  'agentPlans',
  'agentPlanSteps',
  'agentTelemetry',
  'imports',
  'citations',
  'researchIterations',
  'deepResearchIterations',
  'researchFindings',
  'audioSegments',
  'videoTranscripts',
  'audioTranscripts',
  'audioTranscriptJobs',
  'improvementImages',
  'voiceCommands',
  'revenueValidationSessions',
  'competitiveAnalysisSessions',
  'aiRoiSessions',
  'flightsSessions',
  'revenueValidationCompetitors',
  'competitiveAnalysisCompetitors',
  'competitiveAnalysisFeatures',
  'aiRoiOpportunities',
  'revenueValidationEvidence',
  'aiRoiEvidence',
  'flightsRoutes',
  'flightsPriceCalendar',
] as const;

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function runHolo(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bun', [HOLO, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL,
      PLATFORM_IT: '1',
    },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('S31-CX-04 referential edges from convex/schema.ts', () => {
  it('AC-1: extracts 80 edges from schema.ts with catalog-resolved targets', () => {
    expect(existsSync(SCHEMA_PATH), 'convex/schema.ts must exist for extraction').toBe(true);
    const schemaSource = readFileSync(SCHEMA_PATH, 'utf8');
    const vIdCount = [...schemaSource.matchAll(/v\.id\s*\(/g)].length;
    expect(vIdCount, 'schema must declare 80 v.id() relationships').toBe(80);

    const catalog = loadCatalog(CATALOG_PATH);
    const report = extractReferentialEdges({
      schemaPath: SCHEMA_PATH,
      catalogPath: CATALOG_PATH,
      catalog,
      repoRoot: REPO_ROOT,
    });

    expect(report.edgeCount).toBe(80);
    expect(report.edges).toHaveLength(80);

    for (const edge of report.edges) {
      expect(edge.sourceTable, 'sourceTable required').toBeTruthy();
      expect(edge.sourceField, 'sourceField required').toBeTruthy();
      expect(edge.referencedTable, 'referencedTable required').toBeTruthy();
      expect(edge.target, `${edge.sourceTable}.${edge.sourceField} target`).toMatch(
        /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/
      );
    }

    const emptyTargets = report.edges.filter((e) => !e.target);
    expect(emptyTargets, 'no empty targets').toEqual([]);

    const resolved = report.edges.filter(
      (e) => typeof e.target === 'string' && e.target.includes('.')
    );
    expect(resolved.length, 'edges resolving to a Postgres column').toBe(80);

    // Must be derived from schema text — not a hard-coded list.
    expect(report.source).toBe('convex/schema.ts');
    expect(report.derivedFromSchema).toBe(true);

    const artifactPath = writeReferentialEdgesArtifact(ARTIFACT_PATH, report);
    expect(existsSync(artifactPath)).toBe(true);
    const durablePath = writeReferentialEdgesArtifact(DURABLE_ARTIFACT_PATH, report);
    expect(existsSync(durablePath)).toBe(true);
    expect(DEFAULT_REFERENTIAL_EDGES_ARTIFACT).toContain('convex-referential-edges.json');

    const onDisk = JSON.parse(readFileSync(artifactPath, 'utf8')) as typeof report;
    expect(onDisk.edgeCount).toBe(80);
    expect(onDisk.edges).toHaveLength(80);

    writeEvidence('ac1-referential-edges.json', {
      edgeCount: onDisk.edgeCount,
      resolvedTargets: onDisk.edges.length,
      sample: onDisk.edges.slice(0, 5),
      artifactPath,
      durablePath,
    });
  });

  it('AC-2: etl:fk-audit fails closed when domain FK constraints are absent', () => {
    // Ensure artifact exists for the gate (re-extract if needed).
    const report = extractReferentialEdges({
      schemaPath: SCHEMA_PATH,
      catalogPath: CATALOG_PATH,
      repoRoot: REPO_ROOT,
    });
    writeReferentialEdgesArtifact(DURABLE_ARTIFACT_PATH, report);
    writeReferentialEdgesArtifact(ARTIFACT_PATH, report);

    const result = runHolo(['etl:fk-audit', '--json']);
    writeEvidence('ac2-fk-audit.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    expect(result.status, `exit must be non-zero:\n${result.stdout}\n${result.stderr}`).toBe(1);

    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      enforcedForeignKeys: number;
      unenforcedEdges: Array<{ target: string } | string>;
      edgeCount?: number;
    };

    expect(payload.ok, 'ok must be false when domain FKs are absent').toBe(false);
    expect(Array.isArray(payload.unenforcedEdges)).toBe(true);
    expect(payload.unenforcedEdges.length).toBeGreaterThanOrEqual(1);

    for (const entry of payload.unenforcedEdges) {
      const name = typeof entry === 'string' ? entry : entry.target;
      expect(name, 'unenforced edge must name table.column').toMatch(
        /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/
      );
    }

    // Decorative counter alone must not pass the gate.
    expect(payload.ok === true && payload.enforcedForeignKeys === 0).toBe(false);
  });

  it('NEG: empty/stub referential-edges artifact is rejected (fail-closed)', async () => {
    const emptyPath = resolve(EVIDENCE_DIR, 'empty-stub-edges.json');
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      emptyPath,
      `${JSON.stringify(
        {
          version: 1,
          source: 'convex/schema.ts',
          derivedFromSchema: true,
          edgeCount: 0,
          edges: [],
          generatedAt: new Date().toISOString(),
          schemaPath: SCHEMA_PATH,
          catalogPath: CATALOG_PATH,
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    // Direct loader must refuse empty / zero-count artifacts.
    expect(() => loadReferentialEdgesArtifact(emptyPath)).toThrow(
      /empty|zero|edgeCount|integrity/i
    );

    // Mismatched edgeCount vs edges[] must also refuse.
    const mismatchPath = resolve(EVIDENCE_DIR, 'mismatch-edges.json');
    writeFileSync(
      mismatchPath,
      `${JSON.stringify(
        {
          version: 1,
          source: 'convex/schema.ts',
          derivedFromSchema: true,
          edgeCount: 80,
          edges: [
            {
              sourceTable: 'chatMessages',
              sourceField: 'conversationId',
              referencedTable: 'conversations',
              optional: false,
              array: false,
              target: 'chat_messages.conversation_id',
            },
          ],
          generatedAt: new Date().toISOString(),
          schemaPath: SCHEMA_PATH,
          catalogPath: CATALOG_PATH,
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    expect(() => loadReferentialEdgesArtifact(mismatchPath)).toThrow(
      /edgeCount|mismatch|integrity|length/i
    );

    // fk-audit must not report ok:true when pointed at an empty stub artifact.
    // Prefer live schema extract when available; never trust empty edges.
    const audit = await runFkAudit({
      databaseUrl: DATABASE_URL,
      edgesArtifactPath: emptyPath,
      repoRoot: REPO_ROOT,
      catalogPath: CATALOG_PATH,
    });
    writeEvidence('neg-empty-artifact-fk-audit.json', audit);

    expect(audit.ok, 'empty artifact must not yield ok:true').toBe(false);
    expect(audit.edgeCount, 'edge set must not collapse to zero').toBeGreaterThan(0);
    expect(audit.unenforcedEdges.length).toBeGreaterThanOrEqual(1);

    // Nested JSONB / storage / array-id edges are classified, not silently counted
    // as ordinary unenforced FKs (keeps the gate honest without being impossible).
    expect(Array.isArray(audit.excludedFromEnforcement)).toBe(true);
    expect(audit.excludedFromEnforcement.length).toBeGreaterThanOrEqual(1);
    for (const entry of audit.excludedFromEnforcement) {
      expect(['storage_ref', 'nested_jsonb', 'array_ids']).toContain(entry.reason);
      expect(entry.target).toMatch(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/);
    }
  });

  it('AC-3: load order is topological over all 60 source tables with zero alphabetical fallback', () => {
    const report = extractReferentialEdges({
      schemaPath: SCHEMA_PATH,
      catalogPath: CATALOG_PATH,
      repoRoot: REPO_ROOT,
    });
    const catalog = loadCatalog(CATALOG_PATH);
    const sourceTables = Object.keys(catalog.tables).sort();
    expect(sourceTables).toHaveLength(60);

    const ordered = buildTopologicalLoadOrder({
      edges: report.edges,
      tables: sourceTables,
    });

    expect(ordered.order).toHaveLength(60);
    expect(new Set(ordered.order).size).toBe(60);
    expect(ordered.alphabeticalFallbackCount, 'no alphabetical remainder placement').toBe(0);
    expect(ordered.violations, 'referenced table must precede referrer').toBe(0);

    // Must not merely echo the hand-maintained 36-element LOAD_ORDER constant.
    const sameAsHandMaintained =
      ordered.order.length === HAND_MAINTAINED_LOAD_ORDER.length &&
      ordered.order.every((t, i) => t === HAND_MAINTAINED_LOAD_ORDER[i]);
    expect(sameAsHandMaintained).toBe(false);

    writeEvidence('ac3-load-order.json', {
      order: ordered.order,
      alphabeticalFallbackCount: ordered.alphabeticalFallbackCount,
      violations: ordered.violations,
      edgeCount: report.edgeCount,
      tableCount: ordered.order.length,
    });
  });
});
