/**
 * evidence:seed — insert a claim with two contradicting passages + supports/contradicts relations
 * and exactly one open belief for the claim via seed_open_belief (DEFINER; H1/H2 product path).
 * Used by `holo evidence:seed` and PLATFORM_IT integration tests (ledger-1 / UC-DATA-02 / HT-1→HT-2).
 */
import { createSql, type Sql } from '../client';
import { resolveProductDatabaseUrl } from './roles';

export interface EvidenceSeedResult {
  ok: boolean;
  sourceId: string | null;
  passageIds: string[];
  claimId: string | null;
  /** Open belief created for claimId via seed_open_belief (product path; HT-1→HT-2). */
  beliefId: string | null;
  relationIds: string[];
  /** Session role observed on the product connection (must be holocron_app). */
  sessionRole: string | null;
  counts: {
    sources: number;
    passages: number;
    claims: number;
    relations: number;
    openRelations: number;
  };
  messages: string[];
  errors: string[];
}

const SUPPORTS_TEXT =
  'Ledger seed SUPPORTS: The quarterly revenue grew 12% year-over-year according to the 10-K filing.';
const CONTRADICTS_TEXT =
  'Ledger seed CONTRADICTS: The quarterly revenue declined 3% year-over-year according to the earnings call.';
const CLAIM_TEXT = 'Quarterly revenue grew year-over-year.';
/** Product actor for the seed open belief — never gate-setup. */
const BELIEF_ACTOR = 'evidence:seed';
/** Claim confidence mirrored onto the seed open belief. */
const SEED_CONFIDENCE = 0.55;

async function countTable(
  sql: Sql,
  table: 'sources' | 'passages' | 'claims' | 'relations'
): Promise<number> {
  // table names are closed union — never interpolate untrusted input
  const rows =
    table === 'sources'
      ? await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM sources`
      : table === 'passages'
        ? await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM passages`
        : table === 'claims'
          ? await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM claims`
          : await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM relations`;
  return Number(rows[0]?.count ?? 0);
}

/**
 * Insert 1 source, 2 contradictory passages, 1 claim, 2 relations (supports + contradicts)
 * with bi-temporal validity windows on the relation edges, plus exactly one open belief
 * for the claim via SECURITY DEFINER seed_open_belief (authorized under holocron_app).
 */
