/**
 * FUL-PLAT-001 — append-only Fulcrum ledger contract (integration, real Postgres).
 *
 * TDD red_first: this file exists BEFORE migration 0041 / the fulcrum schema.
 *   RED   = each AC fails its precondition assertion because migration
 *           0041_fulcrum_ledger.sql has not shipped yet (the 9 Fulcrum tables and
 *           the additive sources/claims columns are absent from holocron_nonprod).
 *   GREEN = 0041_fulcrum_ledger.sql + src/db/schema/fulcrum.ts turn every
 *           assertion below true against the same real database.
 *
 * Contract (REQUIREMENT-CONTRACT v1 in the task spec):
 *   - fixtures: migrated_nonprod_db | seeded_fulcrum_versions | seeded_evidence_source
 *   - 9 Fulcrum tables: candidates, belief_scores, weight_versions, weight_components,
 *     domain_tier_versions, domain_tiers, touches, probes, claim_evidence_bindings
 *   - append-only barrier = Postgres triggers + role grants (0004 pattern):
 *     holocron_app gets SELECT/INSERT only (catalog layer, REVOKE mirrors 0004);
 *     a BEFORE UPDATE OR DELETE trigger rejects ANY role with a message naming the
 *     table as append-only (data layer). AC-2 proves both layers.
 *   - NEVER: no `prospects` / `cycles` / `scores` / `fulcrumCycles` table names.
 *
 * Fixtures run REAL entrypoints only:
 *   - migration:  `bun services/platform/src/cli/holo.ts db:migrate --json` subprocess
 *   - evidence:   `bun services/platform/src/cli/holo.ts evidence:seed --json` subprocess,
 *                 then the owner connection completes the fetch artifact (normalized_text,
 *                 retrieved_at, source_domain, provenance_group, self_sourced, sha256
 *                 content_hash) because the shipped seed CLI predates those columns.
 *   - fulcrum version rows: INSERT through the holocron_app product role (the same
 *     INSERT grants a fulcrum seed CLI will use; holo.ts is out of this task's scope).
 *
 * Run (per AC):
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     FLEET_URL=http://127.0.0.1:4545/v1 \
 *     pnpm vitest run --project integration \
 *     services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-1'
 */

import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client.ts';
import { resolveProductDatabaseUrl } from '../../src/db/evidence/roles.ts';

const execFileAsync = promisify(execFile);

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? '';
const TIMEOUT = 180_000;

const HERE = import.meta.dirname;
const ROOT = resolve(HERE, '../../..');
const HOLO_TS = resolve(HERE, '../../src/cli/holo.ts');

/** The 9 Fulcrum ledger tables (PRD 03-data-schema §C). */
const FULCRUM_TABLES = [
  'candidates',
  'belief_scores',
  'weight_versions',
  'weight_components',
  'domain_tier_versions',
  'domain_tiers',
  'touches',
  'probes',
  'claim_evidence_bindings',
] as const;

/** Prospector-port names the PRD forbids outright. */
const FORBIDDEN_TABLES = ['prospects', 'cycles', 'scores', 'fulcrumCycles'] as const;

/** Additive fetch-artifact columns on sources (PRD 03-data-schema §A). */
const SOURCES_COLUMNS = [
  'normalized_text',
  'retrieved_at',
  'source_domain',
  'provenance_group',
  'self_sourced',
] as const;

/** Additive admission columns on claims (PRD 03-data-schema §A). */
const CLAIMS_COLUMNS = [
  'candidate_id',
  'component',
  'polarity',
  'status',
  'quote_text',
  'passes_gate',
  'qualifying_grade',
  'target_claim_id',
] as const;

const MISSION_ID = 'dev-revenue';
const DOMAIN_TIER_COUNT = 8;

