/**
 * FUL-PLAT-002 — decide deterministic claim admission (integration, real Postgres).
 *
 * TDD red_first: this file exists BEFORE the gate modules.
 *   RED   = every AC fails its gate-module precondition assertion because
 *           packages/platform/src/fulcrum/gate/{grade,verify-quote,admission}.ts
 *           and src/fulcrum/admission-writer.ts do not exist yet (a clean
 *           assertion failure against the empty start — never an import error).
 *   GREEN = the pure gate modules + the admission writer turn every assertion
 *           below true against the same real database (holocron_nonprod).
 *
 * Contract (REQUIREMENT-CONTRACT v1 in the task spec):
 *   - fixtures: graded_corpus_source | unclassified_corpus_source |
 *               stale_corpus_source | gate_module_tree
 *   - admission grade = round2(tier_value × (1 − age/recency_window_days)) —
 *     the window-linear recency product (AC-1 pins 0.92 for tier 1.0 at 30 days
 *     under the 365-day window)
 *   - gradeEvidence  = round2(tier_value × 0.5^(age/half_life_days)) — the
 *     half-life product from 04-api-design.md § Evidence Gate (AC-4 pins 0.89
 *     for tier 1.0 at 30 days under the 180-day half-life)
 *   - gate modules are pure: no model calls, no model roles, no sql imports
 *   - every decision persists to claims.status / passes_gate /
 *     qualifying_grade / metadata_json (reasons included, rejections too)
 *
 * Fixtures run REAL entrypoints only:
 *   - migration:  `bun packages/platform/src/cli/holo.ts db:migrate --json` subprocess
 *   - evidence:   `bun packages/platform/src/cli/holo.ts evidence:seed --json` subprocess,
 *                 then the owner connection completes the fetch artifact and the
 *                 admission columns (same pattern as FUL-PLAT-001 — the shipped
 *                 seed CLI predates those columns; holo.ts is out of scope here)
 *   - ladder:     INSERT through the holocron_app product role (the same INSERT
 *                 grants a future fulcrum seed CLI will use)
 *
 * Run (per AC):
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     FLEET_URL=http://127.0.0.1:4545/v1 \
 *     pnpm vitest run --project integration \
 *     packages/platform/tests/integration/fulcrum-admission.test.ts -t 'AC-1'
 */

import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client.ts';
import { resolveProductDatabaseUrl } from '../../src/db/evidence/roles.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? '';
const FLEET_URL = process.env.FLEET_URL?.trim() ?? '';
const TIMEOUT = 180_000;

const HERE = import.meta.dirname;
const ROOT = resolve(HERE, '../../..');
const HOLO_TS = resolve(HERE, '../../src/cli/holo.ts');
const FULCRUM_DIR = resolve(HERE, '../../src/fulcrum');
const GATE_DIR = resolve(FULCRUM_DIR, 'gate');
const GRADE_TS = resolve(GATE_DIR, 'grade.ts');
const VERIFY_QUOTE_TS = resolve(GATE_DIR, 'verify-quote.ts');
const ADMISSION_TS = resolve(GATE_DIR, 'admission.ts');
const ADMISSION_WRITER_TS = resolve(FULCRUM_DIR, 'admission-writer.ts');

/** The three pure gate modules scanned by AC-5 (explicit paths, never a glob). */
const GATE_MODULE_FILES = [
  { name: 'grade.ts', path: GRADE_TS },
  { name: 'verify-quote.ts', path: VERIFY_QUOTE_TS },
  { name: 'admission.ts', path: ADMISSION_TS },
] as const;

/** Model-role identifiers the gate must never contain (AC-5 / task NEVER tier). */
const MODEL_ROLE_IDS = ['divergent', 'convergent', 'embed', 'judge'] as const;

const QUOTE_10K = 'Quarterly revenue grew 12% year-over-year according to the 10-K filing.';
const FABRICATED_QUOTE = 'holocron guarantees 70% margin';
const UNCLASSIFIED_SENTENCE =
  'Community adoption doubled across the pilot cohort during the last two quarters.';

const MISSION_ID = 'dev-revenue';
const COMPONENT = 'demand';
const GRADE_FLOOR = 0.5;
const RECENCY_WINDOW_DAYS = 365;
const HALF_LIFE_DAYS = 180;
const DAY_MS = 86_400_000;

/** Fixed evaluation clock — seeding offsets every retrieved_at from this instant. */
const NOW = Date.now();