export async function seedEvidence(options?: {
  databaseUrl?: string;
}): Promise<EvidenceSeedResult> {
  // Product path: bind to holocron_app unless caller supplies an explicit URL override.
  const databaseUrl = options?.databaseUrl ?? resolveProductDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  const messages: string[] = [];
  const errors: string[] = [];

  let sourceId: string | null = null;
  let claimId: string | null = null;
  let beliefId: string | null = null;
  let sessionRole: string | null = null;
  const passageIds: string[] = [];
  const relationIds: string[] = [];

  try {
    const who = await sql<{ current_user: string }[]>`SELECT current_user::text`;
    sessionRole = who[0]?.current_user ?? null;
    messages.push(`current_user: ${sessionRole ?? ''}`);

    const contentHash = `ledger-1-evidence-seed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const sourceRows = await sql<{ id: string }[]>`
      INSERT INTO sources (source_kind, content_hash, title, url, metadata_json)
      VALUES (
        'document',
        ${contentHash},
        'Ledger-1 bi-temporal seed corpus',
        'https://holocron.local/seed/ledger-1',
        ${sql.json({ purpose: 'evidence:seed', task: 'ledger-1' })}
      )
      RETURNING id::text AS id
    `;
    sourceId = sourceRows[0]?.id ?? null;
    if (!sourceId) {
      errors.push('failed to insert source');
      return emptyFail(errors, messages, sessionRole);
    }
    messages.push(`source inserted: ${sourceId}`);

    const supportPassage = await sql<{ id: string }[]>`
      INSERT INTO passages (source_id, ordinal, text, situating_header, metadata_json)
      VALUES (
        ${sourceId},
        0,
        ${SUPPORTS_TEXT},
        'Supporting passage',
        ${sql.json({ stance: 'supports', task: 'ledger-1' })}
      )
      RETURNING id::text AS id
    `;
    const contradictPassage = await sql<{ id: string }[]>`
      INSERT INTO passages (source_id, ordinal, text, situating_header, metadata_json)
      VALUES (
        ${sourceId},
        1,
        ${CONTRADICTS_TEXT},
        'Contradicting passage',
        ${sql.json({ stance: 'contradicts', task: 'ledger-1' })}
      )
      RETURNING id::text AS id
    `;
    const pSupport = supportPassage[0]?.id;
    const pContradict = contradictPassage[0]?.id;
    if (!pSupport || !pContradict) {
      errors.push('failed to insert passages');
      return emptyFail(errors, messages, sessionRole);
    }
    passageIds.push(pSupport, pContradict);
    messages.push(`passages inserted: ${pSupport}, ${pContradict}`);

    const claimRows = await sql<{ id: string }[]>`
      INSERT INTO claims (source_id, passage_id, claim_text, claim_category, confidence, metadata_json)
      VALUES (
        ${sourceId},
        ${pSupport},
        ${CLAIM_TEXT},
        'financial',
        ${SEED_CONFIDENCE},
        ${sql.json({ task: 'ledger-1', linkedPassages: [pSupport, pContradict] })}
      )
      RETURNING id::text AS id
    `;
    claimId = claimRows[0]?.id ?? null;
    if (!claimId) {
      errors.push('failed to insert claim');
      return emptyFail(errors, messages, sessionRole);
    }
    messages.push(`claim inserted: ${claimId}`);

    // supports edge: passage → claim, validity window covers 2024-H1
    const supportsRel = await sql<{ id: string }[]>`
      INSERT INTO relations (
        relation_type, subject_id, subject_kind, object_id, object_kind,
        valid_from, valid_to, tx_from, tx_to, confidence, metadata_json
      )
      VALUES (
        'supports',
        ${pSupport},
        'passage',
        ${claimId},
        'claim',
        '2024-01-01T00:00:00Z'::timestamptz,
        '2024-06-01T00:00:00Z'::timestamptz,
        now(),
        NULL,
        0.8,
        ${sql.json({ task: 'ledger-1', stance: 'supports' })}
      )
      RETURNING id::text AS id
    `;
    // contradicts edge: passage → claim, open validity (still current knowledge)
    const contradictsRel = await sql<{ id: string }[]>`
      INSERT INTO relations (
        relation_type, subject_id, subject_kind, object_id, object_kind,
        valid_from, valid_to, tx_from, tx_to, confidence, metadata_json
      )
      VALUES (
        'contradicts',
        ${pContradict},
        'passage',
        ${claimId},
        'claim',
        '2024-01-01T00:00:00Z'::timestamptz,
        NULL,
        now(),
        NULL,
        0.75,
        ${sql.json({ task: 'ledger-1', stance: 'contradicts' })}
      )
      RETURNING id::text AS id
    `;
    const rSupport = supportsRel[0]?.id;
    const rContradict = contradictsRel[0]?.id;
    if (!rSupport || !rContradict) {
      errors.push('failed to insert relations');
      return emptyFail(errors, messages, sessionRole);
    }
    relationIds.push(rSupport, rContradict);
    messages.push(`relations inserted: supports=${rSupport}, contradicts=${rContradict}`);

    // HT-1→HT-2: open belief for claim via DEFINER seed_open_belief (not raw INSERT; not gate-setup).
    // holocron_app has EXECUTE on seed_open_belief and no INSERT on beliefs after 0006.
    const beliefRows = await sql<{ id: string }[]>`
      SELECT seed_open_belief(
        ${claimId},
        ${CLAIM_TEXT},
        ${SEED_CONFIDENCE},
        ${BELIEF_ACTOR},
        ${null},
        ${null}::timestamptz,
        ${null}::timestamptz
      )::text AS id
    `;
    beliefId = beliefRows[0]?.id ?? null;
    if (!beliefId) {
      errors.push('failed to seed open belief via seed_open_belief');
      return {
        ok: false,
        sourceId,
        passageIds,
        claimId,
        beliefId: null,
        relationIds,
        sessionRole,
        counts: { sources: 0, passages: 0, claims: 0, relations: 0, openRelations: 0 },
        messages,
        errors,
      };
    }
    messages.push(`belief inserted (open): ${beliefId} actor=${BELIEF_ACTOR}`);

    const sources = await countTable(sql, 'sources');
    const passages = await countTable(sql, 'passages');
    const claims = await countTable(sql, 'claims');
    const relations = await countTable(sql, 'relations');
    const openRelRows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM relations
      WHERE relation_type IN ('supports', 'contradicts')
        AND tx_from IS NOT NULL
        AND tx_to IS NULL
    `;
    const openRelations = Number(openRelRows[0]?.count ?? 0);

    messages.push(
      `counts: sources=${sources} passages=${passages} claims=${claims} relations=${relations} open_sc_relations=${openRelations}`
    );

    const ok =
      errors.length === 0 &&
      sourceId !== null &&
      claimId !== null &&
      beliefId !== null &&
      passageIds.length === 2 &&
      relationIds.length === 2 &&
      openRelations >= 2;

    if (!ok && errors.length === 0) {
      errors.push('seed completed but row/relation counts did not meet must_observe thresholds');
    }

    return {
      ok,
      sourceId,
      passageIds,
      claimId,
      beliefId,
      relationIds,
      sessionRole,
      counts: { sources, passages, claims, relations, openRelations },
      messages,
      errors,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    return {
      ok: false,
      sourceId,
      passageIds,
      claimId,
      beliefId,
      relationIds,
      sessionRole,
      counts: { sources: 0, passages: 0, claims: 0, relations: 0, openRelations: 0 },
      messages,
      errors,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function emptyFail(
  errors: string[],
  messages: string[],
  sessionRole: string | null = null
): EvidenceSeedResult {
  return {
    ok: false,
    sourceId: null,
    passageIds: [],
    claimId: null,
    beliefId: null,
    relationIds: [],
    sessionRole,
    counts: { sources: 0, passages: 0, claims: 0, relations: 0, openRelations: 0 },
    messages,
    errors,
  };
}

export const SEED_SUPPORTS_TEXT = SUPPORTS_TEXT;
export const SEED_CONTRADICTS_TEXT = CONTRADICTS_TEXT;
export const SEED_CLAIM_TEXT = CLAIM_TEXT;
export const SEED_BELIEF_ACTOR = BELIEF_ACTOR;
