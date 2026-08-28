/**
 * FUL-PLAT-005 — Compile the versioned Fulcrum mission contract.
 *
 * Scenario-backed integration tests against REAL Postgres holocron_nonprod
 * (PLATFORM_IT=1) — never mocks of @mastra/core, the DB, or the model layer.
 *
 *   AC-1  compiling dev-revenue writes one versioned weight + tier set (PRIMARY)
 *   AC-2  publishing version 2 leaves version 1 rows untouched
 *   AC-3  an unregistered tool grant fails compilation and writes nothing
 *   AC-4  source governance fields are Zod-validated and round-trip through Postgres
 *   AC-5  the fulcrum instantiation compiles with the six corpus tool grants
 *
 * Ladder reset uses TRUNCATE — the sanctioned owner-only ledger reset (0041's
 * append-only trigger guards UPDATE/DELETE only). Mission-template rows for
 * evidence-research are DELETEd (mission tables are not append-only).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client.ts';
import { FULCRUM_CORPUS_TOOL_IDS } from '../../src/fulcrum/contract.ts';
import {
  compileFulcrumMissionContract,
  type FulcrumContractCompileInput,
  type FulcrumContractCompileResult,
  FulcrumContractError,
} from '../../src/fulcrum/contract-compile.ts';
import {
  DEV_REVENUE_MISSION_ID,
  devRevenueMissionContract,
} from '../../src/fulcrum/missions/dev-revenue.ts';
import { parseMissionTemplateDefinition } from '../../src/mission/contract.ts';
import {
  EVIDENCE_RESEARCH_TEMPLATE_KEY,
  evidenceResearchTemplateDefinition,
  FULCRUM_INSTANTIATION_TEMPLATE_VERSION,
} from '../../src/mission/templates/evidence-research.ts';
import {
  DATABASE_URL,
  ensureRedTestEnvironment,
  PLATFORM_IT,
  REPO_ROOT,
} from './mission-red.helpers.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/FUL-PLAT-005');

function captureArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function raise(message: string): never {
  throw new Error(message);
}

/** Deterministic compile with the concurrent-worktree fleet_manifest_path drift retry. */
async function compileResilient(
  input: FulcrumContractCompileInput
): Promise<FulcrumContractCompileResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await compileFulcrumMissionContract(input);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/immutable mission template conflict|fleet_manifest_path/.test(message)) {
        throw error;
      }
      if (sql) await resetFulcrumState(sql);
      await new Promise((r) => setTimeout(r, 100 + attempt * 150));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : raise(`fulcrum compile kept failing: ${String(lastError)}`);
}

async function resetFulcrumState(db: Sql): Promise<void> {
  await db`TRUNCATE TABLE weight_versions, weight_components, domain_tier_versions, domain_tiers`;
  await db`DELETE FROM mission_template_versions WHERE template_key = ${EVIDENCE_RESEARCH_TEMPLATE_KEY}`;
  await db`DELETE FROM mission_templates WHERE template_key = ${EVIDENCE_RESEARCH_TEMPLATE_KEY}`;
}

async function ladderCounts(db: Sql): Promise<{
  weightVersions: number;
  weightComponents: number;
  domainTierVersions: number;
  domainTiers: number;
}> {
  const [wv] = await db<
    { count: string }[]
  >`SELECT count(*)::text AS count FROM weight_versions WHERE mission_id = ${DEV_REVENUE_MISSION_ID}`;
  const [wc] = await db<
    { count: string }[]
  >`SELECT count(*)::text AS count FROM weight_components wc
     JOIN weight_versions wv ON wv.id = wc.weight_version_id
     WHERE wv.mission_id = ${DEV_REVENUE_MISSION_ID}`;
  const [dtv] = await db<
    { count: string }[]
  >`SELECT count(*)::text AS count FROM domain_tier_versions WHERE mission_id = ${DEV_REVENUE_MISSION_ID}`;
  const [dt] = await db<{ count: string }[]>`SELECT count(*)::text AS count FROM domain_tiers dtr
     JOIN domain_tier_versions dtv ON dtv.id = dtr.domain_tier_version_id
     WHERE dtv.mission_id = ${DEV_REVENUE_MISSION_ID}`;
  return {
    weightVersions: Number(wv?.count ?? -1),
    weightComponents: Number(wc?.count ?? -1),
    domainTierVersions: Number(dtv?.count ?? -1),
    domainTiers: Number(dt?.count ?? -1),
  };
}