let owner: Sql; // admin connection (trust auth): artifact completion + claims UPDATE
let app: Sql; // holocron_app product role: fulcrum ladder/version INSERTs
const runId = randomUUID();

let fulcrumVersions: {
  candidateId: string;
  weightVersionId: string;
  domainTierVersionId: string;
} | null = null;

const state = {
  /** Gate modules absent at RED — drives clean assertion failures, not errors. */
  missingModules: [] as string[],
};

type SeededSource = {
  sourceId: string;
  claimId: string;
  normalizedText: string;
  retrievedAtMs: number;
};

/** Run a holo CLI command as a real subprocess; capture code + JSON output. */
async function runHolo(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const r = await promisify(execFile)('bun', [HOLO_TS, ...args], {
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

/**
 * 1200-char normalized_text with the run id + a per-fixture nonce embedded
 * (unique sha256 content_hash per fixture); sentence lands past char 280.
 */
function buildNormalizedText(sentence: string, nonce: string): string {
  const head = `FULCRUM-IT admission fetch artifact run ${runId} fixture ${nonce} — filing extract. `;
  const filler = 'Fulcrum evaluates niche evidence through deterministic evidence gating. ';
  let text = `${head}${filler.repeat(5)}${sentence} `;
  while (text.length < 1200) text += filler;
  return text.slice(0, 1200);
}

/** Delete evidence-graph rows left by previous runs of this test file (owner path). */
async function cleanupPriorAdmissionArtifacts(): Promise<void> {
  const srcs = await owner<{ id: string }[]>`
    SELECT id::text AS id FROM sources WHERE metadata_json->>'fulcrum_it_admission' = 'true'
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

/**
 * Fixture: mission dev-revenue weight_versions v1 with the 'demand' component
 * (grade_floor 0.5, recency_window_days 365, half_life_days 180) and the active
 * domain_tier_versions v1 ladder — sec.gov at tier_value 1.0 — plus one raw
 * candidate the seeded claims bind to. All INSERTed through holocron_app.
 */
async function seedFulcrumVersions(): Promise<NonNullable<typeof fulcrumVersions>> {
  await owner`TRUNCATE candidates, belief_scores, weight_versions, weight_components,
    domain_tier_versions, domain_tiers, touches, probes, claim_evidence_bindings`;

  const wv = await app<{ id: string }[]>`
    INSERT INTO weight_versions (mission_id, version, disconfirmation_multiplier)
    VALUES (${MISSION_ID}, 1, 2)
    RETURNING id::text AS id
  `;
  const weightVersionId = wv[0]?.id;
  expect(weightVersionId, 'weight_versions v1 insert through holocron_app').toBeTruthy();
  if (!weightVersionId) throw new Error('weight_versions v1 insert returned no id');

  await app`
    INSERT INTO weight_components (weight_version_id, component, kind, weight, grade_floor, recency_window_days, half_life_days)
    VALUES (${weightVersionId}, ${COMPONENT}, 'evidence', 0.6, ${GRADE_FLOOR}, ${RECENCY_WINDOW_DAYS}, ${HALF_LIFE_DAYS})
  `;

  const dtv = await app<{ id: string }[]>`
    INSERT INTO domain_tier_versions (mission_id, version)
    VALUES (${MISSION_ID}, 1)
    RETURNING id::text AS id
  `;
  const domainTierVersionId = dtv[0]?.id;
  expect(domainTierVersionId, 'domain_tier_versions v1 insert through holocron_app').toBeTruthy();
  if (!domainTierVersionId) throw new Error('domain_tier_versions v1 insert returned no id');

  const tiers: Array<[string, string, number]> = [
    ['sec.gov', 'primary', 1.0],
    ['federalreserve.gov', 'primary', 0.95],
    ['nature.com', 'primary', 0.9],
    ['reuters.com', 'secondary', 0.8],
  ];
  for (const [domain, tier, value] of tiers) {
    await app`
      INSERT INTO domain_tiers (domain_tier_version_id, registrable_domain, tier, tier_value)
      VALUES (${domainTierVersionId}, ${domain}, ${tier}, ${value})
    `;
  }

  const cand = await app<{ id: string }[]>`
    INSERT INTO candidates (mission_id, stage, title, question)
    VALUES (${MISSION_ID}, 'raw', 'FULCRUM-IT admission candidate', 'Does the gate admit trustworthy evidence?')
    RETURNING id::text AS id
  `;
  const candidateId = cand[0]?.id;
  expect(candidateId, 'candidates raw-stage insert through holocron_app').toBeTruthy();
  if (!candidateId) throw new Error('candidates insert returned no id');

  return { candidateId, weightVersionId, domainTierVersionId };
}

/**
 * Fixture: one sources row written by the REAL `holo evidence:seed` CLI, then
 * completed on the owner connection with the fetch artifact (1200-char
 * normalized_text embedding the sentence, retrieved_at offset by ageDays,
 * source_domain) and a bound provisional claim carrying the sentence as
 * quote_text. Claim binds to the seeded candidate so the mission ladder resolves.
 */
async function seedSourceFixture(input: {
  domain: string;
  ageDays: number;
  sentence: string;
}): Promise<SeededSource> {
  expect(fulcrumVersions, 'fulcrum versions fixture must seed before sources').toBeTruthy();

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
  const normalizedText = buildNormalizedText(input.sentence, randomUUID().slice(0, 8));
  const digest = createHash('sha256').update(normalizedText).digest('hex');
  const retrievedAtMs = NOW - input.ageDays * DAY_MS;

  await owner`
    UPDATE sources SET
      normalized_text = ${normalizedText},
      retrieved_at = ${new Date(retrievedAtMs)},
      source_domain = ${input.domain},
      provenance_group = 'web',
      self_sourced = false,
      content_hash = ${digest},
      metadata_json = coalesce(metadata_json, '{}'::jsonb) || '{"fulcrum_it_admission":"true"}'::jsonb
    WHERE id = ${sourceId}
  `;

  const candidateId = fulcrumVersions?.candidateId;
  if (!candidateId) throw new Error('fulcrum versions fixture missing candidateId');

  await owner`
    UPDATE claims SET
      status = 'provisional',
      passes_gate = false,
      qualifying_grade = NULL,
      quote_text = ${input.sentence},
      component = ${COMPONENT},
      polarity = 'support',
      candidate_id = ${candidateId}
    WHERE id = ${claimId}
  `;

  return { sourceId, claimId, normalizedText, retrievedAtMs };
}

function requireGateModules(scope: string): void {
  expect(
    state.missingModules,
    `${scope}: Fulcrum gate modules must exist on disk before the gate can run (missing: ${state.missingModules.join(', ') || 'none'})`
  ).toEqual([]);
}

/** Load the REAL gate modules from disk via computed paths (RED: precondition fails first). */
async function loadGateModules() {
  requireGateModules('loadGateModules');
  const grade = await import(GRADE_TS);
  const verifyQuote = await import(VERIFY_QUOTE_TS);
  const admission = await import(ADMISSION_TS);
  return { grade, verifyQuote, admission };
}

/** Load the REAL admission writer (the evidence-gate caller's persistence seam). */
async function loadAdmissionWriter() {
  requireGateModules('loadAdmissionWriter');
  return import(ADMISSION_WRITER_TS);
}

function requireSeeded(scope: string, seeded: SeededSource | undefined): SeededSource {
  expect(seeded, `${scope}: seeded source fixture must exist`).toBeTruthy();
  return seeded as SeededSource;
}

beforeAll(async () => {
  if (!PLATFORM_IT) {
    throw new Error('fulcrum-admission requires PLATFORM_IT=1 (no mocks / no skip)');
  }
  if (!DATABASE_URL.includes('holocron_nonprod')) {
    throw new Error(
      `fulcrum-admission requires DATABASE_URL→holocron_nonprod; got ${DATABASE_URL || '(missing)'}`
    );
  }
  if (!FLEET_URL) {
    throw new Error('fulcrum-admission requires FLEET_URL (integration-lane env contract)');
  }

  owner = createSql(DATABASE_URL, { max: 2 });
  app = createSql(resolveProductDatabaseUrl(), { max: 2 });
  const who = await app<{ u: string }[]>`SELECT current_user::text AS u`;
  expect(who[0]?.u, 'product connection binds holocron_app').toBe('holocron_app');

  // REAL entrypoint: migrate through the holo CLI subprocess (idempotent).
  const migrateRun = await runHolo(['db:migrate', '--json']);
  expect(migrateRun.code, `holo db:migrate exit code\n${migrateRun.stderr}`).toBe(0);
  const migrated = JSON.parse(migrateRun.stdout) as { ok: boolean; errors: string[] };
  expect(migrated.ok, `holo db:migrate ok\n${migrated.errors.join('\n')}`).toBe(true);

  await cleanupPriorAdmissionArtifacts();
  fulcrumVersions = await seedFulcrumVersions();

  // RED probe: which gate modules are missing from the empty start state?
  const moduleProbe: Array<[string, string]> = [
    ['gate/grade.ts', GRADE_TS],
    ['gate/verify-quote.ts', VERIFY_QUOTE_TS],
    ['gate/admission.ts', ADMISSION_TS],
    ['admission-writer.ts', ADMISSION_WRITER_TS],
  ];
  state.missingModules = moduleProbe.filter((pair) => !existsSync(pair[1])).map((pair) => pair[0]);
}, TIMEOUT);

afterAll(async () => {
  await app?.end({ timeout: 5 }).catch(() => undefined);
  await owner?.end({ timeout: 5 }).catch(() => undefined);
});

describe('FUL-PLAT-002 AC-1: a quote-verified in-window classified claim is admitted and recorded (PRIMARY)', () => {
  let seeded: SeededSource | undefined;

  beforeAll(async () => {
    seeded = await seedSourceFixture({ domain: 'sec.gov', ageDays: 30, sentence: QUOTE_10K });
  }, TIMEOUT);

  it(
    'AC-1: admits the verbatim-quote claim with grade 0.92 and persists the decision',
    async () => {
      requireGateModules('AC-1');
      const fixture = requireSeeded('AC-1', seeded);

      // Step 1: read the persisted fetch artifact and copy the verbatim sentence.
      const src = await owner<{ normalized_text: string | null }[]>`
      SELECT normalized_text FROM sources WHERE id = ${fixture.sourceId}
    `;
      const normalizedText = src[0]?.normalized_text ?? '';
      expect(normalizedText).toContain(QUOTE_10K);
      const quoteText = QUOTE_10K;

      // Steps 2–3: the evidence-gate caller evaluates + persists through the writer.
      const writer = await loadAdmissionWriter();
      const result = await writer.evaluateAndRecordAdmission(owner, {
        claimId: fixture.claimId,
        policy: { gradeFloor: GRADE_FLOOR, recencyWindowDays: RECENCY_WINDOW_DAYS },
        now: NOW,
      });
      expect(result.decision.status).toBe('admitted');
      expect(result.decision.passesGate).toBe(true);
      expect(result.decision.qualifyingGrade).toBe(0.92);
      expect(result.decision.reasons).toEqual(['admitted_quote_verified']);
      expect(quoteText.length).toBeGreaterThan(0);

      // Step 4: SELECT the stored claim (db_query evidence).
      const stored = await owner<
        {
          status: string;
          passes_gate: boolean | null;
          qualifying_grade: number | null;
          metadata_json: unknown;
        }[]
      >`
      SELECT status, passes_gate, qualifying_grade, metadata_json
      FROM claims WHERE id = ${fixture.claimId}
    `;
      const row = stored[0];
      expect(row, 'stored claims row').toBeTruthy();
      expect(row?.status).toBe('admitted');
      expect(row?.passes_gate).toBe(true);
      expect(row?.qualifying_grade).toBe(0.92);
      const meta = (row?.metadata_json ?? null) as {
        admission?: { reasons?: string[] };
      } | null;
      expect(meta?.admission?.reasons).toEqual(['admitted_quote_verified']);

      console.log(
        'AC-1 db_query:',
        JSON.stringify({
          claimId: fixture.claimId,
          status: row?.status,
          passes_gate: row?.passes_gate,
          qualifying_grade: row?.qualifying_grade,
          reasons: meta?.admission?.reasons,
        })
      );

      // must-not-observe
      expect(row?.status).not.toBe('provisional');
      expect(row?.qualifying_grade).not.toBeNull();
      expect(row?.qualifying_grade).not.toBe(0);
      const admittedCount = await owner<{ count: number }[]>`
      SELECT count(*)::int AS count FROM claims
      WHERE status = 'admitted' AND source_id = ${fixture.sourceId}
    `;
      expect(admittedCount[0]?.count).toBeGreaterThan(0);
    },
    TIMEOUT
  );
});

describe('FUL-PLAT-002 AC-2: each admission failure mode leaves the claim provisional with its own reason', () => {
  let unclassified: SeededSource | undefined;
  let stale: SeededSource | undefined;
  let graded: SeededSource | undefined;

  beforeAll(async () => {
    unclassified = await seedSourceFixture({
      domain: 'randomblog.example',
      ageDays: 30,
      sentence: UNCLASSIFIED_SENTENCE,
    });
    stale = await seedSourceFixture({ domain: 'sec.gov', ageDays: 900, sentence: QUOTE_10K });
    graded = await seedSourceFixture({ domain: 'sec.gov', ageDays: 30, sentence: QUOTE_10K });
  }, TIMEOUT);

  it(
    'AC-2 case 1: unclassified domain stays provisional with reason domain_unclassified and no grade',
    async () => {
      requireGateModules('AC-2');
      const fixture = requireSeeded('AC-2 unclassified', unclassified);
      const writer = await loadAdmissionWriter();

      const result = await writer.evaluateAndRecordAdmission(owner, {
        claimId: fixture.claimId,
        policy: { gradeFloor: GRADE_FLOOR, recencyWindowDays: RECENCY_WINDOW_DAYS },
        now: NOW,
      });
      expect(result.decision.status).toBe('provisional');
      expect(result.decision.qualifyingGrade).toBeNull();
      expect(result.decision.reasons).toEqual(['domain_unclassified']);

      const stored = await owner<
        {
          status: string;
          qualifying_grade: number | null;
          metadata_json: unknown;
        }[]
      >`
      SELECT status, qualifying_grade, metadata_json FROM claims WHERE id = ${fixture.claimId}
    `;
      const row = stored[0];
      const meta = (row?.metadata_json ?? null) as {
        admission?: { reasons?: string[] };
      } | null;
      expect(row?.status).toBe('provisional');
      expect(meta?.admission?.reasons).toEqual(['domain_unclassified']);
      expect(row?.qualifying_grade).toBeNull();
      expect(row?.status).not.toBe('admitted');
      expect(row?.qualifying_grade).not.toBe(0);
      expect((meta?.admission?.reasons ?? []).length).toBeGreaterThan(0);

      console.log(
        'AC-2 case 1 db_query:',
        JSON.stringify({
          claimId: fixture.claimId,
          domain: 'randomblog.example',
          status: row?.status,
          qualifying_grade: row?.qualifying_grade,
          reasons: meta?.admission?.reasons,
        })
      );
    },
    TIMEOUT
  );

  it(
    'AC-2 case 2: 900-day-old evidence stays provisional with reason evidence_out_of_window',
    async () => {
      requireGateModules('AC-2');
      const fixture = requireSeeded('AC-2 stale', stale);
      const writer = await loadAdmissionWriter();

      const result = await writer.evaluateAndRecordAdmission(owner, {
        claimId: fixture.claimId,
        policy: { gradeFloor: GRADE_FLOOR, recencyWindowDays: RECENCY_WINDOW_DAYS },
        now: NOW,
      });
      expect(result.decision.status).toBe('provisional');
      expect(result.decision.reasons).toEqual(['evidence_out_of_window']);

      const stored = await owner<{ status: string; metadata_json: unknown }[]>`
      SELECT status, metadata_json FROM claims WHERE id = ${fixture.claimId}
    `;
      const row = stored[0];
      const meta = (row?.metadata_json ?? null) as {
        admission?: { reasons?: string[] };
      } | null;
      expect(row?.status).toBe('provisional');
      expect(meta?.admission?.reasons).toEqual(['evidence_out_of_window']);
      expect(meta?.admission?.reasons).not.toEqual(['domain_unclassified']);

      // No admission happened for this stale source (source-scoped so the count is
      // deterministic under both the -t 'AC-2' verify and a whole-file run).
      const admittedCount = await owner<{ count: number }[]>`
      SELECT count(*)::int AS count FROM claims
      WHERE status = 'admitted' AND source_id = ${fixture.sourceId}
    `;
      expect(admittedCount[0]?.count).toBe(0);

      console.log(
        'AC-2 case 2 db_query:',
        JSON.stringify({
          claimId: fixture.claimId,
          ageDays: 900,
          status: row?.status,
          reasons: meta?.admission?.reasons,
          admitted_for_source: admittedCount[0]?.count,
        })
      );
    },
    TIMEOUT
  );

  it(
    'AC-2 case 3: grade 0.92 under a 0.98 floor stays provisional with reason grade_below_floor',
    async () => {
      requireGateModules('AC-2');
      const fixture = requireSeeded('AC-2 sub-floor', graded);
      const writer = await loadAdmissionWriter();

      const result = await writer.evaluateAndRecordAdmission(owner, {
        claimId: fixture.claimId,
        policy: { gradeFloor: 0.98, recencyWindowDays: RECENCY_WINDOW_DAYS },
        now: NOW,
      });
      expect(result.decision.status).toBe('provisional');
      expect(result.decision.qualifyingGrade).toBe(0.92);
      expect(result.decision.reasons).toEqual(['grade_below_floor']);

      const stored = await owner<
        {
          status: string;
          qualifying_grade: number | null;
          metadata_json: unknown;
        }[]
      >`
      SELECT status, qualifying_grade, metadata_json FROM claims WHERE id = ${fixture.claimId}
    `;
      const row = stored[0];
      const meta = (row?.metadata_json ?? null) as {
        admission?: { reasons?: string[] };
      } | null;
      expect(row?.status).toBe('provisional');
      expect(meta?.admission?.reasons).toEqual(['grade_below_floor']);
      expect(row?.qualifying_grade).toBe(0.92);
      expect(row?.status).not.toBe('admitted');
      expect(meta?.admission?.reasons).not.toEqual(['evidence_out_of_window']);

      console.log(
        'AC-2 case 3 db_query:',
        JSON.stringify({
          claimId: fixture.claimId,
          status: row?.status,
          qualifying_grade: row?.qualifying_grade,
          floor: 0.98,
          reasons: meta?.admission?.reasons,
        })
      );
    },
    TIMEOUT
  );
});

describe('FUL-PLAT-002 AC-3: a quote absent from normalized_text is rejected with its own reason', () => {
  let fabricated: SeededSource | undefined;
  let snippet: SeededSource | undefined;
  let verbatim: SeededSource | undefined;

  beforeAll(async () => {
    fabricated = await seedSourceFixture({ domain: 'sec.gov', ageDays: 30, sentence: QUOTE_10K });
    snippet = await seedSourceFixture({ domain: 'sec.gov', ageDays: 30, sentence: QUOTE_10K });
    verbatim = await seedSourceFixture({ domain: 'sec.gov', ageDays: 30, sentence: QUOTE_10K });
  }, TIMEOUT);

  it(
    'AC-3 case 1: fabricated quote is stored provisional with reason quote_unverified',
    async () => {
      requireGateModules('AC-3');
      const fixture = requireSeeded('AC-3 fabricated', fabricated);
      const writer = await loadAdmissionWriter();

      // The caller submits the claim carrying the fabricated quote.
      await owner`UPDATE claims SET quote_text = ${FABRICATED_QUOTE} WHERE id = ${fixture.claimId}`;

      const result = await writer.evaluateAndRecordAdmission(owner, {
        claimId: fixture.claimId,
        policy: { gradeFloor: GRADE_FLOOR, recencyWindowDays: RECENCY_WINDOW_DAYS },
        now: NOW,
      });
      expect(result.decision.status).toBe('provisional');
      expect(result.decision.passesGate).toBe(false);
      expect(result.decision.reasons).toEqual(['quote_unverified']);

      const stored = await owner<
        {
          status: string;
          passes_gate: boolean | null;
          metadata_json: unknown;
        }[]
      >`
      SELECT status, passes_gate, metadata_json FROM claims WHERE id = ${fixture.claimId}
    `;
      const row = stored[0];
      const meta = (row?.metadata_json ?? null) as {
        admission?: { reasons?: string[] };
      } | null;
      expect(row?.status).toBe('provisional');
      expect(meta?.admission?.reasons).toEqual(['quote_unverified']);
      expect(row?.passes_gate).toBe(false);
      expect(row?.status).not.toBe('admitted');
      expect(meta?.admission?.reasons).not.toEqual(['grade_below_floor']);

      console.log(
        'AC-3 case 1 db_query:',
        JSON.stringify({
          claimId: fixture.claimId,
          quote: FABRICATED_QUOTE,
          status: row?.status,
          passes_gate: row?.passes_gate,
          reasons: meta?.admission?.reasons,
        })
      );
    },
    TIMEOUT
  );

  it(
    'AC-3 case 2: quote sliced from the 280-char hybrid-search snippet is rejected, not self-cited',
    async () => {
      requireGateModules('AC-3');
      const fixture = requireSeeded('AC-3 snippet', snippet);
      const writer = await loadAdmissionWriter();

      // The caller-side snippet buffer (what mapRrfHitsToEvidenceGateInput would
      // hand the gate) — deliberately NOT byte-identical to the fetch artifact.
      const src = await owner<{ normalized_text: string | null }[]>`
      SELECT normalized_text FROM sources WHERE id = ${fixture.sourceId}
    `;
      const normalizedText = src[0]?.normalized_text ?? '';
      const hybridSnippet = `${normalizedText.slice(0, 200)} ...and analysts say the program guarantees outsized returns for early partners with no verbatim basis in the filing artifact`;
      const rrfQuote = hybridSnippet.slice(0, 280);
      expect(rrfQuote.length).toBe(280);
      // The negative control's teeth: the anti-pattern (checking the caller-supplied
      // snippet) WOULD pass self-citation; the persisted artifact does NOT contain it.
      expect(hybridSnippet.includes(rrfQuote)).toBe(true);
      expect(normalizedText.includes(rrfQuote)).toBe(false);

      await owner`UPDATE claims SET quote_text = ${rrfQuote} WHERE id = ${fixture.claimId}`;

      const result = await writer.evaluateAndRecordAdmission(owner, {
        claimId: fixture.claimId,
        policy: { gradeFloor: GRADE_FLOOR, recencyWindowDays: RECENCY_WINDOW_DAYS },
        now: NOW,
      });
      expect(result.decision.status).toBe('provisional');
      expect(result.decision.passesGate).toBe(false);
      expect(result.decision.reasons).toEqual(['quote_unverified']);

      const stored = await owner<{ status: string; metadata_json: unknown }[]>`
      SELECT status, metadata_json FROM claims WHERE id = ${fixture.claimId}
    `;
      const row = stored[0];
      const meta = (row?.metadata_json ?? null) as {
        admission?: { reasons?: string[] };
      } | null;
      expect(row?.status).toBe('provisional');
      expect(meta?.admission?.reasons).toEqual(['quote_unverified']);

      const passedCount = await owner<{ count: number }[]>`
      SELECT count(*)::int AS count FROM claims
      WHERE passes_gate = true AND source_id = ${fixture.sourceId}
    `;
      expect(passedCount[0]?.count).toBe(0);
      expect(row?.status).not.toBe('admitted');

      console.log(
        'AC-3 case 2 db_query:',
        JSON.stringify({
          claimId: fixture.claimId,
          rrfQuoteChars: rrfQuote.length,
          status: row?.status,
          reasons: meta?.admission?.reasons,
          passes_gate_true_for_source: passedCount[0]?.count,
        })
      );
    },
    TIMEOUT
  );

  it(
    'AC-3 case 3: the verbatim 10-K sentence still admits (control)',
    async () => {
      requireGateModules('AC-3');
      const fixture = requireSeeded('AC-3 verbatim', verbatim);
      const writer = await loadAdmissionWriter();

      await owner`UPDATE claims SET quote_text = ${QUOTE_10K} WHERE id = ${fixture.claimId}`;

      const result = await writer.evaluateAndRecordAdmission(owner, {
        claimId: fixture.claimId,
        policy: { gradeFloor: GRADE_FLOOR, recencyWindowDays: RECENCY_WINDOW_DAYS },
        now: NOW,
      });
      expect(result.decision.status).toBe('admitted');

      const stored = await owner<{ status: string }[]>`
      SELECT status FROM claims WHERE id = ${fixture.claimId}
    `;
      expect(stored[0]?.status).toBe('admitted');

      const passedCount = await owner<{ count: number }[]>`
      SELECT count(*)::int AS count FROM claims
      WHERE passes_gate = true AND source_id = ${fixture.sourceId}
    `;
      expect(passedCount[0]?.count).toBe(1);
      expect(stored[0]?.status).not.toBe('provisional');

      console.log(
        'AC-3 case 3 db_query:',
        JSON.stringify({
          claimId: fixture.claimId,
          status: stored[0]?.status,
          passes_gate_true_for_source: passedCount[0]?.count,
        })
      );
    },
    TIMEOUT
  );
});

describe('FUL-PLAT-002 AC-4: grade is a deterministic tier-by-recency product', () => {
  let seeded: SeededSource | undefined;

  beforeAll(async () => {
    seeded = await seedSourceFixture({ domain: 'sec.gov', ageDays: 30, sentence: QUOTE_10K });
  }, TIMEOUT);

  it(
    'AC-4: gradeEvidence returns the byte-identical string 0.89 across two identical calls',
    async () => {
      requireGateModules('AC-4');
      const fixture = requireSeeded('AC-4 laddered', seeded);

      // Read the tier from the ACTIVE ladder row (the only DB read — the grade itself is pure).
      const tierRows = await owner<{ tier_value: number }[]>`
      SELECT dt.tier_value
      FROM domain_tiers dt
      JOIN domain_tier_versions dtv ON dtv.id::text = dt.domain_tier_version_id
      WHERE dtv.mission_id = ${MISSION_ID} AND dt.registrable_domain = 'sec.gov'
      ORDER BY dtv.version DESC, dtv.created_at DESC
      LIMIT 1
    `;
      const tierValue = tierRows[0]?.tier_value;
      expect(tierValue, 'active ladder maps sec.gov to tier_value 1.0').toBe(1.0);

      const { grade } = await loadGateModules();
      const first = grade.gradeEvidence(tierValue, fixture.retrievedAtMs, HALF_LIFE_DAYS, NOW);
      const second = grade.gradeEvidence(tierValue, fixture.retrievedAtMs, HALF_LIFE_DAYS, NOW);

      expect(String(first)).toBe('0.89');
      expect(String(second)).toBe('0.89');
      expect(first).toBe(second);
      expect(first).not.toBeNull();
      expect(first).not.toBe(0);

      console.log(
        'AC-4 db_query:',
        JSON.stringify({
          tierValue,
          retrievedAtMs: fixture.retrievedAtMs,
          halfLifeDays: HALF_LIFE_DAYS,
          first: String(first),
          second: String(second),
          identical: first === second,
        })
      );
    },
    TIMEOUT
  );

  it(
    'AC-4: unladdered domain has 0 ladder rows and gradeEvidence returns null',
    async () => {
      requireGateModules('AC-4');
      const fixture = requireSeeded('AC-4 unladdered', seeded);

      const ladderRows = await owner<{ registrable_domain: string }[]>`
      SELECT dt.registrable_domain
      FROM domain_tiers dt
      JOIN domain_tier_versions dtv ON dtv.id::text = dt.domain_tier_version_id
      WHERE dtv.mission_id = ${MISSION_ID} AND dt.registrable_domain = 'randomblog.example'
    `;
      expect(ladderRows.length).toBe(0);

      const { grade } = await loadGateModules();
      const unladdered = grade.gradeEvidence(null, fixture.retrievedAtMs, HALF_LIFE_DAYS, NOW);
      expect(unladdered).toBeNull();
      expect(unladdered).not.toBe(0.5);

      console.log(
        'AC-4 unladdered:',
        JSON.stringify({
          domain: 'randomblog.example',
          ladderRows: ladderRows.length,
          grade: unladdered,
        })
      );
    },
    TIMEOUT
  );
});

describe('FUL-PLAT-002 AC-5: gate modules contain no model call and no model role', () => {
  it('AC-5: filesystem scan of the 3 gate modules reports 0 generateText and 0 model-role identifiers', () => {
    // Explicit paths — a missing directory must fail the scan, never pass vacuously.
    const report = GATE_MODULE_FILES.map((file) => {
      expect(existsSync(file.path), `gate module ${file.name} must exist on disk`).toBe(true);
      const text = readFileSync(file.path, 'utf8');
      return {
        name: file.name,
        generateTextCount: text.split('generateText').length - 1,
        roleIdentifierCounts: MODEL_ROLE_IDS.map((id) => ({
          id,
          count: text.split(id).length - 1,
        })),
      };
    });

    const scannedNames = report.map((r) => r.name).sort();
    expect(scannedNames).toEqual(['admission.ts', 'grade.ts', 'verify-quote.ts']);
    expect(report).toHaveLength(3);

    const generateTextTotal = report.reduce((sum, r) => sum + r.generateTextCount, 0);
    const roleTotal = report.reduce(
      (sum, r) => sum + r.roleIdentifierCounts.reduce((a, c) => a + c.count, 0),
      0
    );
    expect(generateTextTotal).toBe(0);
    expect(roleTotal).toBe(0);

    // The judge role identifier never appears anywhere on the Fulcrum path.
    const fulcrumTsFiles: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts')) fulcrumFilesPush(fulcrumTsFiles, full);
      }
    };
    walk(FULCRUM_DIR);
    expect(fulcrumTsFiles.length).toBeGreaterThanOrEqual(4);
    const judgeHits = fulcrumTsFiles.filter((path) => readFileSync(path, 'utf8').includes('judge'));
    expect(judgeHits).toEqual([]);

    console.log(
      'AC-5 scan:',
      JSON.stringify(
        {
          filesScanned: scannedNames,
          fileCount: report.length,
          generateTextTotal,
          roleTotal,
          fulcrumPathFilesScanned: fulcrumTsFiles.length,
          judgeHits: judgeHits.length,
        },
        null,
        2
      )
    );
  });
});

function fulcrumFilesPush(into: string[], path: string): void {
  into.push(path);
}
