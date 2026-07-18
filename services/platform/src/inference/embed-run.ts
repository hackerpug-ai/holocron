/**
 * Idempotent, resumable re-embed job for passages with NULL embeddings.
 *
 * search-2 / CAP-EMB-01 / UC-DATA-03:
 *   SELECT ... WHERE embedding IS NULL ... FOR UPDATE SKIP LOCKED
 *   → embed(text, 'document') → dimension === 1024 → UPDATE per passage (commit each).
 *
 * NEVER re-embeds non-null rows; NEVER inserts duplicates; NEVER rolls back completed
 * passages on a mid-batch fleet failure (surfaces EmbedRunError instead).
 */

import { createSql, type Sql } from '../db/client.ts';
import { resolveDatabaseUrl } from '../db/connection.ts';
import { type EmbedMode, embed } from './embed.ts';

/** Qwen3 embedding dimension — reject any other length before UPDATE. */
export const EMBED_RUN_EXPECTED_DIM = 1024;

export type EmbedFn = (text: string, mode: EmbedMode) => Promise<number[]>;

export type EmbedRunOptions = {
  /** Override Postgres URL (defaults to resolveDatabaseUrl({ preferHolocron: true })). */
  databaseUrl?: string;
  /**
   * Injectable embed implementation (defaults to search-1 embed()).
   * Tests inject a failing wrapper for mid-batch fleet-error coverage (AC-4).
   */
  embedFn?: EmbedFn;
  /** Expected vector length before UPDATE (default 1024). */
  expectedDimension?: number;
  /** Optional pre-opened sql client (caller owns lifecycle). */
  sql?: Sql;
};

export type EmbedRunResult = {
  /** Passages successfully embedded in this invocation. */
  processed: number;
  /** Passages still carrying NULL embedding after the run. */
  remainingNull: number;
};

export type EmbedVerifyResult = {
  ok: boolean;
  total: number;
  nullEmbeddings: number;
  wrongDimension: number;
  correctDimension: number;
  expectedDimension: number;
};

/**
 * Typed mid-batch failure: prior passages already committed; named passage failed.
 * Callers (CLI / resume) leave remaining NULL rows for the next embedRun.
 */
export class EmbedRunError extends Error {
  readonly code = 'EMBED_RUN_ERROR' as const;
  readonly passageId: string;
  readonly completed: number;
  override readonly cause?: unknown;

  constructor(message: string, opts: { passageId: string; completed: number; cause?: unknown }) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'EmbedRunError';
    this.passageId = opts.passageId;
    this.completed = opts.completed;
    this.cause = opts.cause;
  }
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

function normalizeUnitVector(vector: number[]): number[] {
  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || norm <= 0) {
    throw new Error('embedRun refused zero/invalid norm vector');
  }
  return vector.map((value) => value / norm);
}

/**
 * Fill NULL passage embeddings with document-mode Qwen3 vectors.
 *
 * Selector: WHERE embedding IS NULL ... FOR UPDATE SKIP LOCKED (one row per txn).
 * Commit is per-passage so interruptions resume without re-work or duplicates.
 */