let owner: Sql; // migration-owner/admin connection (trust auth as OS user)
let app: Sql; // holocron_app product-role connection
let ownerRole: Sql; // single connection bound to holocron_owner (trigger-layer probes)
let fulcrumFixture: {
  candidateId: string;
  weightVersionId: string;
  domainTierVersionId: string;
} | null = null;
let evidenceFixture: {
  sourceId: string;
  claimId: string;
  digest: string;
  normalizedText: string;
} | null = null;
const runId = randomUUID();

const state = {
  missingTables: [] as string[],
  forbiddenPresent: [] as string[],
  missingColumns: [] as string[],
};

type PgErr = { code: string; message: string; constraint: string | null };

/** Run a statement, normalizing a raised Postgres error (null when it succeeds). */
async function attempt(stmt: Promise<unknown>): Promise<PgErr | null> {
  try {
    await stmt;
    return null;
  } catch (e) {
    const err = e as { code?: unknown; message?: unknown; constraint?: unknown };
    return {
      code: String(err.code ?? ''),
      message: err instanceof Error ? err.message : String(err.message ?? e),
      constraint: typeof err.constraint === 'string' ? err.constraint : null,
    };
  }
}

/** Run a holo CLI command as a real subprocess; capture code + JSON output. */
async function runHolo(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const r = await execFileAsync('bun', [HOLO_TS, ...args], {
      env: { ...process.env, DATABASE_URL },
      cwd: ROOT,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { code: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (e) {
    const err = e as { code?: unknown; stdout?: string; stderr?: string };
    return {
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    };
  }
}

/** 1200-char normalized_text with the run id embedded (unique digest per run). */
function buildNormalizedText(): string {
  const head = `FULCRUM-IT normalized fetch artifact for run ${runId}. `;
  const filler = 'Fulcrum evaluates niche evidence through deterministic evidence gating. ';
  let text = head;
  while (text.length < 1200) text += filler;
  return text.slice(0, 1200);
}

/** Delete evidence-graph rows left by previous runs of this test file (owner path). */
async function cleanupPriorEvidenceArtifacts(): Promise<void> {
  const srcs = await owner<{ id: string }[]>`
    SELECT id::text AS id FROM sources WHERE metadata_json->>'fulcrum_it' = 'true'
  `;
  if (srcs.length === 0) return;
  const ids = srcs.map((s) => s.id);
  await owner`DELETE FROM beliefs WHERE claim_id IN (SELECT id::text FROM claims WHERE source_id IN ${owner(ids)})`;
  await owner`DELETE FROM relations WHERE object_id IN (SELECT id::text FROM claims WHERE source_id IN ${owner(ids)})
    OR subject_id IN (SELECT id::text FROM passages WHERE source_id IN ${owner(ids)})`;
  await owner`TRUNCATE claim_evidence_bindings`;
  await owner`DELETE FROM claims WHERE source_id IN ${owner(ids)}`;
  await owner`DELETE FROM passages WHERE source_id IN ${owner(ids)}`;
  await owner`DELETE FROM sources WHERE id IN ${owner(ids)}`;
}

/** Reset the Fulcrum ledger to the empty migrated state (owner TRUNCATE is the only reset). */
async function truncateFulcrumTables(): Promise<void> {
  await owner`TRUNCATE candidates, belief_scores, weight_versions, weight_components,
    domain_tier_versions, domain_tiers, touches, probes, claim_evidence_bindings`;
}

/**
 * Fixture: seeded_fulcrum_versions — mission dev-revenue with weight_versions v1
 * (disconfirmation_multiplier 2), one weight component, domain_tier_versions v1,
 * exactly 8 domain_tiers rows, and 1 raw candidate — all INSERTed through the
 * holocron_app product role.
 */
async function seedFulcrumFixture(): Promise<{
  candidateId: string;
  weightVersionId: string;
  domainTierVersionId: string;
}> {
  // RED: 0041 not shipped — yield so each test fails its explicit precondition assertion
  // (a clean RED assertion failure, not an infrastructure error).
  if (state.missingTables.length > 0) return null;

  await truncateFulcrumTables();

  const wv = await app<{ id: string }[]>`
    INSERT INTO weight_versions (mission_id, version, disconfirmation_multiplier)
    VALUES (${MISSION_ID}, 1, 2)
    RETURNING id::text AS id
  `;
  const weightVersionId = wv[0]?.id;
  expect(weightVersionId, 'weight_versions v1 insert through holocron_app').toBeTruthy();

  await app`
    INSERT INTO weight_components (weight_version_id, component, kind, weight, grade_floor, recency_window_days, half_life_days)
    VALUES (${weightVersionId}, 'evidence', 'evidence', 0.6, 0.3, 30, 14)
  `;

  const dtv = await app<{ id: string }[]>`
    INSERT INTO domain_tier_versions (mission_id, version)
    VALUES (${MISSION_ID}, 1)
    RETURNING id::text AS id
  `;
  const domainTierVersionId = dtv[0]?.id;
  expect(domainTierVersionId, 'domain_tier_versions v1 insert through holocron_app').toBeTruthy();

  const tiers: Array<[string, string, number]> = [
    ['gov', 'primary', 0.95],
    ['edu', 'primary', 0.9],
    ['major-news', 'secondary', 0.8],
    ['industry-blog', 'secondary', 0.6],
    ['vendor-docs', 'tertiary', 0.5],
    ['community', 'tertiary', 0.4],
    ['social', 'quaternary', 0.3],
    ['unknown', 'quaternary', 0.1],
  ];
  for (const [domain, tier, value] of tiers) {
    await app`
      INSERT INTO domain_tiers (domain_tier_version_id, registrable_domain, tier, tier_value)
      VALUES (${domainTierVersionId}, ${domain}, ${tier}, ${value})
    `;
  }
  const dtCount = await app<{ count: number }[]>`
    SELECT count(*)::int AS count FROM domain_tiers
  `;
  expect(dtCount[0]?.count).toBe(DOMAIN_TIER_COUNT);

  const cand = await app<{ id: string }[]>`
    INSERT INTO candidates (mission_id, stage, title, question)
    VALUES (${MISSION_ID}, 'raw', 'FULCRUM-IT candidate', 'Does the fleet produce one trustworthy dossier?')
    RETURNING id::text AS id
  `;
  const candidateId = cand[0]?.id;
  expect(candidateId, 'candidates raw-stage insert through holocron_app').toBeTruthy();

  return {
    candidateId: candidateId as string,
    weightVersionId: weightVersionId as string,
    domainTierVersionId,
  };
}

/**
 * Fixture: seeded_evidence_source — one sources row written by the REAL
 * `holo evidence:seed` CLI, then completed with the fetch artifact (1200-char
 * normalized_text, retrieved_at, source_domain, provenance_group, self_sourced,
 * 64-char sha256 content_hash) plus the seed's claim bound to that source.
 */
async function ensureEvidenceFixture(): Promise<{
  sourceId: string;
  claimId: string;
  digest: string;
  normalizedText: string;
} | null> {
  if (evidenceFixture) return evidenceFixture;
  if (state.missingColumns.length > 0) return null; // RED: additive columns not shipped

  await cleanupPriorEvidenceArtifacts();

  const seedRun = await runHolo(['evidence:seed', '--json']);
  expect(seedRun.code, `holo evidence:seed exit code\n${seedRun.stderr}`).toBe(0);
  const seeded = JSON.parse(seedRun.stdout) as {
    ok: boolean;
    sourceId: string | null;
    claimId: string | null;
    errors: string[];
  };
  expect(seeded.ok, `holo evidence:seed ok\n${seeded.errors.join('\n')}`).toBe(true);
  expect(seeded.sourceId, 'evidence:seed sourceId').toBeTruthy();
  expect(seeded.claimId, 'evidence:seed claimId').toBeTruthy();

  const sourceId = seeded.sourceId as string;
  const claimId = seeded.claimId as string;
  const normalizedText = buildNormalizedText();
  const digest = createHash('sha256').update(normalizedText).digest('hex');
  expect(digest).toHaveLength(64);

  await owner`
    UPDATE sources SET
      normalized_text = ${normalizedText},
      retrieved_at = now(),
      source_domain = 'example.com',
      provenance_group = 'web',
      self_sourced = false,
      content_hash = ${digest},
      metadata_json = coalesce(metadata_json, '{}'::jsonb) || '{"fulcrum_it":"true"}'::jsonb
    WHERE id = ${sourceId}
  `;

  const bound = await app<{ id: string }[]>`
    SELECT id::text AS id FROM claims WHERE source_id = ${sourceId}
  `;
  expect(bound.length, 'seeded claim bound to the seeded source').toBe(1);

  evidenceFixture = { sourceId, claimId, digest, normalizedText };
  return evidenceFixture;
}

function requireLedgerReady(scope: string): void {
  expect(
    state.missingTables,
    `${scope}: migration 0041_fulcrum_ledger.sql must create the Fulcrum tables (missing: ${state.missingTables.join(', ') || 'none'})`
  ).toEqual([]);
  expect(
    state.forbiddenPresent,
    `${scope}: forbidden Prospector-port tables must not exist (found: ${state.forbiddenPresent.join(', ') || 'none'})`
  ).toEqual([]);
}

function requireEvidenceColumns(scope: string): void {
  expect(
    state.missingColumns,
    `${scope}: additive sources/claims columns must exist (missing: ${state.missingColumns.join(', ') || 'none'})`
  ).toEqual([]);
}

beforeAll(async () => {
  if (!PLATFORM_IT) {
    throw new Error('fulcrum-ledger-contract requires PLATFORM_IT=1 (no mocks / no skip)');
  }
  if (!DATABASE_URL.includes('holocron_nonprod')) {
    throw new Error(
      `fulcrum-ledger-contract requires DATABASE_URL→holocron_nonprod; got ${DATABASE_URL || '(missing)'}`
    );
  }

  owner = createSql(DATABASE_URL, { max: 2 });
  app = createSql(resolveProductDatabaseUrl(), { max: 2 });
  ownerRole = createSql(DATABASE_URL, { max: 1 });
  await ownerRole.unsafe('SET ROLE holocron_owner');

  // Product role binding: every "as holocron_app" step below runs on this session.
  const who = await app<{ u: string }[]>`SELECT current_user::text AS u`;
  expect(who[0]?.u).toBe('holocron_app');

  // REAL entrypoint: migrate through the holo CLI subprocess (idempotent).
  const migrateRun = await runHolo(['db:migrate', '--json']);
  expect(migrateRun.code, `holo db:migrate exit code\n${migrateRun.stderr}`).toBe(0);
  const migrated = JSON.parse(migrateRun.stdout) as { ok: boolean; errors: string[] };
  expect(migrated.ok, `holo db:migrate ok\n${migrated.errors.join('\n')}`).toBe(true);

  // Probe the live database for the contract surface.
  const tables = await owner<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  const names = new Set(tables.map((r) => r.table_name));
  state.missingTables = FULCRUM_TABLES.filter((t) => !names.has(t));
  state.forbiddenPresent = FORBIDDEN_TABLES.filter((f) => names.has(f));

  const colRows = await owner<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'sources' AND column_name IN ${owner([...SOURCES_COLUMNS])})
        OR (table_name = 'claims' AND column_name IN ${owner([...CLAIMS_COLUMNS])})
      )
  `;
  const have = new Set(colRows.map((r) => `${r.table_name}.${r.column_name}`));
  state.missingColumns = [
    ...SOURCES_COLUMNS.map((c) => `sources.${c}`),
    ...CLAIMS_COLUMNS.map((c) => `claims.${c}`),
  ].filter((f) => !have.has(f));

  if (state.missingTables.length === 0) {
    await truncateFulcrumTables();
  }
}, TIMEOUT);

afterAll(async () => {
  await ownerRole?.unsafe('RESET ROLE').catch(() => undefined);
  await ownerRole?.end({ timeout: 5 }).catch(() => undefined);
  await app?.end({ timeout: 5 }).catch(() => undefined);
  await owner?.end({ timeout: 5 }).catch(() => undefined);
});

describe('FUL-PLAT-001 AC-1: ledger tables accept an appended belief score (PRIMARY)', () => {
  beforeAll(async () => {
    fulcrumFixture = await seedFulcrumFixture();
  }, TIMEOUT);

  it(
    'AC-1: appends one doubly-stamped belief_scores row as holocron_app across all 9 tables',
    async () => {
      requireLedgerReady('AC-1');
      const fx = fulcrumFixture;
      expect(fx, 'seeded_fulcrum_versions fixture').toBeTruthy();

      // GIVEN: 0 rows in belief_scores
      const pre = await app<{ count: number }[]>`SELECT count(*)::int AS count FROM belief_scores`;
      expect(pre[0]?.count).toBe(0);

      // WHEN: append one row stamped with weight_version 1 and domain_tier_version 1
      const inserted = await app<
        { id: string; score: number; weight_version: number; domain_tier_version: number }[]
      >`
      INSERT INTO belief_scores (candidate_id, score, weight_version, domain_tier_version)
      VALUES (${fx?.candidateId}, 0.62, 1, 1)
      RETURNING id::text AS id, score, weight_version, domain_tier_version
    `;
      const row = inserted[0];

      // THEN: exactly 1 stamped row
      const post = await app<{ count: number }[]>`SELECT count(*)::int AS count FROM belief_scores`;
      expect(post[0]?.count).toBe(1);
      expect(row?.score).toBe(0.62);
      expect(row?.weight_version).toBe(1);
      expect(row?.domain_tier_version).toBe(1);

      // THEN: information_schema lists all 9 Fulcrum tables
      const live = await owner<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `;
      const liveNames = new Set(live.map((r) => r.table_name));
      for (const t of FULCRUM_TABLES) {
        expect(liveNames.has(t), `information_schema must list ${t}`).toBe(true);
      }
      for (const f of FORBIDDEN_TABLES) {
        expect(liveNames.has(f), `forbidden table ${f} must not exist`).toBe(false);
      }

      console.log(
        `FULCRUM-IT-AC1 ${JSON.stringify({
          run_id: runId,
          belief_scores_row: row,
          fulcrum_tables_present: FULCRUM_TABLES.length,
        })}`
      );
    },
    TIMEOUT
  );
});

