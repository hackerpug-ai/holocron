/**
 * Bi-temporal query helpers for the evidence-graph substrate (relations / beliefs).
 */
import { createSql } from '../client';
import { resolveDatabaseUrl } from '../connection';

export interface ValidityWindowQueryResult {
  coveredCount: number;
  uncoveredCount: number;
  allOpenCount: number;
  sample: {
    id: string;
    validFrom: string | null;
    validTo: string | null;
    relationType: string;
  } | null;
}

/**
 * Count open relations for a subject at covered vs uncovered as-of timestamps.
 * Validity filter: valid_from <= as_of AND (valid_to IS NULL OR valid_to > as_of) AND tx_to IS NULL
 */
export async function queryRelationValidityWindows(options: {
  subjectId: string;
  coveredAsOf: string;
  uncoveredAsOf: string;
  databaseUrl?: string;
}): Promise<ValidityWindowQueryResult> {
  const databaseUrl = options.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  try {
    const covered = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM relations
      WHERE subject_id = ${options.subjectId}
        AND valid_from <= ${options.coveredAsOf}::timestamptz
        AND (valid_to IS NULL OR valid_to > ${options.coveredAsOf}::timestamptz)
        AND tx_to IS NULL
    `;
    const uncovered = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM relations
      WHERE subject_id = ${options.subjectId}
        AND valid_from <= ${options.uncoveredAsOf}::timestamptz
        AND (valid_to IS NULL OR valid_to > ${options.uncoveredAsOf}::timestamptz)
        AND tx_to IS NULL
    `;
    const allOpen = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM relations
      WHERE subject_id = ${options.subjectId}
        AND tx_to IS NULL
    `;
    const sampleRows = await sql<
      { id: string; valid_from: string | null; valid_to: string | null; relation_type: string }[]
    >`
      SELECT id::text AS id,
             valid_from::text AS valid_from,
             valid_to::text AS valid_to,
             relation_type
      FROM relations
      WHERE subject_id = ${options.subjectId}
        AND tx_to IS NULL
      ORDER BY created_at
      LIMIT 1
    `;
    const s = sampleRows[0];
    return {
      coveredCount: Number(covered[0]?.count ?? 0),
      uncoveredCount: Number(uncovered[0]?.count ?? 0),
      allOpenCount: Number(allOpen[0]?.count ?? 0),
      sample: s
        ? {
            id: s.id,
            validFrom: s.valid_from,
            validTo: s.valid_to,
            relationType: s.relation_type,
          }
        : null,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export interface OpenBeliefIndexInfo {
  indexExists: boolean;
  indexdef: string | null;
  isPartialOnTxToNull: boolean;
}

export async function getBeliefsOneOpenIndexInfo(options?: {
  databaseUrl?: string;
}): Promise<OpenBeliefIndexInfo> {
  const databaseUrl = options?.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  try {
    const rows = await sql<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE indexname = 'beliefs_one_open_per_claim_uidx'
    `;
    const row = rows[0];
    const indexdef = row?.indexdef ?? null;
    return {
      indexExists: Boolean(row),
      indexdef,
      isPartialOnTxToNull: Boolean(
        indexdef?.includes('WHERE') && indexdef.includes('tx_to IS NULL')
      ),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export interface CanonicalCorpusShape {
  sourcesTableCount: number;
  passagesTableCount: number;
  passagesSourceIdColumn: boolean;
  passagesSourceIdNotNull: boolean;
  /** Soft-ref design uses text source_id; report physical FK count if present. */
  passagesSourceFkCount: number;
}

export async function getCanonicalCorpusShape(options?: {
  databaseUrl?: string;
}): Promise<CanonicalCorpusShape> {
  const databaseUrl = options?.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  try {
    const sources = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'sources' AND table_type = 'BASE TABLE'
    `;
    const passages = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'passages' AND table_type = 'BASE TABLE'
    `;
    const cols = await sql<{ column_name: string; is_nullable: string }[]>`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'passages' AND column_name = 'source_id'
    `;
    const fks = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = 'passages'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'source_id'
    `;
    const col = cols[0];
    return {
      sourcesTableCount: Number(sources[0]?.count ?? 0),
      passagesTableCount: Number(passages[0]?.count ?? 0),
      passagesSourceIdColumn: Boolean(col),
      passagesSourceIdNotNull: col?.is_nullable === 'NO',
      passagesSourceFkCount: Number(fks[0]?.count ?? 0),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
