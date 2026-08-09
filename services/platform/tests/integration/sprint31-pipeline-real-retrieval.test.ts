/**
 * S31-10 — Replace fabricated pipeline inputs with real retrieval
 * for whatsNew / assimilate / shop.
 *
 * AC-1: whatsNew uses real subscription/source retrieval (PRIMARY)
 * AC-2: assimilate retrieves repository content
 * AC-3: shop returns non-scaffold products for known queries
 * AC-4: scaffold-only commit fails closed for all three templates
 * AC-5: scaffold helpers remain explicitly labeled
 *
 * Real Postgres + mission CLI + fleet. No mocks of @mastra/* or mission runtime.
 *
 *   PLATFORM_IT=1 pnpm test:integration -- services/platform/tests/integration/sprint31-pipeline-real-retrieval.test.ts
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSystemMissionTemplates } from '../../src/mission/templates/ensure-system.ts';
import {
  gatherAssimilateReport,
  gatherShopProducts,
  gatherWhatsNewBriefing,
  SCAFFOLD_NOTE,
  SCAFFOLD_RETAILER_PREFIX,
} from '../../src/mission/templates/pipeline-components.ts';
import {
  DATABASE_URL,
  ensureRedTestEnvironment,
  type HoloResult,
  PLATFORM_IT,
  REPO_ROOT,
  runHolo,
  startHoloProcess,
  truncateMissionTables,
  withSql,
} from './mission-red.helpers';
import { asRecord, captureHoloArtifact } from './pipes-4-red.helpers';

/** Async holo CLI so in-process fixture HTTP servers can answer (spawnSync blocks the loop). */
async function runHoloAsync(
  artifactBase: string,
  args: string[],
  options?: {
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
  }
): Promise<HoloResult> {
  const runner = startHoloProcess(artifactBase, args, { env: options?.env });
  const timeoutMs = options?.timeoutMs ?? 90_000;
  const timed = await Promise.race([
    runner.result,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  if (!timed) {
    runner.kill('SIGTERM');
    const snap = runner.snapshot();
    return {
      status: 1,
      stdout: snap.stdout,
      stderr: `${snap.stderr}\n[timeout after ${timeoutMs}ms]`,
      combined: `${snap.combined}\n[timeout after ${timeoutMs}ms]`,
      parsed: null,
      command: runner.command,
      artifactBase,
    };
  }
  return {
    status: timed.status,
    stdout: timed.stdout,
    stderr: timed.stderr,
    combined: timed.combined,
    parsed: timed.parsed,
    command: timed.command,
    artifactBase: timed.artifactBase,
  };
}

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/sprint-31/S31-10');
const itLive = PLATFORM_IT ? it : it.skip;

const RUN_SUFFIX = `s31-10-${Date.now().toString(36)}`;
const SEED_SOURCE_ID = randomUUID();
const SEED_CONTENT_ID = randomUUID();
const SEED_TITLE = `S31-10 real retrieval seed ${RUN_SUFFIX}`;
const SEED_URL = `https://example.com/s31-10/${RUN_SUFFIX}`;

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

/**
 * Other worktrees may re-register system templates with a different absolute
 * fleet_manifest_path — wipe template rows + re-seed on immutable drift.
 */
async function ensureTemplatesWithRetry(): Promise<void> {
  try {
    await ensureSystemMissionTemplates({ databaseUrl: DATABASE_URL });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('immutable mission template conflict')) throw error;
  }
  await truncateMissionTables();
  await ensureSystemMissionTemplates({ databaseUrl: DATABASE_URL });
}

async function seedSubscriptionCorpus(): Promise<void> {
  await withSql(async (sql) => {
    await sql`
      INSERT INTO subscription_sources (
        id, source_type, identifier, name, url, feed_url, config_json,
        auto_research, created_at, updated_at
      ) VALUES (
        ${SEED_SOURCE_ID}::uuid, 'newsletter', ${`s31-10-${RUN_SUFFIX}`},
        ${`S31-10 Source ${RUN_SUFFIX}`}, ${SEED_URL}, ${SEED_URL},
        ${sql.json({ platform: 'website' })}::jsonb, false, now(), now()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        url = EXCLUDED.url,
        updated_at = now()
    `;
    await sql`
      INSERT INTO subscription_content (
        id, source_id, content_id, title, url, metadata_json, passed_filter,
        research_status, discovered_at, researched_at, in_feed, content_category,
        ai_relevance_score, created_at
      ) VALUES (
        ${SEED_CONTENT_ID}::uuid, ${SEED_SOURCE_ID}::uuid, ${SEED_CONTENT_ID}::text,
        ${SEED_TITLE}, ${SEED_URL},
        ${sql.json({ description: `S31-10 seeded body for ${RUN_SUFFIX}` })}::jsonb,
        true, 'researched', now(), now(), false, 'article', 0.95, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        url = EXCLUDED.url,
        source_id = EXCLUDED.source_id,
        research_status = EXCLUDED.research_status
    `;
  });
}

async function seedShopListingsForQuery(query: string): Promise<void> {
  const sessionId = randomUUID();
  const listingId = randomUUID();
  await withSql(async (sql) => {
    await sql`
      INSERT INTO shop_sessions (
        id, query, condition, retailers, verified_only, status, total_listings, created_at, updated_at, completed_at
      ) VALUES (
        ${sessionId}::uuid, ${query}, 'any', ${sql.json(['newegg', 'bestbuy'])}::jsonb,
        false, 'completed', 1, now(), now(), now()
      )
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO shop_listings (
        id, session_id, title, price, currency, condition, retailer, url,
        product_hash, deal_score, trust_tier, seller_trust_score, is_verified_seller, is_duplicate
      ) VALUES (
        ${listingId}::uuid, ${sessionId}::uuid,
        ${`${query} — S31-10 real listing ${RUN_SUFFIX}`},
        99.5, 'USD', 'new', 'newegg',
        ${`https://www.newegg.com/p/${RUN_SUFFIX}`},
        ${`s31-10-${RUN_SUFFIX}`}, 0.8, '1', 90, true, false
      )
      ON CONFLICT (id) DO NOTHING
    `;
  });
}

async function cleanupSeed(): Promise<void> {
  await withSql(async (sql) => {
    await sql`DELETE FROM subscription_content WHERE id = ${SEED_CONTENT_ID}::uuid`;
    await sql`DELETE FROM subscription_sources WHERE id = ${SEED_SOURCE_ID}::uuid`;
    await sql`DELETE FROM shop_listings WHERE product_hash LIKE ${`s31-10-%`}`;
    await sql`DELETE FROM shop_sessions WHERE query LIKE ${`%${RUN_SUFFIX}%`} OR query = 'mechanical keyboard'`;
  }).catch(() => undefined);
}

function missionOutput(result: HoloResult): Record<string, unknown> {
  const parsed = asRecord(result.parsed);
  return asRecord(parsed.output ?? parsed.result ?? parsed);
}

/**
 * Hermetic GitHub-like fixture server for assimilate retrieval.
 * Serves README + root listing JSON shaped like the GitHub Contents API.
 */
async function startAssimilateFixtureServer(): Promise<{
  baseUrl: string;
  repoPath: string;
  close: () => Promise<void>;
}> {
  const readmeBody = [
    '# fixture-repo',
    '',
    'S31-10 hermetic assimilate payload.',
    '',
    '## Architecture',
    '- src/core — domain logic',
    '- packages/api — public surface',
  ].join('\n');

  const server: Server = createServer((req, res) => {
    const url = req.url ?? '';
    if (url.includes('/readme') || url.endsWith('/README.md')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          encoding: 'base64',
          content: Buffer.from(readmeBody, 'utf8').toString('base64'),
          html_url: 'https://example.test/fixture-repo/blob/main/README.md',
          download_url: 'https://example.test/fixture-repo/README.md',
        })
      );
      return;
    }
    if (url.includes('/contents') || url === '/' || url.startsWith('/?')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify([
          { name: 'README.md', path: 'README.md', type: 'file', size: readmeBody.length },
          { name: 'src', path: 'src', type: 'dir', size: 0 },
          { name: 'packages', path: 'packages', type: 'dir', size: 0 },
          { name: 'package.json', path: 'package.json', type: 'file', size: 64 },
        ])
      );
      return;
    }
    if (url.includes('package.json')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          name: 'package.json',
          path: 'package.json',
          type: 'file',
          encoding: 'base64',
          content: Buffer.from(
            JSON.stringify({ name: 'fixture-repo', private: true }, null, 2),
            'utf8'
          ).toString('base64'),
        })
      );
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    throw new Error('assimilate fixture server has no TCP address');
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return {
    baseUrl,
    repoPath: 'fixture-org/fixture-repo',
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((err) => (err ? reject(err) : resolveClose()));
      }),
  };
}

describe.sequential('S31-10 real retrieval for whatsNew / assimilate / shop', () => {
  beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    await ensureRedTestEnvironment();
    expect(PLATFORM_IT).toBe(true);
    expect(DATABASE_URL).toContain('/holocron_nonprod');
    await ensureTemplatesWithRetry();
    await seedSubscriptionCorpus();
    await seedShopListingsForQuery('mechanical keyboard');
  }, 180_000);

  beforeEach(async () => {
    await ensureTemplatesWithRetry();
  }, 60_000);

  afterAll(async () => {
    await cleanupSeed();
  });

  itLive(
    'whatsNewUsesRealRetrieval',
    async () => {
      const date = new Date().toISOString().slice(0, 10);
      const result = runHolo(
        's31-10-ac1-whatsnew',
        [
          'mission',
          'run',
          'whatsNew',
          '--date',
          date,
          '--goal',
          `daily briefing for ${date}`,
          '--idempotency-key',
          `s31-10-wn-${RUN_SUFFIX}`,
          '--json',
        ],
        { timeoutMs: 300_000 }
      );
      captureHoloArtifact('s31-10-AC-1-whatsnew', result);
      writeEvidence('AC-1-whatsnew.json', {
        status: result.status,
        parsed: result.parsed,
        combined: result.combined.slice(0, 8000),
      });

      expect(result.status, result.combined.slice(0, 2500)).toBe(0);
      const out = missionOutput(result);
      const headlines = Array.isArray(out.headlines) ? out.headlines : [];
      const retrievalSources = Array.isArray(out.retrievalSources) ? out.retrievalSources : [];
      expect(retrievalSources.length, 'retrieval source count >= 1').toBeGreaterThanOrEqual(1);

      const sourceIds = retrievalSources
        .map((s) => String(asRecord(s).id ?? ''))
        .filter((id) => id.length > 0);
      expect(sourceIds.length).toBeGreaterThanOrEqual(1);

      await withSql(async (sql) => {
        for (const id of sourceIds) {
          const rows = await sql`
            SELECT id::text AS id FROM subscription_sources WHERE id = ${id}::uuid
            UNION ALL
            SELECT id::text AS id FROM subscription_content WHERE id = ${id}::uuid
            LIMIT 1
          `;
          expect(rows.length, `source id ${id} resolves to Postgres`).toBeGreaterThanOrEqual(1);
        }
      });

      const blob = JSON.stringify(out);
      // Happy path must not rely solely on scaffold retailers / hash titles.
      expect(blob).not.toMatch(/deterministic-scaffolding:(?:catalog|Keychron)/);
      expect(String(out.assayText ?? '').trim().length, 'assayText non-empty').toBeGreaterThan(0);
      expect(headlines.length).toBeGreaterThanOrEqual(1);
      expect(String(out.gatherProvenance ?? '')).not.toMatch(/^Deterministic scaffolding/i);
    },
    360_000
  );

  itLive(
    'assimilateRetrievesRepositoryContent',
    async () => {
      const fixture = await startAssimilateFixtureServer();
      // Unique subject per run to avoid mission_runs_active_subject_wip_one_uidx collisions.
      const uniqueRepo = `${fixture.repoPath}-${RUN_SUFFIX}`;
      try {
        const result = await runHoloAsync(
          's31-10-ac2-assimilate',
          [
            'mission',
            'run',
            'assimilate',
            '--target',
            uniqueRepo,
            '--goal',
            `assimilate ${uniqueRepo}`,
            '--idempotency-key',
            `s31-10-as-${RUN_SUFFIX}`,
            '--json',
          ],
          {
            timeoutMs: 300_000,
            env: {
              HOLO_ASSIMILATE_API_BASE: fixture.baseUrl,
            },
          }
        );
        captureHoloArtifact('s31-10-AC-2-assimilate', result);
        writeEvidence('AC-2-assimilate.json', {
          status: result.status,
          parsed: result.parsed,
          combined: result.combined.slice(0, 8000),
          fixtureBase: fixture.baseUrl,
        });

        expect(result.status, result.combined.slice(0, 2500)).toBe(0);
        const out = missionOutput(result);
        const payload = asRecord(out.retrievalPayload);
        const files = Array.isArray(payload.files) ? payload.files : [];
        expect(files.length, 'retrieval stores non-empty file payload').toBeGreaterThanOrEqual(1);
        const firstFile = asRecord(files[0]);
        expect(String(firstFile.text ?? '').trim().length).toBeGreaterThan(0);
        expect(String(payload.repositoryUrl ?? '')).toMatch(/fixture-org\/fixture-repo/);
        expect(String(out.assayText ?? '').trim().length).toBeGreaterThan(0);
        expect(String(out.gatherProvenance ?? '')).not.toMatch(/^Deterministic scaffolding/i);
      } finally {
        await fixture.close();
      }
    },
    360_000
  );

  itLive(
    'shopReturnsNonScaffoldProducts',
    async () => {
      // Unique query subject avoids active WIP collision with concurrent suites.
      const query = `mechanical keyboard ${RUN_SUFFIX}`;
      await seedShopListingsForQuery(query);
      const result = runHolo(
        's31-10-ac3-shop',
        [
          'mission',
          'run',
          'shop',
          '--query',
          query,
          '--goal',
          `shop ${query}`,
          '--idempotency-key',
          `s31-10-shop-${RUN_SUFFIX}`,
          '--json',
        ],
        { timeoutMs: 300_000 }
      );
      captureHoloArtifact('s31-10-AC-3-shop', result);
      writeEvidence('AC-3-shop.json', {
        status: result.status,
        parsed: result.parsed,
        combined: result.combined.slice(0, 8000),
      });

      expect(result.status, result.combined.slice(0, 2500)).toBe(0);
      const out = missionOutput(result);
      const products = Array.isArray(out.products) ? out.products : [];
      expect(products.length, 'products array length >= 1').toBeGreaterThanOrEqual(1);
      for (const product of products) {
        const retailer = String(asRecord(product).retailer ?? '');
        expect(retailer.startsWith(SCAFFOLD_RETAILER_PREFIX)).toBe(false);
      }
      expect(String(out.assayText ?? '').trim().length).toBeGreaterThan(0);
      expect(String(out.gatherProvenance ?? '')).not.toMatch(/^Deterministic scaffolding/i);
    },
    360_000
  );

  itLive(
    'scaffoldOnlyCommitFailsClosed',
    async () => {
      const forceEnv = { HOLO_TEST_FORCE_PIPELINE_SCAFFOLD: '1' };
      const date = new Date().toISOString().slice(0, 10);

      const whats = runHolo(
        's31-10-ac4-whatsnew-scaffold',
        [
          'mission',
          'run',
          'whatsNew',
          '--date',
          date,
          '--goal',
          `scaffold-only whatsNew ${date}`,
          '--idempotency-key',
          `s31-10-wn-scaf-${RUN_SUFFIX}`,
          '--json',
        ],
        { timeoutMs: 180_000, env: forceEnv }
      );
      const assimilate = runHolo(
        's31-10-ac4-assimilate-scaffold',
        [
          'mission',
          'run',
          'assimilate',
          '--target',
          'acme/widget',
          '--goal',
          'scaffold-only assimilate acme/widget',
          '--idempotency-key',
          `s31-10-as-scaf-${RUN_SUFFIX}`,
          '--json',
        ],
        { timeoutMs: 180_000, env: forceEnv }
      );
      const shop = runHolo(
        's31-10-ac4-shop-scaffold',
        [
          'mission',
          'run',
          'shop',
          '--query',
          'mechanical keyboard',
          '--goal',
          'scaffold-only shop',
          '--idempotency-key',
          `s31-10-shop-scaf-${RUN_SUFFIX}`,
          '--json',
        ],
        { timeoutMs: 180_000, env: forceEnv }
      );

      writeEvidence('AC-4-scaffold-only.json', {
        whats: { status: whats.status, combined: whats.combined.slice(0, 4000) },
        assimilate: { status: assimilate.status, combined: assimilate.combined.slice(0, 4000) },
        shop: { status: shop.status, combined: shop.combined.slice(0, 4000) },
      });

      const cases = [
        ['whatsNew', whats],
        ['assimilate', assimilate],
        ['shop', shop],
      ] as const;

      for (const [name, result] of cases) {
        expect(result.status, `${name} scaffold-only must exit != 0`).not.toBe(0);
        expect(
          result.combined,
          `${name} must name scaffold or empty retrieval`
        ).toMatch(/scaffold|empty retrieval|SCAFFOLD|deterministic-scaffolding|MISSION_.*SCAFFOLD|MISSION_.*EMPTY/i);
      }
    },
    420_000
  );

  it('scaffoldHelpersRemainLabeled', () => {
    const whats = gatherWhatsNewBriefing('2026-08-09');
    const assimilate = gatherAssimilateReport('acme/widget');
    const shop = gatherShopProducts('mechanical keyboard');

    writeEvidence('AC-5-scaffold-labels.json', { whats, assimilate, shop });

    expect(whats.provenance).toBe(SCAFFOLD_NOTE);
    expect(JSON.stringify(whats.headlines)).toMatch(/Deterministic scaffolding|scaffold/i);

    expect(assimilate.provenance).toBe(SCAFFOLD_NOTE);
    expect(JSON.stringify(assimilate)).toMatch(/Deterministic scaffolding|scaffold/i);

    expect(shop.length).toBeGreaterThan(0);
    for (const product of shop) {
      expect(String(product.retailer ?? '')).toMatch(new RegExp(`^${SCAFFOLD_RETAILER_PREFIX}`));
    }
  });
});