describe('FUL-PLAT-001 AC-2: append-only barrier rejects UPDATE and DELETE', () => {
  beforeAll(async () => {
    fulcrumFixture = await seedFulcrumFixture();
  }, TIMEOUT);

  it(
    'AC-2: holocron_app cannot UPDATE or DELETE belief_scores; trigger blocks privileged roles too',
    async () => {
      requireLedgerReady('AC-2');
      const fx = fulcrumFixture;
      expect(fx, 'seeded_fulcrum_versions fixture').toBeTruthy();

      // GIVEN: one appended belief_scores row (score 0.62) as holocron_app
      await app`
      INSERT INTO belief_scores (candidate_id, score, weight_version, domain_tier_version)
      VALUES (${fx?.candidateId}, 0.62, 1, 1)
    `;

      // WHEN/THEN: catalog layer — holocron_app holds no UPDATE/DELETE (0004 REVOKE mirror)
      const upd = await attempt(app`UPDATE belief_scores SET score = 0.99`);
      expect(upd, 'UPDATE belief_scores as holocron_app must raise').not.toBeNull();
      expect(upd?.code, 'app UPDATE rejection is Postgres permission-denied').toBe('42501');
      expect(upd?.message).toContain('belief_scores');

      const del = await attempt(app`DELETE FROM belief_scores`);
      expect(del, 'DELETE belief_scores as holocron_app must raise').not.toBeNull();
      expect(del?.code, 'app DELETE rejection is Postgres permission-denied').toBe('42501');
      expect(del?.message).toContain('belief_scores');

      // WHEN/THEN: trigger layer — a privileged role holding DML grants still hits the
      // append-only trigger, whose message names the table as append-only.
      const trigUpd = await attempt(ownerRole`UPDATE belief_scores SET score = 0.99`);
      expect(trigUpd, 'owner-role UPDATE must hit the append-only trigger').not.toBeNull();
      expect(trigUpd?.message).toContain('append-only');
      expect(trigUpd?.message).toContain('belief_scores');

      const trigDel = await attempt(ownerRole`DELETE FROM belief_scores`);
      expect(trigDel, 'owner-role DELETE must hit the append-only trigger').not.toBeNull();
      expect(trigDel?.message).toContain('append-only');
      expect(trigDel?.message).toContain('belief_scores');

      // THEN: the appended row is untouched
      const score = await app<{ score: number }[]>`SELECT score FROM belief_scores`;
      expect(score).toHaveLength(1);
      expect(score[0]?.score).toBe(0.62);
      const cnt = await app<{ count: number }[]>`SELECT count(*)::int AS count FROM belief_scores`;
      expect(cnt[0]?.count).toBe(1);

      console.log(
        `FULCRUM-IT-AC2 ${JSON.stringify({
          run_id: runId,
          app_update_error: upd?.code,
          app_delete_error: del?.code,
          trigger_error: trigUpd?.message,
          score_preserved: score[0]?.score,
        })}`
      );
    },
    TIMEOUT
  );

  it(
    'AC-2b: weight_components UPDATE and domain_tiers DELETE are append-only; 8 tier rows persist',
    async () => {
      requireLedgerReady('AC-2');

      const wcUpd = await attempt(app`UPDATE weight_components SET weight = 0.9`);
      expect(wcUpd, 'UPDATE weight_components as holocron_app must raise').not.toBeNull();
      expect(wcUpd?.message).toContain('weight_components');

      const dtDel = await attempt(app`DELETE FROM domain_tiers`);
      expect(dtDel, 'DELETE domain_tiers as holocron_app must raise').not.toBeNull();
      expect(dtDel?.message).toContain('domain_tiers');

      const wcTrig = await attempt(ownerRole`UPDATE weight_components SET weight = 0.9`);
      expect(wcTrig, 'owner-role weight_components UPDATE must hit the trigger').not.toBeNull();
      expect(wcTrig?.message).toContain('append-only');
      expect(wcTrig?.message).toContain('weight_components');

      const dtTrig = await attempt(ownerRole`DELETE FROM domain_tiers`);
      expect(dtTrig, 'owner-role domain_tiers DELETE must hit the trigger').not.toBeNull();
      expect(dtTrig?.message).toContain('append-only');
      expect(dtTrig?.message).toContain('domain_tiers');

      const dtCount = await app<{ count: number }[]>`
      SELECT count(*)::int AS count FROM domain_tiers
    `;
      expect(dtCount[0]?.count).toBe(DOMAIN_TIER_COUNT);

      console.log(
        `FULCRUM-IT-AC2B ${JSON.stringify({
          run_id: runId,
          domain_tiers_preserved: dtCount[0]?.count,
          trigger_error: dtTrig?.message,
        })}`
      );
    },
    TIMEOUT
  );
});

