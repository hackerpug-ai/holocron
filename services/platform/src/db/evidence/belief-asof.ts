/**
 * As-of belief queries + validity-windowed net-support (ledger-3 / T-DATA-005, T-DATA-008).
 *
 * Belief as-of (transaction time):
 *   tx_from <= as_of AND (tx_to IS NULL OR tx_to > as_of)
 * plus optional world-truth validity when present:
 *   (valid_from IS NULL OR valid_from <= as_of)
 *   AND (valid_to IS NULL OR valid_to > as_of)
 *
 * Net-support (validity window only on open edges):
 *   supports = +1, contradicts = -1
 *   valid_from <= as_of AND (valid_to IS NULL OR valid_to > as_of)
 *   AND tx_to IS NULL
 */
import { createSql } from '../client';
import { resolveDatabaseUrl } from '../connection';

export interface BeliefRow {
  id: string;
  claimId: string | null;
  statement: string;
  confidence: number | null;
  supersedesId: string | null;
  validFrom: string | null;
  validTo: string | null;
  txFrom: string | null;
  txTo: string | null;
  actor: string | null;
  runId: string | null;
  idempotencyKey: string | null;
}

export interface BeliefAsOfResult {
  ok: boolean;
  claimId: string;
  asOf: string;
  asOfResolved: string;
  belief: BeliefRow | null;
  /** Convenience mirrors for CLI/JSON consumers (RED suite field names). */
  beliefId: string | null;
  id: string | null;
  statement: string | null;
  confidence: number | null;
  netSupport: number;
  messages: string[];
  errors: string[];
}

/** Normalize CLI as-of tokens (`now` → current timestamptz). */
export function resolveAsOfTimestamp(asOf: string | null | undefined): string {
  if (asOf == null || asOf === '' || asOf.toLowerCase() === 'now') {
    return new Date().toISOString();
  }
  return asOf;
}

/**
 * Return the belief open on the claim's audit chain at transaction-time `asOf`.
 * Does not mutate history; closed predecessors remain queryable via earlier as-of.
 */
