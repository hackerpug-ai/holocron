/**
 * pipes-3 GREEN — whatsNew / assimilate / shop / subscriptions templates
 * + sub-workflow publish + no-shells.
 *
 * Real Postgres + fleet. No mocks of @mastra/* or model providers.
 * Evidence under .tmp/pipes-3/.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { publishDocumentForRun } from '../../src/mission/document-publish.ts';
import { ensureSystemMissionTemplates } from '../../src/mission/templates/ensure-system.ts';
import { SUBWORKFLOW_EVIDENCE_RESEARCH_REF } from '../../src/mission/templates/subscriptions.ts';
import { scanPerDomainShells } from '../../src/mission/verify-no-shells.ts';
import {
  DATABASE_URL,
  ensureRedTestEnvironment,
  PLATFORM_IT,
  REPO_ROOT,
  runHolo,
  truncateMissionTables,
  withSql,
} from './mission-red.helpers';
import {
  asRecord,
  captureHoloArtifact,
  countTemplatesByKeys,
  outputDocumentType,
  outputHeadlines,
  runPsql,
} from './pipes-4-red.helpers';

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/pipes-3');
const RAW_DIR = resolve(EVIDENCE_DIR, 'raw');
const itLive = PLATFORM_IT ? it : it.skip;

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  mkdirSync(RAW_DIR, { recursive: true });
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(resolve(EVIDENCE_DIR, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

async function resetPipelineRuns(): Promise<void> {
  await withSql(async (sql) => {
    const keys = ['whatsnew', 'assimilate', 'shop', 'subscriptions', 'evidence-research'];
    await sql`
      DELETE FROM mission_stage_runs
      WHERE run_id IN (SELECT id FROM mission_runs WHERE template_key = ANY(${keys}))
    `;
    await sql`
      DELETE FROM mission_events
      WHERE run_id IN (SELECT id FROM mission_runs WHERE template_key = ANY(${keys}))
    `;
    await sql`
      DELETE FROM mission_checkpoints
      WHERE run_id IN (SELECT id FROM mission_runs WHERE template_key = ANY(${keys}))
    `;
    await sql`
      DELETE FROM mission_commits
      WHERE run_id IN (SELECT id FROM mission_runs WHERE template_key = ANY(${keys}))
    `;
    await sql`DELETE FROM mission_run_tags
      WHERE run_id IN (SELECT id FROM mission_runs WHERE template_key = ANY(${keys}))`;
    await sql`DELETE FROM mission_runs WHERE template_key = ANY(${keys})`;
  });
}

describe.sequential('pipes-3 GREEN — pipeline templates + sub-workflow publish', () => {
  beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    mkdirSync(RAW_DIR, { recursive: true });
    await ensureRedTestEnvironment();
    expect(PLATFORM_IT).toBe(true);
    expect(DATABASE_URL).toContain('/holocron_nonprod');
    await truncateMissionTables();
    await ensureSystemMissionTemplates({ databaseUrl: DATABASE_URL });
  }, 180_000);

  beforeEach(async () => {
    await resetPipelineRuns();
    await ensureSystemMissionTemplates({ databaseUrl: DATABASE_URL });
  }, 60_000);

  afterAll(() => {
    // evidence retained under .tmp/pipes-3
  });

  itLive(
    'TC-1: whatsnew, assimilate, shop, subscriptions templates exist in registry',
    async () => {
      const keys = ['whatsnew', 'assimilate', 'shop', 'subscriptions'] as const;
      const count = await countTemplatesByKeys([...keys]);
      writeEvidence('TC-1-template-count.json', { count, keys });
      expect(count).toBe(4);

      const psql = runPsql(
        `SELECT template_key FROM mission_templates WHERE template_key IN ('whatsnew', 'assimilate', 'shop', 'subscriptions') ORDER BY template_key`
      );
      writeEvidence('TC-1-psql.txt', {
        status: psql.status,
        stdout: psql.stdout,
        stderr: psql.stderr,
      });
      expect(psql.status).toBe(0);
      expect(psql.stdout).toMatch(/whatsnew/);
      expect(psql.stdout).toMatch(/assimilate/);
      expect(psql.stdout).toMatch(/shop/);
      expect(psql.stdout).toMatch(/subscriptions/);
    },
    60_000
  );

  itLive(
    'AC-1: whatsNew --date produces daily-briefing with headlines',
    async () => {
      const cli = runHolo(
        'pipes3-ac1-whatsnew',
        [
          'mission',
          'run',
          'whatsNew',
          '--date',
          '2026-07-20',
          '--goal',
          'daily briefing for 2026-07-20',
          '--idempotency-key',
          `pipes3-ac1-${Date.now()}`,
          '--json',
        ],
        { timeoutMs: 300_000 }
      );
      captureHoloArtifact('AC-1-mission-run-whatsnew', cli);
      writeEvidence('AC-1-run.json', cli.parsed ?? { status: cli.status, combined: cli.combined });

      expect(cli.status, cli.combined).toBe(0);
      const documentType = outputDocumentType(cli.parsed);
      const headlines = outputHeadlines(cli.parsed);
      expect(documentType).toBe('daily-briefing');
      expect(headlines.length).toBeGreaterThanOrEqual(3);

      const psql = runPsql(
        `SELECT output->>'documentType' as type, jsonb_array_length(output->'headlines') as count
         FROM mission_runs WHERE template_key='whatsnew' ORDER BY created_at DESC LIMIT 1`
      );
      writeEvidence('AC-1-psql.txt', {
        status: psql.status,
        stdout: psql.stdout,
        stderr: psql.stderr,
      });
      expect(psql.status).toBe(0);
      expect(psql.stdout).toMatch(/daily-briefing/);
      expect(psql.stdout).toMatch(/[1-9]/);
    },
    300_000
  );

  itLive(
    'AC-2: assimilate --target produces architecture + patterns',
    async () => {
      const cli = runHolo(
        'pipes3-ac2-assimilate',
        [
          'mission',
          'run',
          'assimilate',
          '--target',
          'facebook/react',
          '--idempotency-key',
          `pipes3-ac2-${Date.now()}`,
          '--json',
        ],
        { timeoutMs: 300_000 }
      );
      captureHoloArtifact('AC-2-mission-run-assimilate', cli);
      writeEvidence('AC-2-run.json', cli.parsed ?? { status: cli.status, combined: cli.combined });

      expect(cli.status, cli.combined).toBe(0);
      const output = asRecord(asRecord(cli.parsed).output);
      expect(output.repoUrl).toBe('facebook/react');
      expect(asRecord(output.architecture).components).toBeTruthy();
      expect(Array.isArray(output.patterns) && output.patterns.length > 0).toBe(true);

      const psql = runPsql(
        `SELECT output->>'repoUrl' as repo, output->'architecture'->'components' as components
         FROM mission_runs WHERE template_key='assimilate' ORDER BY created_at DESC LIMIT 1`
      );
      writeEvidence('AC-2-psql.txt', {
        status: psql.status,
        stdout: psql.stdout,
        stderr: psql.stderr,
      });
      expect(psql.status).toBe(0);
      expect(psql.stdout).toMatch(/facebook\/react/);
    },
    300_000
  );

  itLive(
    'AC-3: shop --query produces products with price + rating',
    async () => {
      const cli = runHolo(
        'pipes3-ac3-shop',
        [
          'mission',
          'run',
          'shop',
          '--query',
          'ergonomic keyboard',
          '--idempotency-key',
          `pipes3-ac3-${Date.now()}`,
          '--json',
        ],
        { timeoutMs: 300_000 }
      );
      captureHoloArtifact('AC-3-mission-run-shop', cli);
      writeEvidence('AC-3-run.json', cli.parsed ?? { status: cli.status, combined: cli.combined });

      expect(cli.status, cli.combined).toBe(0);
      const output = asRecord(asRecord(cli.parsed).output);
      const products = Array.isArray(output.products) ? output.products : [];
      expect(products.length).toBeGreaterThanOrEqual(1);
      const first = asRecord(products[0]);
      expect(first.price).not.toBeNull();
      expect(first.rating).not.toBeNull();
      expect(first.url).toBeTruthy();

      const psql = runPsql(
        `SELECT jsonb_array_length(output->'products') as count
         FROM mission_runs WHERE template_key='shop' ORDER BY created_at DESC LIMIT 1`
      );
      writeEvidence('AC-3-psql.txt', {
        status: psql.status,
        stdout: psql.stdout,
        stderr: psql.stderr,
      });
      expect(psql.status).toBe(0);
      expect(psql.stdout).toMatch(/[1-9]/);
    },
    300_000
  );

  itLive(
    'AC-4 / TC-3: subscriptions invokes evidence-research sub-workflow and publishes document',
    async () => {
      // TC-3: stage graph contains subworkflow:evidence-research
      const stageProbe = runPsql(
        `SELECT definition_json->'stageGraph' AS stage_graph
         FROM mission_template_versions
         WHERE template_key='subscriptions'
         ORDER BY created_at DESC LIMIT 1`
      );
      writeEvidence('TC-3-stage-graph.txt', {
        status: stageProbe.status,
        stdout: stageProbe.stdout,
        stderr: stageProbe.stderr,
        expectedRef: SUBWORKFLOW_EVIDENCE_RESEARCH_REF,
      });
      expect(stageProbe.status).toBe(0);
      expect(stageProbe.stdout).toContain('subworkflow:evidence-research');

      const claimsPath = resolve(
        REPO_ROOT,
        'services/platform/tests/fixtures/research/claims.json'
      );
      const cli = runHolo(
        'pipes3-ac4-subscriptions',
        [
          'mission',
          'run',
          'subscriptions',
          '--goal',
          'standing subscriptions publish check',
          '--topic',
          'weekly subscription digest',
          '--claims',
          claimsPath,
          '--idempotency-key',
          `pipes3-ac4-${Date.now()}`,
          '--json',
        ],
        { timeoutMs: 420_000 }
      );
      captureHoloArtifact('AC-4-mission-run-subscriptions', cli);
      writeEvidence('AC-4-run.json', cli.parsed ?? { status: cli.status, combined: cli.combined });

      expect(cli.status, cli.combined).toBe(0);
      const payload = asRecord(cli.parsed);
      const output = asRecord(payload.output);
      expect(String(output.documentId ?? '')).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      const calls = output.subworkflowCalls;
      expect(
        Array.isArray(calls) && calls.some((c) => String(c).includes('evidence-research'))
      ).toBe(true);

      const runId = typeof payload.runId === 'string' ? payload.runId : null;
      expect(runId).toBeTruthy();

      const psqlRun = runPsql(
        `SELECT subworkflow_calls::text, document_id
         FROM mission_runs WHERE template_key='subscriptions' ORDER BY created_at DESC LIMIT 1`
      );
      writeEvidence('AC-4-psql-run.txt', {
        status: psqlRun.status,
        stdout: psqlRun.stdout,
        stderr: psqlRun.stderr,
      });
      expect(psqlRun.status).toBe(0);
      expect(psqlRun.stdout).toMatch(/evidence-research/);
      expect(psqlRun.stdout).toMatch(/[a-z0-9-]{36}/i);

      const psqlDocs = runPsql(
        `SELECT COUNT(*)::text AS count FROM documents
         WHERE source_run_id IN (SELECT id FROM mission_runs WHERE template_key='subscriptions')`
      );
      writeEvidence('AC-4-psql-docs.txt', {
        status: psqlDocs.status,
        stdout: psqlDocs.stdout,
        stderr: psqlDocs.stderr,
      });
      expect(psqlDocs.status).toBe(0);
      expect(psqlDocs.stdout).toMatch(/[1-9]/);
    },
    420_000
  );

  itLive(
    'TC-4: document publish is idempotent on retries',
    async () => {
      const sourceRunId = randomUUID();
      const r1 = await withSql(async (sql) =>
        publishDocumentForRun(sql, {
          sourceRunId,
          title: 'idempotent-test',
          content: 'body-1',
          idempotencyKey: `mission-run:${sourceRunId}`,
        })
      );
      const r2 = await withSql(async (sql) =>
        publishDocumentForRun(sql, {
          sourceRunId,
          title: 'idempotent-test-retry',
          content: 'body-2',
          idempotencyKey: `mission-run:${sourceRunId}`,
        })
      );
      writeEvidence('TC-4-idempotent-publish.json', { r1, r2 });
      expect(r1.documentId).toBe(r2.documentId);
      expect(r1.created).toBe(true);
      expect(r2.created).toBe(false);
      const count = await withSql(async (sql) => {
        const rows = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM documents WHERE source_run_id = ${sourceRunId}::uuid
        `;
        return Number(rows[0]?.count ?? 0);
      });
      expect(count).toBe(1);
    },
    60_000
  );

  itLive(
    'AC-5: holo verify:no-shells reports 0 per-domain modules',
    async () => {
      const scan = scanPerDomainShells(REPO_ROOT);
      writeEvidence('AC-5-scan.json', scan);
      expect(scan.n).toBe(0);
      expect(scan.platformShells ?? []).toEqual([]);
      expect(scan.convexResidual ?? []).toEqual([]);
      expect(scan.message).toContain('0 per-domain modules found');

      const verify = runHolo('pipes3-ac5-verify-no-shells', ['verify:no-shells']);
      captureHoloArtifact('AC-5-verify-no-shells', verify);
      writeEvidence('AC-5-verify-no-shells.txt', verify.combined);
      expect(verify.status, verify.combined).toBe(0);
      expect(verify.combined).toMatch(/0 per-domain modules found/);
    },
    60_000
  );

  itLive(
    'negative control: bare standing subscriptions must not greenwash always-admissible grades',
    async () => {
      // REDHAT-FIX-4 / H-2 supersedes the old CLAIMS_REQUIRED fail-closed contract for
      // bare standing. Fail-closed now targets canned always-admissible greenwash:
      // bare run may succeed + publish, but researchAdmitted must not be true from
      // invented grade≥3/entailment≥0.8 without operator --claims / real admission.
      const cli = runHolo(
        'pipes3-neg-subscriptions-no-greenwash',
        [
          'mission',
          'run',
          'subscriptions',
          '--goal',
          'bare subscriptions standing path',
          '--topic',
          'should-not-greenwash-empty-corpus',
          '--idempotency-key',
          `pipes3-neg-sub-${Date.now()}`,
          '--json',
        ],
        { timeoutMs: 420_000 }
      );
      captureHoloArtifact('NEG-subscriptions-no-greenwash', cli);
      writeEvidence('NEG-subscriptions-no-greenwash.json', {
        status: cli.status,
        parsed: cli.parsed,
        combined: cli.combined,
      });
      const payload = asRecord(cli.parsed);
      const output = asRecord(payload.output);
      const blob = `${cli.combined}\n${JSON.stringify(payload)}`;
      // Bare standing is allowed to succeed (H-2). When it does, research must not
      // claim admission from canned high-grade entailment greenwash.
      if (cli.status === 0 && payload.ok === true) {
        expect(output.researchAdmitted === true).not.toBe(true);
        expect(blob).not.toMatch(/"grade"\s*:\s*4[\s\S]*"entailment"\s*:\s*0\.9/);
      } else {
        // If the run fails, it must not be the superseded CLAIMS_REQUIRED default.
        expect(blob).not.toMatch(/MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED/);
      }
    },
    420_000
  );

  itLive(
    'TC-2: output shape matches former (documentType / products / architecture)',
    async () => {
      // Re-run each template once (beforeEach wiped prior runs) and assert shapes.
      const { runMissionTemplate } = await import('../../src/mission/runtime.ts');
      const stamp = Date.now();
      const whats = await runMissionTemplate({
        templateKey: 'whatsnew',
        goal: `daily briefing for 2026-07-20`,
        date: '2026-07-20',
        idempotencyKey: `pipes3-tc2-wn-${stamp}`,
      });
      const assim = await runMissionTemplate({
        templateKey: 'assimilate',
        goal: 'assimilate facebook/react',
        target: 'facebook/react',
        idempotencyKey: `pipes3-tc2-as-${stamp}`,
      });
      const shop = await runMissionTemplate({
        templateKey: 'shop',
        goal: 'shop ergonomic keyboard',
        query: 'ergonomic keyboard',
        idempotencyKey: `pipes3-tc2-sh-${stamp}`,
      });
      writeEvidence('TC-2-shapes.json', {
        whats: whats.output,
        assim: assim.output,
        shop: shop.output,
      });
      expect(whats.ok && whats.status === 'completed').toBe(true);
      expect(assim.ok && assim.status === 'completed').toBe(true);
      expect(shop.ok && shop.status === 'completed').toBe(true);

      const w = asRecord(whats.output);
      const a = asRecord(assim.output);
      const s = asRecord(shop.output);
      expect(w.documentType).toBe('daily-briefing');
      expect(Array.isArray(w.headlines) && w.headlines.length > 0).toBe(true);
      expect(Array.isArray(w.summaries) && w.summaries.length > 0).toBe(true);
      expect(String(w.assayText ?? '').trim().length).toBeGreaterThan(0);
      expect(a.repoUrl).toBe('facebook/react');
      expect(asRecord(a.architecture).components).toBeTruthy();
      expect(Array.isArray(a.patterns) && a.patterns.length > 0).toBe(true);
      expect(String(a.assayText ?? '').trim().length).toBeGreaterThan(0);
      const products = s.products;
      expect(Array.isArray(products) && products.length > 0).toBe(true);
      if (!Array.isArray(products) || products.length === 0) {
        throw new Error('shop pipeline returned no products');
      }
      expect(asRecord(products[0]).price).not.toBeNull();
      expect(asRecord(products[0]).rating).not.toBeNull();
      expect(String(s.assayText ?? '').trim().length).toBeGreaterThan(0);
    },
    420_000
  );
});
