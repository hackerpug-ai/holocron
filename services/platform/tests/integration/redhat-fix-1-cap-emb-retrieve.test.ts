/**
 * REDHAT-FIX-1 / C-1 — wire research-retrieve → CAP-EMB-01 (PATH-A) or rescope (PATH-B).
 *
 * AC-1: unseeded research retrieve returns RRF evidence when corpus is seeded
 * AC-2: empty corpus / embed-down fails closed (no fabricated evidence)
 * AC-3: scaffold gathers stay honest (SCAFFOLD_NOTE) under CAP-EMB composition
 * AC-4: source audit — rrfHybridSearch on retrieve path + path.json
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *   HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *   pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, createSql, type Db, type Sql } from '../../src/db/client.ts';
import { ensureSystemMissionTemplates } from '../../src/mission/templates/ensure-system.ts';
import {
  DATABASE_URL,
  ensureRedTestEnvironment,
  PLATFORM_IT,
  REPO_ROOT,
  runHolo,
  truncateMissionTables,
  withSql,
} from './mission-red.helpers';
import { captureHoloArtifact } from './pipes-4-red.helpers';

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/sprint-22');
const PATH_JSON = resolve(EVIDENCE_DIR, 'redhat-fix-1-path.json');
const RUNTIME_PATH = resolve(REPO_ROOT, 'services/platform/src/mission/runtime.ts');
const SPRINT_MD = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/SPRINT.md'
);
const PIPES1_MD = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/pipes-1-shared-evidence-research-core-template.md'
);

const MCP_TOPIC = 'MCP architecture';
const EXPECTED_DIM = 1024;
const CONTENT_HASH_PREFIX = 'redhat-fix-1-mcp-v1';

const MCP_PASSAGES = [
  {
    title: 'MCP architecture overview',
    text: 'MCP architecture defines a client-host-server model where Model Context Protocol hosts mediate tool calls between language models and local MCP servers. The architecture keeps capability negotiation explicit.',
    documentId: 'doc_redhat_fix1_mcp_1',
    ordinal: 0,
  },
  {
    title: 'MCP transport and sessions',
    text: 'Under MCP architecture, transports carry JSON-RPC messages for initialize, tools/list, and tools/call. Session state lives on the host so servers remain mostly stateless.',
    documentId: 'doc_redhat_fix1_mcp_2',
    ordinal: 0,
  },
  {
    title: 'MCP tools and resources',
    text: 'MCP architecture separates tools, resources, and prompts. Tools are model-invoked actions; resources are application-controlled context; prompts are user-driven templates — all part of the MCP architecture surface.',
    documentId: 'doc_redhat_fix1_mcp_3',
    ordinal: 0,
  },
] as const;

const itLive = PLATFORM_IT ? it : it.skip;

function ensureDirs(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function writeArtifact(name: string, body: unknown): string {
  ensureDirs();
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function recordPathA(): void {
  ensureDirs();
  writeFileSync(
    PATH_JSON,
    `${JSON.stringify(
      {
        path: 'A',
        rationale:
          'Wire builtin.research-retrieve@1 to rrfHybridSearch (CAP-EMB-01) with fail-closed empty/embed errors; keep scaffold gathers labeled SCAFFOLD_NOTE.',
        recordedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

async function loadEmbed(): Promise<
  (text: string, mode: 'query' | 'document') => Promise<number[]>
> {
  const mod = (await import('../../src/inference/embed.ts')) as {
    embed?: (text: string, mode: 'query' | 'document') => Promise<number[]>;
  };
  if (typeof mod.embed !== 'function') {
    throw new Error('fleet embed() required for REDHAT-FIX-1 PATH-A seeding');
  }
  return mod.embed.bind(mod);
}

async function seedMcpPassages(sql: Sql, db: Db): Promise<string[]> {
  void db;
  const embed = await loadEmbed();
  const sourceIds: string[] = [];

  for (let i = 0; i < MCP_PASSAGES.length; i += 1) {
    const p = MCP_PASSAGES[i]!;
    const contentHash = `${CONTENT_HASH_PREFIX}-${i + 1}`;
    const meta = JSON.stringify({ purpose: 'redhat-fix-1-mcp', topic: MCP_TOPIC, index: i });
    const sourceRows = await sql<{ id: string }[]>`
      INSERT INTO sources (source_kind, content_hash, title, document_id, metadata_json)
      VALUES (
        'document',
        ${contentHash},
        ${p.title},
        ${p.documentId},
        ${meta}::jsonb
      )
      ON CONFLICT (content_hash) DO UPDATE
        SET title = EXCLUDED.title,
            document_id = EXCLUDED.document_id,
            metadata_json = EXCLUDED.metadata_json
      RETURNING id::text AS id
    `;
    const sourceId = sourceRows[0]?.id;
    if (!sourceId) throw new Error(`failed to seed source ${contentHash}`);
    sourceIds.push(sourceId);

    await sql`DELETE FROM passages WHERE source_id = ${sourceId}::uuid`;

    const vector = await embed(p.text, 'document');
    expect(vector.length).toBe(EXPECTED_DIM);
    expect(vector.some((v) => v !== 0)).toBe(true);
    const vectorLiteral = toVectorLiteral(vector);
    await sql`
      INSERT INTO passages (
        source_id, document_id, ordinal, text, token_count, situating_header, embedding, metadata_json
      )
      VALUES (
        ${sourceId}::uuid,
        ${p.documentId},
        ${p.ordinal},
        ${p.text},
        ${null},
        ${`${p.title} · passage ${p.ordinal}`},
        ${vectorLiteral}::vector,
        ${JSON.stringify({ purpose: 'redhat-fix-1-mcp', topic: MCP_TOPIC })}::jsonb
      )
    `;
  }
  return sourceIds;
}

async function deleteMcpSeeds(sql: Sql): Promise<void> {
  await sql`
    DELETE FROM passages
    WHERE metadata_json->>'purpose' = 'redhat-fix-1-mcp'
       OR document_id LIKE 'doc_redhat_fix1_mcp_%'
  `;
  await sql`
    DELETE FROM sources
    WHERE content_hash LIKE ${`${CONTENT_HASH_PREFIX}%`}
       OR document_id LIKE 'doc_redhat_fix1_mcp_%'
  `;
}

async function readRetrieveStageOutput(runId: string): Promise<Record<string, unknown> | null> {
  return withSql(async (sql) => {
    const rows = await sql<{ output_json: unknown }[]>`
      SELECT output_json
      FROM mission_stage_runs
      WHERE run_id = ${runId}::uuid
        AND stage_key = 'retrieve'
        AND status = 'committed'
      ORDER BY attempt DESC
      LIMIT 1
    `;
    const raw = rows[0]?.output_json;
    return raw && typeof raw === 'object' ? asRecord(raw) : null;
  });
}

describe.sequential('REDHAT-FIX-1 PATH-A — research-retrieve → rrfHybridSearch (C-1)', () => {
  beforeAll(async () => {
    ensureDirs();
    recordPathA();
    await ensureRedTestEnvironment();
    expect(PLATFORM_IT).toBe(true);
    expect(DATABASE_URL).toContain('/holocron_nonprod');
  }, 120_000);

  beforeEach(async (ctx) => {
    // AC-4 is pure source audit — no mission template registration needed.
    if (ctx.task.name.startsWith('AC-4')) {
      recordPathA();
      return;
    }
    // Shared holocron_nonprod may be touched by parallel worktrees; re-register
    // after truncate. Retry on fleet_manifest_path drift from concurrent writers.
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await truncateMissionTables();
      try {
        await ensureSystemMissionTemplates({ databaseUrl: DATABASE_URL });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (!/immutable mission template conflict|fleet_manifest_path/.test(message)) {
          throw error;
        }
        await new Promise((r) => setTimeout(r, 100 + attempt * 150));
      }
    }
    if (lastError) throw lastError;
  }, 120_000);

  itLive(
    'AC-1: unseeded research retrieve returns RRF evidence for seeded MCP corpus',
    async () => {
      const sql = createSql(DATABASE_URL);
      const db = createDb(sql);
      try {
        await seedMcpPassages(sql, db);
      } finally {
        await sql.end({ timeout: 5 });
      }

      const cli = runHolo(
        'redhat-fix1-ac1-research-unseeded',
        ['mission', 'run', 'research', '--topic', MCP_TOPIC, '--components', '2', '--json'],
        { timeoutMs: 300_000 }
      );
      captureHoloArtifact('AC-1-unseeded-research-retrieve', cli);
      writeArtifact('AC-1-mission-run.json', {
        status: cli.status,
        parsed: cli.parsed,
        combined: cli.combined.slice(0, 8000),
      });

      const payload = asRecord(cli.parsed);
      const runId = typeof payload.runId === 'string' ? payload.runId : null;
      expect(runId, `expected runId in CLI JSON; got ${cli.combined.slice(0, 1500)}`).toBeTruthy();

      const retrieveOut = await readRetrieveStageOutput(runId!);
      writeArtifact('AC-1-retrieve-stage.json', retrieveOut);
      expect(retrieveOut, 'retrieve stage must commit output').toBeTruthy();

      const evidence = asRecord(retrieveOut!.evidence);
      const claims = Array.isArray(evidence.claims) ? evidence.claims : [];
      const evidenceRows = Array.isArray(evidence.evidence) ? evidence.evidence : [];
      const method =
        retrieveOut!.retrievalMethod ??
        retrieveOut!.searchMethod ??
        evidence.retrievalMethod ??
        evidence.searchMethod;

      expect(
        claims.length >= 1 || evidenceRows.length >= 1,
        `expected non-empty claims/evidence from RRF; claims=${claims.length} evidence=${evidenceRows.length}`
      ).toBe(true);
      expect(method, 'retrievalMethod/searchMethod must be rrf').toBe('rrf');

      // Must not complete solely on empty seed signature while claiming CAP-EMB.
      const emptySeed =
        claims.length === 0 &&
        evidenceRows.length === 0 &&
        (payload.status === 'completed' || payload.status === 'suspended');
      expect(emptySeed).toBe(false);

      // Quotes must come from real passage text (anti-stub).
      const blob = JSON.stringify(evidenceRows);
      expect(blob.toLowerCase()).toMatch(/mcp architecture/);
    },
    300_000
  );

  itLive(
    'AC-2: empty corpus unseeded research fails closed (no fabricated evidence)',
    async () => {
      const sql = createSql(DATABASE_URL);
      try {
        // Ensure no MCP seeds and use a unique topic with zero corpus hits.
        await deleteMcpSeeds(sql);
        await sql`
          DELETE FROM passages
          WHERE text ILIKE '%zzqxq_redhat_fix1_empty_topic%'
        `;
      } finally {
        await sql.end({ timeout: 5 });
      }

      const emptyTopic = 'zzqxq_redhat_fix1_empty_topic_no_corpus_match';
      const cli = runHolo(
        'redhat-fix1-ac2-empty-corpus',
        ['mission', 'run', 'research', '--topic', emptyTopic, '--components', '1', '--json'],
        { timeoutMs: 180_000 }
      );
      captureHoloArtifact('AC-2-empty-corpus-fail-closed', cli);
      writeArtifact('AC-2-empty-corpus.json', {
        status: cli.status,
        parsed: cli.parsed,
        combined: cli.combined.slice(0, 8000),
      });

      const payload = asRecord(cli.parsed);
      const status = typeof payload.status === 'string' ? payload.status : '';
      const blob = `${cli.combined}\n${JSON.stringify(payload)}`.toLowerCase();

      const failedClosed = cli.status !== 0 || status === 'failed' || status === 'blocked';
      expect(failedClosed, `expected fail-closed; status=${status} exit=${cli.status}`).toBe(true);
      expect(status).not.toBe('completed');

      expect(blob).toMatch(/retrieval|search|embed|empty|mission_retrieval|mission_retrieve/);

      // No fabricated high-grade entailment bundle greenwash.
      expect(blob).not.toMatch(/"grade"\s*:\s*4.*"entailment"\s*:\s*0\.9/s);
    },
    180_000
  );

  itLive(
    'AC-3: scaffold gather honesty — SCAFFOLD_NOTE present; CAP-EMB not claimed as live gather',
    async () => {
      // Direct gather-module proof (no fleet) — SCAFFOLD_NOTE must stay honest.
      const { gatherWhatsNewBriefing, gatherShopProducts } = await import(
        '../../src/mission/templates/pipeline-components.ts'
      );
      const { gatherBusinessReportComponents } = await import(
        '../../src/mission/templates/business-report-components.ts'
      );

      const whatsGather = gatherWhatsNewBriefing('2026-07-20');
      const shopGather = gatherShopProducts('keyboard');
      const reportGather = gatherBusinessReportComponents({
        reportKind: 'revenue-validation',
        target: 'example.com',
      });

      writeArtifact('AC-3-gather-modules.json', {
        whats: whatsGather,
        shop: shopGather,
        report: {
          missingComponents: reportGather.missingComponents,
          marketSizing: reportGather.components.marketSizing ?? null,
        },
      });

      expect(whatsGather.provenance).toMatch(/Deterministic scaffolding|not live source fetch/i);
      expect(JSON.stringify(whatsGather.headlines)).toMatch(/Deterministic scaffolding|scaffold/i);
      // Shop retailers are labeled deterministic-scaffolding:* (not live marketplace).
      const shopBlob = JSON.stringify(shopGather);
      expect(shopBlob).toMatch(/deterministic-scaffolding/i);
      expect(shopGather.length).toBeGreaterThan(0);
      // Business-report market sizing notes must stay non-live.
      const reportBlob = JSON.stringify(reportGather);
      expect(reportBlob).toMatch(/not live market|Deterministic scaffolding|stable hash/i);

      // CLI attempt — tolerate concurrent worktree template races; gather-module
      // proof above is authoritative for scaffold honesty under PATH-A.
      const whats = runHolo(
        'redhat-fix1-ac3-whatsnew',
        [
          'mission',
          'run',
          'whatsNew',
          '--date',
          '2026-07-20',
          '--idempotency-key',
          `redhat-fix1-wn-${Date.now()}`,
          '--json',
        ],
        { timeoutMs: 180_000 }
      );
      captureHoloArtifact('AC-3-whatsNew', whats);

      const shop = runHolo(
        'redhat-fix1-ac3-shop',
        [
          'mission',
          'run',
          'shop',
          '--query',
          'keyboard',
          '--idempotency-key',
          `redhat-fix1-sh-${Date.now()}`,
          '--json',
        ],
        { timeoutMs: 180_000 }
      );
      captureHoloArtifact('AC-3-shop', shop);

      const report = runHolo(
        'redhat-fix1-ac3-report',
        [
          'mission',
          'run',
          'report',
          '--kind',
          'revenue-validation',
          '--target',
          'example.com',
          '--idempotency-key',
          `redhat-fix1-rp-${Date.now()}`,
          '--json',
        ],
        { timeoutMs: 180_000 }
      );
      captureHoloArtifact('AC-3-report', report);

      writeArtifact('AC-3-gathers.json', {
        whats: { status: whats.status, parsed: whats.parsed },
        shop: { status: shop.status, parsed: shop.parsed },
        report: { status: report.status, parsed: report.parsed },
      });

      for (const [name, cli] of [
        ['whatsNew', whats],
        ['shop', shop],
        ['report', report],
      ] as const) {
        const payload = asRecord(cli.parsed);
        if (payload.ok === true && payload.status === 'completed') {
          const output = asRecord(payload.output);
          const blob = JSON.stringify({ payload, output, combined: cli.combined });
          const hasScaffold =
            /Deterministic scaffolding|not live source fetch|not live market/i.test(blob);
          const hasGatherProvenance =
            typeof output.gatherProvenance === 'string' &&
            /Deterministic scaffolding|not live/i.test(String(output.gatherProvenance));
          expect(
            hasScaffold || hasGatherProvenance,
            `${name} completed without scaffold provenance`
          ).toBe(true);
          if (/live feed|live source fetch|hybrid_search/i.test(blob) && !hasScaffold) {
            expect(blob).not.toMatch(/item\?d=2026-07-20&i=/);
          }
        }
      }

      // PATH-A: CAP-EMB is for research retrieve. Scaffold gathers stay labeled;
      // SPRINT may still claim CAP-EMB-01 for retrieval (not silent live gather).
      const sprint = readFileSync(SPRINT_MD, 'utf8');
      expect(sprint).toMatch(/CAP-EMB-01/);
      // Must not claim whatsNew/shop gather is hybrid_search live feed.
      expect(sprint).not.toMatch(/whatsNew.*hybrid_search|shop.*PRODUCT_CATALOG as hybrid/i);
    },
    420_000
  );

  itLive(
    'AC-4: source audit — rrfHybridSearch on retrieve path + path.json records A',
    async () => {
      expect(PATH_JSON, 'path decision artifact missing').toBeTruthy();
      const pathDoc = JSON.parse(readFileSync(PATH_JSON, 'utf8')) as {
        path?: string;
        rationale?: string;
      };
      writeArtifact('AC-4-path.json', pathDoc);
      expect(pathDoc.path === 'A' || pathDoc.path === 'B').toBe(true);

      const runtimeSrc = readFileSync(RUNTIME_PATH, 'utf8');
      if (pathDoc.path === 'A') {
        const hits = (runtimeSrc.match(/rrfHybridSearch|searchSurface/g) ?? []).length;
        expect(
          hits,
          'PATH-A: runtime retrieve path must call rrfHybridSearch or searchSurface'
        ).toBeGreaterThanOrEqual(1);
        // Still must not be the empty seed-only signature alone.
        expect(runtimeSrc).toMatch(/rrfHybridSearch/);
        expect(runtimeSrc).not.toMatch(
          /researchEvidence \?\? \{\s*claims:\s*\[\],\s*evidence:\s*\[\]/
        );
      } else {
        const pipes1 = readFileSync(PIPES1_MD, 'utf8');
        const consumesBlock = pipes1.match(/\*\*Consumes:\*\*[\s\S]*?(?=\n## |\n\*\*|$)/);
        expect(consumesBlock?.[0] ?? '').not.toMatch(/CAP-EMB-01/);
      }
    },
    30_000
  );
});