export async function embedRun(options: EmbedRunOptions = {}): Promise<EmbedRunResult> {
  const databaseUrl = options.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const embedFn: EmbedFn = options.embedFn ?? ((text, mode) => embed(text, mode));
  const expectedDim = options.expectedDimension ?? EMBED_RUN_EXPECTED_DIM;
  const ownsSql = !options.sql;
  const sql = options.sql ?? createSql(databaseUrl);

  let processed = 0;

  try {
    // Loop: claim one NULL row under SKIP LOCKED, embed, UPDATE, commit.
    // A single open transaction per passage keeps the lock only for that row.
    for (;;) {
      let claimedId: string | null = null;

      try {
        const didWork = await sql.begin(async (tx) => {
          const rows = await tx<{ id: string; text: string }[]>`
            SELECT id::text AS id, text
            FROM passages
            WHERE embedding IS NULL
            ORDER BY ordinal NULLS LAST, id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          `;

          const row = rows[0];
          if (!row) return false;

          claimedId = row.id;

          let vector: number[];
          try {
            // Document mode only — stored passages must use prefixPolicy.document.
            vector = await embedFn(row.text, 'document');
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new EmbedRunError(`embedRun fleet failure for passage ${row.id}: ${message}`, {
              passageId: row.id,
              completed: processed,
              cause: err,
            });
          }

          if (!Array.isArray(vector) || vector.length !== expectedDim) {
            throw new EmbedRunError(
              `embedRun dimension mismatch for passage ${row.id}: got ${Array.isArray(vector) ? vector.length : 0}, expected ${expectedDim}`,
              { passageId: row.id, completed: processed }
            );
          }

          // Reject all-zero vectors (stub / null embedding) before UPDATE.
          if (vector.every((v) => v === 0)) {
            throw new EmbedRunError(`embedRun refused all-zero vector for passage ${row.id}`, {
              passageId: row.id,
              completed: processed,
            });
          }

          let normalized: number[];
          try {
            normalized = normalizeUnitVector(vector);
          } catch (err) {
            throw new EmbedRunError(`embedRun refused invalid-norm vector for passage ${row.id}`, {
              passageId: row.id,
              completed: processed,
              cause: err,
            });
          }

          const vectorLiteral = toVectorLiteral(normalized);
          await tx`
            UPDATE passages
            SET embedding = ${vectorLiteral}::vector
            WHERE id = ${row.id}::uuid
          `;

          return true;
        });

        if (!didWork) break;
        processed += 1;
      } catch (err) {
        // Per-passage commit: prior iterations already committed. Surface typed error.
        if (err instanceof EmbedRunError) throw err;
        const message = err instanceof Error ? err.message : String(err);
        throw new EmbedRunError(
          `embedRun failed${claimedId ? ` for passage ${claimedId}` : ''}: ${message}`,
          {
            passageId: claimedId ?? 'unknown',
            completed: processed,
            cause: err,
          }
        );
      }
    }

    const remainingRows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM passages WHERE embedding IS NULL
    `;
    const remainingNull = Number(remainingRows[0]?.count ?? 0);

    return { processed, remainingNull };
  } finally {
    if (ownsSql) {
      await sql.end({ timeout: 5 });
    }
  }
}

/**
 * Operator verify: null-embedding count + wrong-dimension count vs expected dim.
 */
export async function embedVerify(options?: {
  databaseUrl?: string;
  expectedDimension?: number;
  sql?: Sql;
}): Promise<EmbedVerifyResult> {
  const databaseUrl = options?.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const expectedDimension = options?.expectedDimension ?? EMBED_RUN_EXPECTED_DIM;
  const ownsSql = !options?.sql;
  const sql = options?.sql ?? createSql(databaseUrl);

  try {
    const rows = await sql<
      {
        total: string;
        nulls: string;
        wrong_dim: string;
        correct_dim: string;
      }[]
    >`
      SELECT
        count(*)::text AS total,
        count(*) FILTER (WHERE embedding IS NULL)::text AS nulls,
        count(*) FILTER (
          WHERE embedding IS NOT NULL AND vector_dims(embedding) <> ${expectedDimension}
        )::text AS wrong_dim,
        count(*) FILTER (
          WHERE embedding IS NOT NULL AND vector_dims(embedding) = ${expectedDimension}
        )::text AS correct_dim
      FROM passages
    `;

    const total = Number(rows[0]?.total ?? 0);
    const nullEmbeddings = Number(rows[0]?.nulls ?? 0);
    const wrongDimension = Number(rows[0]?.wrong_dim ?? 0);
    const correctDimension = Number(rows[0]?.correct_dim ?? 0);

    return {
      ok: nullEmbeddings === 0 && wrongDimension === 0,
      total,
      nullEmbeddings,
      wrongDimension,
      correctDimension,
      expectedDimension,
    };
  } finally {
    if (ownsSql) {
      await sql.end({ timeout: 5 });
    }
  }
}