describe('FUL-PLAT-001 AC-3: belief score requires both version stamps', () => {
  beforeAll(async () => {
    fulcrumFixture = await seedFulcrumFixture();
  }, TIMEOUT);

  it(
    'AC-3: omitting domain_tier_version raises not-null violation and belief_scores stays empty',
    async () => {
      requireLedgerReady('AC-3');
      const fx = fulcrumFixture;
      expect(fx, 'seeded_fulcrum_versions fixture (versions present, 0 belief rows)').toBeTruthy();

      // GIVEN versions v1/v1 exist; WHEN insert omits domain_tier_version
      const missing = await attempt(
        app`INSERT INTO belief_scores (candidate_id, score, weight_version) VALUES ('c1', 0.42, 1)`
      );
      expect(missing, 'unstamped insert must raise').not.toBeNull();
      expect(missing?.code, 'not-null violation').toBe('23502');
      expect(missing?.message).toContain('domain_tier_version');

      // THEN: belief_scores still holds 0 rows, none with a NULL stamp
      const cnt = await app<{ count: number }[]>`SELECT count(*)::int AS count FROM belief_scores`;
      expect(cnt[0]?.count).toBe(0);
      const nullRows = await app<{ count: number }[]>`
      SELECT count(*)::int AS count FROM belief_scores WHERE domain_tier_version IS NULL
    `;
      expect(nullRows[0]?.count).toBe(0);
    },
    TIMEOUT
  );

  it(
    'AC-3b: a stamped insert persists weight_version 1 and domain_tier_version 1',
    async () => {
      requireLedgerReady('AC-3');
      const fx = fulcrumFixture;
      expect(fx).toBeTruthy();

      const stamped = await app<{ weight_version: number; domain_tier_version: number }[]>`
      INSERT INTO belief_scores (candidate_id, score, weight_version, domain_tier_version)
      VALUES (${fx?.candidateId}, 0.42, 1, 1)
      RETURNING weight_version, domain_tier_version
    `;
      expect(stamped[0]?.weight_version).toBe(1);
      expect(stamped[0]?.domain_tier_version).toBe(1);
      const cnt = await app<{ count: number }[]>`SELECT count(*)::int AS count FROM belief_scores`;
      expect(cnt[0]?.count).toBe(1);

      console.log(`FULCRUM-IT-AC3B ${JSON.stringify({ run_id: runId, stamped_row: stamped[0] })}`);
    },
    TIMEOUT
  );
});