export async function getBeliefAsOf(options: {
  claimId: string;
  asOf?: string | null;
  databaseUrl?: string;
  /** When false, skip net-support (default true). */
  includeNetSupport?: boolean;
}): Promise<BeliefAsOfResult> {
  const databaseUrl = options.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  const claimId = options.claimId;
  const asOfInput = options.asOf ?? 'now';
  const asOfResolved = resolveAsOfTimestamp(asOfInput);
  const messages: string[] = [];
  const errors: string[] = [];
  const includeNetSupport = options.includeNetSupport !== false;

  try {
    // Prefer SQL function when present (migration 0005); fall back to inline as-of.
    let belief: BeliefRow | null = null;
    try {
      const fnRows = await sql<
        {
          id: string;
          claim_id: string | null;
          statement: string;
          confidence: number | null;
          supersedes_id: string | null;
          valid_from: string | null;
          valid_to: string | null;
          tx_from: string | null;
          tx_to: string | null;
          actor: string | null;
          run_id: string | null;
          idempotency_key: string | null;
        }[]
      >`
        SELECT
          id::text AS id,
          claim_id,
          statement,
          confidence,
          supersedes_id,
          valid_from::text AS valid_from,
          valid_to::text AS valid_to,
          tx_from::text AS tx_from,
          tx_to::text AS tx_to,
          actor,
          run_id,
          idempotency_key
        FROM belief_as_of(${claimId}, ${asOfResolved}::timestamptz)
      `;
      const r = fnRows[0];
      if (r) {
        belief = mapBeliefRow(r);
        messages.push('belief_as_of(sql-fn)');
      }
    } catch {
      const rows = await sql<
        {
          id: string;
          claim_id: string | null;
          statement: string;
          confidence: number | null;
          supersedes_id: string | null;
          valid_from: string | null;
          valid_to: string | null;
          tx_from: string | null;
          tx_to: string | null;
          actor: string | null;
          run_id: string | null;
          idempotency_key: string | null;
        }[]
      >`
        SELECT
          id::text AS id,
          claim_id,
          statement,
          confidence,
          supersedes_id,
          valid_from::text AS valid_from,
          valid_to::text AS valid_to,
          tx_from::text AS tx_from,
          tx_to::text AS tx_to,
          actor,
          run_id,
          idempotency_key
        FROM beliefs
        WHERE claim_id = ${claimId}
          AND tx_from <= ${asOfResolved}::timestamptz
          AND (tx_to IS NULL OR tx_to > ${asOfResolved}::timestamptz)
          AND (valid_from IS NULL OR valid_from <= ${asOfResolved}::timestamptz)
          AND (valid_to IS NULL OR valid_to > ${asOfResolved}::timestamptz)
        ORDER BY tx_from DESC
        LIMIT 1
      `;
      const r = rows[0];
      if (r) {
        belief = mapBeliefRow(r);
        messages.push('belief_as_of(inline)');
      }
    }

    let netSupport = 0;
    if (includeNetSupport) {
      const net = await computeNetSupport({
        claimId,
        asOf: asOfResolved,
        databaseUrl,
        sql,
      });
      netSupport = net.netSupport;
      messages.push(...net.messages);
      errors.push(...net.errors);
    }

    if (!belief) {
      errors.push(`no belief for claim_id=${claimId} as-of ${asOfResolved}`);
    } else {
      messages.push(`beliefId: ${belief.id}`);
      messages.push(`statement: ${belief.statement}`);
    }
    messages.push(`netSupport: ${netSupport}`);

    return {
      ok: belief !== null,
      claimId,
      asOf: asOfInput,
      asOfResolved,
      belief,
      beliefId: belief?.id ?? null,
      id: belief?.id ?? null,
      statement: belief?.statement ?? null,
      confidence: belief?.confidence ?? null,
      netSupport,
      messages,
      errors,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    return {
      ok: false,
      claimId,
      asOf: asOfInput,
      asOfResolved,
      belief: null,
      beliefId: null,
      id: null,
      statement: null,
      confidence: null,
      netSupport: 0,
      messages,
      errors,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export interface NetSupportResult {
  ok: boolean;
  claimId: string;
  asOf: string;
  netSupport: number;
  messages: string[];
  errors: string[];
}

/**
 * Compute net-support for a claim from validity-windowed supports/contradicts edges.
 * Prefers SQL function belief_net_support(claim_id, as_of) when available.
 */
export async function computeNetSupport(options: {
  claimId: string;
  asOf?: string | null;
  databaseUrl?: string;
  /** Optional shared client (caller owns lifecycle when provided). */
  sql?: ReturnType<typeof createSql>;
}): Promise<NetSupportResult> {
  const ownSql = !options.sql;
  const databaseUrl = options.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const sql = options.sql ?? createSql(databaseUrl);
  const claimId = options.claimId;
  const asOf = resolveAsOfTimestamp(options.asOf);
  const messages: string[] = [];
  const errors: string[] = [];

  try {
    try {
      const rows = await sql<{ net: string }[]>`
        SELECT belief_net_support(${claimId}, ${asOf}::timestamptz)::text AS net
      `;
      const netSupport = Number(rows[0]?.net ?? 0);
      messages.push('belief_net_support(sql-fn)');
      return { ok: true, claimId, asOf, netSupport, messages, errors };
    } catch {
      // Inline fallback: same validity filter as the SQL function.
      const rows = await sql<{ net: string }[]>`
        SELECT COALESCE(SUM(
          CASE r.relation_type
            WHEN 'supports' THEN 1
            WHEN 'contradicts' THEN -1
            ELSE 0
          END
        ), 0)::text AS net
        FROM relations r
        WHERE r.object_id = ${claimId}
          AND r.relation_type IN ('supports', 'contradicts')
          AND r.tx_to IS NULL
          AND r.valid_from IS NOT NULL
          AND r.valid_from <= ${asOf}::timestamptz
          AND (r.valid_to IS NULL OR r.valid_to > ${asOf}::timestamptz)
      `;
      const netSupport = Number(rows[0]?.net ?? 0);
      messages.push('belief_net_support(inline)');
      return { ok: true, claimId, asOf, netSupport, messages, errors };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    return { ok: false, claimId, asOf, netSupport: 0, messages, errors };
  } finally {
    if (ownSql) {
      await sql.end({ timeout: 5 });
    }
  }
}

function mapBeliefRow(r: {
  id: string;
  claim_id: string | null;
  statement: string;
  confidence: number | null;
  supersedes_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
  tx_from: string | null;
  tx_to: string | null;
  actor: string | null;
  run_id: string | null;
  idempotency_key: string | null;
}): BeliefRow {
  return {
    id: r.id,
    claimId: r.claim_id,
    statement: r.statement,
    confidence: r.confidence,
    supersedesId: r.supersedes_id,
    validFrom: r.valid_from,
    validTo: r.valid_to,
    txFrom: r.tx_from,
    txTo: r.tx_to,
    actor: r.actor,
    runId: r.run_id,
    idempotencyKey: r.idempotency_key,
  };
}
