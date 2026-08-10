/**
 * REDHAT-FIX-RH-S30-02 — real content routing via resolveObservedDataPlane.
 *
 * D08-02: retired cloud plane is fail-closed. Document content reads use Postgres.
 */
import { createSql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { resolveObservedDataPlane } from './soak-fence.ts';

export type ContentDocument = {
  id: string;
  title: string | null;
  content: string | null;
  category?: string | null;
  status?: string | null;
  date?: string | null;
  _creationTime?: number | null;
};

export type ContentReadResult = {
  ok: boolean;
  status: number;
  data_plane: string | null;
  source: 'convex' | 'postgres' | 'unset';
  document: ContentDocument | null;
  error?: string;
};

/**
 * Read a single document from the observed data plane.
 * Postgres when data_plane is postgres/unset; retired cloud plane fails closed.
 */
export async function readDocumentFromObservedPlane(
  documentId: string,
  options?: { secretsPath?: string; env?: NodeJS.ProcessEnv }
): Promise<ContentReadResult> {
  const observed = resolveObservedDataPlane(options?.env ?? process.env, options?.secretsPath);
  const plane = (observed.data_plane ?? '').toLowerCase();

  if (plane === 'convex') {
    return {
      ok: false,
      status: 410,
      data_plane: observed.data_plane,
      source: 'convex',
      document: null,
      error: 'retired_cloud_plane_removed_d08_02',
    };
  }

  try {
    const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'document get' });
    const sql = createSql(databaseUrl);
    try {
      const rows = await sql<
        {
          id: string;
          title: string | null;
          content: string | null;
          category: string | null;
          status: string | null;
          date: string | null;
        }[]
      >`
        SELECT
          id::text AS id,
          title::text AS title,
          content::text AS content,
          category::text AS category,
          status::text AS status,
          date::text AS date
        FROM documents
        WHERE id = ${documentId}::uuid
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) {
        return {
          ok: false,
          status: 404,
          data_plane: observed.data_plane ?? 'postgres',
          source: 'postgres',
          document: null,
          error: 'document_not_found',
        };
      }
      return {
        ok: true,
        status: 200,
        data_plane: observed.data_plane ?? 'postgres',
        source: 'postgres',
        document: row,
      };
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 500,
      data_plane: observed.data_plane ?? 'postgres',
      source: 'postgres',
      document: null,
      error: `postgres_document_read_failed: ${msg}`,
    };
  }
}

/**
 * Content probe for rollback-drill / gate oracles.
 * Returns one real document from the observed plane with identity-bound fields.
 */
export async function probeContentFromObservedPlane(options?: {
  secretsPath?: string;
  env?: NodeJS.ProcessEnv;
  documentId?: string;
}): Promise<ContentReadResult & { probe: true }> {
  const observed = resolveObservedDataPlane(options?.env ?? process.env, options?.secretsPath);
  const plane = (observed.data_plane ?? '').toLowerCase();

  if (options?.documentId) {
    const r = await readDocumentFromObservedPlane(options.documentId, options);
    return { ...r, probe: true };
  }

  if (plane === 'convex') {
    return {
      ok: false,
      status: 410,
      data_plane: observed.data_plane,
      source: 'convex',
      document: null,
      error: 'retired_cloud_plane_removed_d08_02',
      probe: true,
    };
  }

  try {
    const databaseUrl = resolveHolocronNonprodDatabaseUrl({ context: 'content probe' });
    const sql = createSql(databaseUrl);
    try {
      const rows = await sql<
        {
          id: string;
          title: string | null;
          content: string | null;
          category: string | null;
          status: string | null;
          date: string | null;
        }[]
      >`
        SELECT
          id::text AS id,
          title::text AS title,
          content::text AS content,
          category::text AS category,
          status::text AS status,
          date::text AS date
        FROM documents
        ORDER BY date DESC NULLS LAST
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) {
        return {
          ok: false,
          status: 404,
          data_plane: observed.data_plane ?? 'postgres',
          source: 'postgres',
          document: null,
          error: 'no_postgres_documents',
          probe: true,
        };
      }
      return {
        ok: true,
        status: 200,
        data_plane: observed.data_plane ?? 'postgres',
        source: 'postgres',
        document: row,
        probe: true,
      };
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 500,
      data_plane: observed.data_plane ?? 'postgres',
      source: 'postgres',
      document: null,
      error: `postgres_content_probe_failed: ${msg}`,
      probe: true,
    };
  }
}