describe('FUL-PLAT-001 AC-4: sources fetch-artifact columns dedupe on content hash', () => {
  it(
    'AC-4: seeded 1200-char fetch artifact rejects a duplicate content_hash insert',
    async () => {
      requireLedgerReady('AC-4');
      requireEvidenceColumns('AC-4');
      const fx = await ensureEvidenceFixture();
      expect(fx, 'seeded_evidence_source fixture').toBeTruthy();

      // GIVEN: the seeded row carries the fetch artifact
      const rows = await app<
        {
          normalized_text: string | null;
          retrieved_at: Date | null;
          source_domain: string | null;
          provenance_group: string | null;
          self_sourced: boolean | null;
        }[]
      >`
      SELECT normalized_text, retrieved_at, source_domain, provenance_group, self_sourced
      FROM sources WHERE id = ${fx?.sourceId}
    `;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.normalized_text, 'normalized_text present').toBeTruthy();
      expect((rows[0]?.normalized_text as string).length).toBe(1200);
      expect(rows[0]?.retrieved_at, 'retrieved_at timestamptz non-null').not.toBeNull();

      // WHEN: a second insert reuses the identical content_hash
      const dup = await attempt(
        app`INSERT INTO sources (source_kind, content_hash, title, url)
        VALUES ('web', ${fx?.digest}, 'FULCRUM-IT duplicate probe', 'https://example.com/duplicate')`
      );

      // THEN: unique violation on sources_content_hash_uidx; still exactly 1 row
      expect(dup, 'duplicate content_hash insert must raise').not.toBeNull();
      expect(dup?.code, 'unique violation').toBe('23505');
      expect(dup?.message).toContain('sources_content_hash_uidx');
      const cnt = await app<{ count: number }[]>`
      SELECT count(*)::int AS count FROM sources WHERE content_hash = ${fx?.digest}
    `;
      expect(cnt[0]?.count).toBe(1);

      console.log(
        `FULCRUM-IT-AC4 ${JSON.stringify({
          run_id: runId,
          source_id: fx?.sourceId,
          content_hash: fx?.digest,
          normalized_text_length: (rows[0]?.normalized_text as string).length,
          retrieved_at: rows[0]?.retrieved_at,
          source_domain: rows[0]?.source_domain,
          provenance_group: rows[0]?.provenance_group,
          self_sourced: rows[0]?.self_sourced,
          duplicate_error: dup?.message,
          rows_for_digest: cnt[0]?.count,
        })}`
      );
    },
    TIMEOUT
  );
});