/** Compile dev-revenue once and assert the v1 fixture landed (used as a start state). */
async function seedCompiledDevRevenueV1(): Promise<FulcrumContractCompileResult> {
  return compileResilient({ contract: devRevenueMissionContract, databaseUrl: DATABASE_URL });
}

function demandWeightByVersion(
  rows: Array<{ version: number; weight: number }>
): Map<number, number> {
  return new Map(rows.map((row) => [Number(row.version), Number(row.weight)]));
}

describe.sequential('FUL-PLAT-005 — versioned Fulcrum mission contract (real holocron_nonprod)', () => {
  let sql: Sql | undefined;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    await ensureRedTestEnvironment();
    expect(DATABASE_URL).toContain('/holocron_nonprod');
    sql = createSql(DATABASE_URL);
    // Migrated start (FUL-PLAT-001, migration 0041): the ladder tables must exist.
    for (const table of [
      'weight_versions',
      'weight_components',
      'domain_tier_versions',
      'domain_tiers',
    ]) {
      const rows = await sql`
        SELECT to_regclass(${'public.' + table}) IS NOT NULL AS exists
      `;
      if (rows[0]?.exists !== true) {
        throw new Error(`holocron_nonprod is not migrated: missing table ${table}`);
      }
    }
  }, 120_000);

  beforeEach(async () => {
    if (!PLATFORM_IT || !sql) return;
    await resetFulcrumState(sql);
  }, 60_000);

  afterAll(async () => {
    if (!sql) return;
    try {
      await resetFulcrumState(sql);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  itLive(
    'AC-1: compiling the dev-revenue contract writes one versioned weight and tier set',
    async () => {
      if (!sql) throw new Error('integration sql handle missing');
      // GIVEN: migrated holocron_nonprod holding 0 rows in weight_versions/domain_tier_versions
      const before = await ladderCounts(sql);
      expect(before.weightVersions).toBe(0);
      expect(before.domainTierVersions).toBe(0);

      // WHEN: the operator compiles the dev-revenue Fulcrum contract through the compile entrypoint
      const result = await seedCompiledDevRevenueV1();

      // THEN: version 1 of both ladders is persisted with 4 weight components and 8 domain tiers
      expect(result.ok).toBe(true);
      expect(result.weightVersion).toBe(1);
      expect(result.domainTierVersion).toBe(1);

      const weightVersionRows =
        await sql`SELECT version, disconfirmation_multiplier FROM weight_versions WHERE mission_id = ${DEV_REVENUE_MISSION_ID}`;
      expect(weightVersionRows).toHaveLength(1);
      expect(Number(weightVersionRows[0]?.version)).toBe(1);
      expect(Number(weightVersionRows[0]?.disconfirmation_multiplier)).toBe(2);

      const weightComponentRows = await sql`
      SELECT wc.component, wc.kind, wc.weight, wc.grade_floor, wc.recency_window_days
      FROM weight_components wc
      JOIN weight_versions wv ON wv.id = wc.weight_version_id
      WHERE wv.mission_id = ${DEV_REVENUE_MISSION_ID}
    `;
      expect(weightComponentRows).toHaveLength(4);
      const demand = weightComponentRows.find((row) => row.component === 'demand');
      expect(demand).toBeDefined();
      expect(Number(demand?.weight)).toBe(0.4);

      const domainTierVersionRows =
        await sql`SELECT version FROM domain_tier_versions WHERE mission_id = ${DEV_REVENUE_MISSION_ID}`;
      expect(domainTierVersionRows).toHaveLength(1);
      expect(Number(domainTierVersionRows[0]?.version)).toBe(1);

      const domainTierRows = await sql`
      SELECT dtr.registrable_domain, dtr.tier, dtr.tier_value
      FROM domain_tiers dtr
      JOIN domain_tier_versions dtv ON dtv.id = dtr.domain_tier_version_id
      WHERE dtv.mission_id = ${DEV_REVENUE_MISSION_ID}
    `;
      expect(domainTierRows).toHaveLength(8);
      const secGov = domainTierRows.find((row) => row.registrable_domain === 'sec.gov');
      expect(secGov).toBeDefined();
      expect(Number(secGov?.tier_value)).toBe(1.0);

      // MUST_NOT: empty ladders / NULL weights
      expect(before.weightVersions).not.toBe(0);
      expect(weightVersionRows.length).not.toBe(0);
      expect(domainTierRows.length).not.toBe(0);
      expect(weightComponentRows.some((row) => row.weight === null)).toBe(false);

      const path = captureArtifact('AC-1-seeded-artifact.json', {
        mustObserve: {
          weight_versions: '1 row, version=1, disconfirmation_multiplier=2',
          weight_components: '4 rows incl demand at weight 0.4',
          domain_tier_versions: '1 row, version=1',
          domain_tiers: '8 rows incl sec.gov at tier_value 1.0',
        },
        db_query: {
          weight_versions: weightVersionRows,
          weight_components: weightComponentRows,
          domain_tier_versions: domainTierVersionRows,
          domain_tiers: domainTierRows,
        },
        compile_result: result,
      });
      expect(path.endsWith('AC-1-seeded-artifact.json')).toBe(true);
    },
    120_000
  );

  itLive(
    'AC-2: publishing version 2 leaves version 1 rows untouched',
    async () => {
      if (!sql) throw new Error('integration sql handle missing');
      // GIVEN: dev-revenue already compiled at version 1 with demand at weight 0.4
      const v1 = await seedCompiledDevRevenueV1();
      expect(v1.weightVersion).toBe(1);

      // WHEN: the operator raises demand to 0.6 and recompiles
      const edited = {
        ...devRevenueMissionContract,
        components: devRevenueMissionContract.components.map((component) =>
          component.component === 'demand' ? { ...component, weight: 0.6 } : component
        ),
      };
      const v2 = await compileResilient({ contract: edited, databaseUrl: DATABASE_URL });

      // THEN: version 2 rows are appended and the version 1 rows still read weight 0.4
      expect(v2.weightVersion).toBe(2);

      const versionRows =
        await sql`SELECT version FROM weight_versions WHERE mission_id = ${DEV_REVENUE_MISSION_ID} ORDER BY version`;
      expect(versionRows.map((row) => Number(row.version))).toEqual([1, 2]);

      const demandRows = await sql`
      SELECT wv.version AS version, wc.weight AS weight
      FROM weight_components wc
      JOIN weight_versions wv ON wv.id = wc.weight_version_id
      WHERE wv.mission_id = ${DEV_REVENUE_MISSION_ID} AND wc.component = 'demand'
      ORDER BY wv.version
    `;
      const demandByVersion = demandWeightByVersion(demandRows);
      expect(demandByVersion.get(1)).toBe(0.4);
      expect(demandByVersion.get(2)).toBe(0.6);

      const [active] =
        await sql`SELECT max(version) AS active FROM weight_versions WHERE mission_id = ${DEV_REVENUE_MISSION_ID}`;
      expect(Number(active?.active)).toBe(2);

      // MUST_NOT: history erased / version collision
      expect(demandByVersion.get(1)).not.toBe(0.6);
      const [w04] =
        await sql`SELECT count(*)::text AS count FROM weight_components WHERE weight = 0.4`;
      expect(Number(w04?.count)).toBeGreaterThanOrEqual(1);

      captureArtifact('AC-2-seeded-artifact.json', {
        mustObserve: {
          weight_versions: '2 rows with versions 1 and 2',
          demand_v1_weight: 0.4,
          demand_v2_weight: 0.6,
          active_version: 2,
        },
        db_query: { versions: versionRows, demandRows, active: Number(active?.active) },
      });
    },
    120_000
  );

  itLive(
    'AC-3: an unregistered tool grant fails compilation and writes nothing',
    async () => {
      if (!sql) throw new Error('integration sql handle missing');
      // GIVEN: migrated holocron_nonprod with 0 compiled contract versions
      const before = await ladderCounts(sql);
      expect(before.weightVersions).toBe(0);

      // WHEN: the operator compiles a contract whose toolGrants names exa_search
      const bad = {
        ...devRevenueMissionContract,
        toolGrants: [...devRevenueMissionContract.toolGrants, 'exa_search'],
      };
      let caught: unknown;
      try {
        await compileFulcrumMissionContract({ contract: bad, databaseUrl: DATABASE_URL });
      } catch (error) {
        caught = error;
      }

      // THEN: compilation is refused with FULCRUM_TOOL_GRANT_UNREGISTERED and 0 rows are written
      expect(caught).toBeInstanceOf(FulcrumContractError);
      const error = caught as FulcrumContractError;
      expect(error.code).toBe('FULCRUM_TOOL_GRANT_UNREGISTERED');
      expect(error.message).toContain('exa_search');

      const after = await ladderCounts(sql);
      expect(after.weightVersions).toBe(0);
      expect(after.domainTierVersions).toBe(0);

      // MUST_NOT: a generic error with no code
      expect(error.code).not.toBe('');
      expect(error.name).toBe('FulcrumContractError');

      captureArtifact('AC-3-seeded-artifact.json', {
        mustObserve: {
          thrown_code: 'FULCRUM_TOOL_GRANT_UNREGISTERED',
          message_names_rejected_grant: 'exa_search',
          weight_versions_after_refusal: 0,
          domain_tier_versions_after_refusal: 0,
        },
        api_response: { code: error.code, message: error.message, name: error.name },
        db_query: after,
      });
    },
    120_000
  );

  itLive(
    'AC-4: source governance fields are Zod-validated and round-trip through Postgres',
    async () => {
      if (!sql) throw new Error('integration sql handle missing');
      // ── case 1: a malformed ban-list entry is rejected at a named Zod path ──
      const malformed = {
        ...devRevenueMissionContract,
        sourceRules: {
          ...devRevenueMissionContract.sourceRules,
          banList: [42],
        },
      };
      let malformedCaught: unknown;
      try {
        await compileFulcrumMissionContract({ contract: malformed, databaseUrl: DATABASE_URL });
      } catch (error) {
        malformedCaught = error;
      }
      expect(malformedCaught).toBeInstanceOf(FulcrumContractError);
      const malformedError = malformedCaught as FulcrumContractError;
      expect(malformedError.code).toBe('FULCRUM_CONTRACT_INVALID');
      expect(malformedError.message).toContain('sourceRules.banList.0');
      expect(malformedError.message).toContain('expected string, received number');

      const afterRefusal = await ladderCounts(sql);
      expect(afterRefusal.weightVersions).toBe(0);

      // ── case 2: the valid contract persists 2 banned domains + courtesyDelayMs 1500 ──
      const result = await seedCompiledDevRevenueV1();
      expect(result.ok).toBe(true);

      const snapshotRows = await sql`
      SELECT wc.rubric_json AS snapshot
      FROM weight_components wc
      JOIN weight_versions wv ON wv.id = wc.weight_version_id
      WHERE wv.mission_id = ${DEV_REVENUE_MISSION_ID} AND wc.component = 'demand'
    `;
      const snapshot = snapshotRows[0]?.snapshot as
        | { sourceRules?: { banList?: string[]; courtesyDelayMs?: number } }
        | undefined;
      expect(snapshot).toBeDefined();
      expect(snapshot?.sourceRules?.banList).toEqual(['contentfarm.example', 'seospam.example']);
      expect(snapshot?.sourceRules?.courtesyDelayMs).toBe(1500);

      const afterValid = await ladderCounts(sql);
      expect(afterValid.weightVersions).toBe(1);

      captureArtifact('AC-4-seeded-artifact.json', {
        mustObserve: {
          rejection_path: 'sourceRules.banList.0',
          rejection_expected_received: 'expected string, received number',
          weight_versions_after_refusal: 0,
          persisted_ban_list: ['contentfarm.example', 'seospam.example'],
          persisted_courtesyDelayMs: 1500,
          weight_versions_after_valid_compile: 1,
        },
        api_response: {
          code: malformedError.code,
          message: malformedError.message,
        },
        db_query: { persisted_snapshot: snapshot, counts_after_valid_compile: afterValid },
      });
    },
    120_000
  );

  itLive(
    'AC-5: the fulcrum instantiation compiles with the six corpus tool grants',
    async () => {
      if (!sql) throw new Error('integration sql handle missing');
      // GIVEN: the shared evidence-research template whose toolGrants ships empty
      const shared = parseMissionTemplateDefinition(evidenceResearchTemplateDefinition);
      expect(shared.toolGrants).toEqual([]);
      expect(shared.templateKey).toBe(EVIDENCE_RESEARCH_TEMPLATE_KEY);

      // GIVEN (start fixture): dev-revenue compiled once
      await seedCompiledDevRevenueV1();

      // WHEN/THEN: the fulcrum instantiation is compiled through the mission template
      // compiler and persisted with exactly the six registered corpus tool ids.
      const rows = await sql`
      SELECT template_key, version, definition_json
      FROM mission_template_versions
      WHERE template_key = ${EVIDENCE_RESEARCH_TEMPLATE_KEY}
        AND version = ${FULCRUM_INSTANTIATION_TEMPLATE_VERSION}
    `;
      expect(rows).toHaveLength(1);
      const persisted = rows[0]?.definition_json as
        | { templateKey?: string; toolGrants?: string[] }
        | undefined;
      expect(persisted).toBeDefined();

      // MUST_OBSERVE: exactly the 6 registered corpus tool ids; templateKey stays evidence-research
      expect([...(persisted?.toolGrants ?? [])].sort()).toEqual(
        [...FULCRUM_CORPUS_TOOL_IDS].sort()
      );
      expect(persisted?.templateKey).toBe('evidence-research');

      const [count] = await sql`
      SELECT count(*)::text AS count FROM mission_template_versions WHERE template_key = ${EVIDENCE_RESEARCH_TEMPLATE_KEY}
    `;
      expect(Number(count?.count)).toBeGreaterThanOrEqual(1);

      // MUST_NOT: empty grants / a distinct fulcrum template row / an outbound web tool
      expect(persisted?.toolGrants).not.toEqual([]);
      const [fulcrumKeyRows] = await sql`
      SELECT count(*)::text AS count FROM mission_template_versions WHERE template_key = 'fulcrum'
    `;
      expect(Number(fulcrumKeyRows?.count)).toBe(0);
      const outbound = (persisted?.toolGrants ?? []).filter(
        (grant) => !(FULCRUM_CORPUS_TOOL_IDS as readonly string[]).includes(grant)
      );
      expect(outbound).toEqual([]);

      captureArtifact('AC-5-seeded-artifact.json', {
        mustObserve: {
          toolGrants: [...FULCRUM_CORPUS_TOOL_IDS],
          templateKey: 'evidence-research',
          mission_template_versions_for_key: 'at least 1',
        },
        db_query: {
          template_key: rows[0]?.template_key,
          version: rows[0]?.version,
          definition_json_toolGrants: persisted?.toolGrants,
        },
      });
    },
    120_000
  );
});