describe('FUL-PLAT-001 AC-5: claims admission columns reject an unknown status', () => {
  it(
    'AC-5: status CHECK (claims_status_check) rejects approved; provisional row persists',
    async () => {
      requireLedgerReady('AC-5');
      requireEvidenceColumns('AC-5');
      const fx = await ensureEvidenceFixture();
      expect(fx, 'seeded_evidence_source fixture').toBeTruthy();

      // GIVEN: a claims row bound to the seeded source
      const bound = await app<{ id: string }[]>`
      SELECT id::text AS id FROM claims WHERE source_id = ${fx?.sourceId}
    `;
      expect(bound).toHaveLength(1);

      // WHEN: insert with the allowed provisional status + admission columns
      const ins = await app<{ id: string; status: string; passes_gate: boolean }[]>`
      INSERT INTO claims (source_id, claim_text, status, passes_gate, component)
      VALUES (${fx?.sourceId}, 'FULCRUM-IT claim: provisional admission row (component=demand)', 'provisional', false, 'demand')
      RETURNING id::text AS id, status, passes_gate
    `;
      expect(ins[0]?.status).toBe('provisional');
      expect(ins[0]?.passes_gate).toBe(false);

      // WHEN: an admission path writes status 'approved' (not one of the four allowed)
      const bad = await attempt(
        app`INSERT INTO claims (source_id, claim_text, status, passes_gate, component)
        VALUES (${fx?.sourceId}, 'FULCRUM-IT claim: rejected approved-status probe', 'approved', false, 'demand')`
      );

      // THEN: check violation naming claims_status_check
      expect(bad, "status 'approved' insert must raise").not.toBeNull();
      expect(bad?.code, 'CHECK violation').toBe('23514');
      expect(bad?.message).toContain('claims_status_check');

      // THEN: the stored admission row is untouched
      const row = await app<
        {
          status: string;
          passes_gate: boolean | null;
          qualifying_grade: number | null;
          polarity: string | null;
        }[]
      >`
      SELECT status, passes_gate, qualifying_grade, polarity
      FROM claims WHERE id = ${ins[0]?.id}
    `;
      expect(row[0]?.status).toBe('provisional');
      expect(row[0]?.passes_gate).toBe(false);

      const provisional = await app<{ count: number }[]>`
      SELECT count(*)::int AS count FROM claims
      WHERE status = 'provisional' AND component = 'demand' AND passes_gate = false
        AND source_id = ${fx?.sourceId}
    `;
      expect(provisional[0]?.count).toBe(1);
      const approved = await app<{ count: number }[]>`
      SELECT count(*)::int AS count FROM claims WHERE status = 'approved'
    `;
      expect(approved[0]?.count).toBe(0);

      console.log(
        `FULCRUM-IT-AC5 ${JSON.stringify({
          run_id: runId,
          stored_row: row[0],
          rejected_error: bad?.message,
          provisional_scenario_rows: provisional[0]?.count,
          approved_rows: approved[0]?.count,
        })}`
      );
    },
    TIMEOUT
  );
});
