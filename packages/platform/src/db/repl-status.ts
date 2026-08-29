/**
 * holo repl:status — live CAP-SYNC-01 replication / zero_pub gate.
 * Confirms wal_level=logical, zero_pub membership, and REPLICA IDENTITY DEFAULT
 * on every published table with a single-column uuid PK.
 */
import { createSql, type Sql } from './client';
import { resolveDatabaseUrl } from './connection';
import {
  ZERO_PUB_EXCLUDED_COLUMN,
  ZERO_PUB_EXCLUDED_TABLES,
  ZERO_PUB_NAME,
  ZERO_PUB_TABLE_NAMES,
} from './schema/zero-pub';

export interface PublishedTableStatus {
  table: string;
  schema: string;
  replicaIdentity: 'DEFAULT' | 'FULL' | 'NOTHING' | 'INDEX' | 'UNKNOWN';
  pkColumns: string[];
  pkTypes: string[];
  singleColumnUuidPk: boolean;
  publishedColumns: string[] | null;
  ok: boolean;
  issues: string[];
}

export interface ReplStatusResult {
  ok: boolean;
  databaseUrl: string;
  walLevel: string;
  walLevelOk: boolean;
  publicationName: string;
  publicationExists: boolean;
  publishedTables: PublishedTableStatus[];
  missingExpected: string[];
  unexpectedExcluded: string[];
  forbiddenPresent: string[];
  embeddingColumnsPublished: string[];
  errors: string[];
  messages: string[];
}

function mapReplicaIdentity(code: string): PublishedTableStatus['replicaIdentity'] {
  switch (code) {
    case 'd':
      return 'DEFAULT';
    case 'f':
      return 'FULL';
    case 'n':
      return 'NOTHING';
    case 'i':
      return 'INDEX';
    default:
      return 'UNKNOWN';
  }
}

async function queryWalLevel(sql: Sql): Promise<string> {
  const rows = await sql<{ wal_level: string }[]>`SHOW wal_level`;
  return rows[0]?.wal_level ?? '';
}

async function publicationExists(sql: Sql, name: string): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_publication WHERE pubname = ${name}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function listPublicationTables(
  sql: Sql,
  name: string
): Promise<Array<{ schemaname: string; tablename: string }>> {
  const rows = await sql<{ schemaname: string; tablename: string }[]>`
    SELECT schemaname, tablename
    FROM pg_publication_tables
    WHERE pubname = ${name}
    ORDER BY schemaname, tablename
  `;
  return rows;
}

async function listPublicationColumns(
  sql: Sql,
  name: string,
  table: string
): Promise<string[] | null> {
  // pg_publication_tables.attnames is text[] when column-list is used; null/empty means all.
  const rows = await sql<{ attnames: string[] | null }[]>`
    SELECT attnames
    FROM pg_publication_tables
    WHERE pubname = ${name}
      AND schemaname = 'public'
      AND tablename = ${table}
  `;
  const attnames = rows[0]?.attnames;
  if (!attnames || attnames.length === 0) return null;
  return [...attnames];
}

async function tableReplicaAndPk(
  sql: Sql,
  table: string
): Promise<{
  replicaIdentity: PublishedTableStatus['replicaIdentity'];
  pkColumns: string[];
  pkTypes: string[];
}> {
  const riRows = await sql<{ relreplident: string }[]>`
    SELECT c.relreplident
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ${table} AND c.relkind = 'r'
  `;
  const replicaIdentity = mapReplicaIdentity(riRows[0]?.relreplident ?? '');

  const pkRows = await sql<{ column_name: string; data_type: string; udt_name: string }[]>`
    SELECT a.attname AS column_name,
           format_type(a.atttypid, a.atttypmod) AS data_type,
           t.typname AS udt_name
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey) AND a.attnum > 0
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'public'
      AND c.relname = ${table}
      AND i.indisprimary
    ORDER BY a.attnum
  `;

  return {
    replicaIdentity,
    pkColumns: pkRows.map((r) => r.column_name),
    pkTypes: pkRows.map((r) => r.udt_name || r.data_type),
  };
}

export async function getReplStatus(options?: { databaseUrl?: string }): Promise<ReplStatusResult> {
  const databaseUrl = options?.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  const errors: string[] = [];
  const messages: string[] = [];
  const publishedTables: PublishedTableStatus[] = [];
  const embeddingColumnsPublished: string[] = [];

  try {
    const walLevel = await queryWalLevel(sql);
    const walLevelOk = walLevel === 'logical';
    messages.push(`wal_level: ${walLevel || '(empty)'}`);
    if (!walLevelOk) {
      errors.push(`wal_level must be logical (got ${walLevel || 'empty'})`);
    }

    const exists = await publicationExists(sql, ZERO_PUB_NAME);
    messages.push(
      exists ? `publication ${ZERO_PUB_NAME}: present` : `publication ${ZERO_PUB_NAME}: MISSING`
    );
    if (!exists) {
      errors.push(`publication ${ZERO_PUB_NAME} does not exist`);
    }

    const pubTables = exists ? await listPublicationTables(sql, ZERO_PUB_NAME) : [];
    const publishedNames = pubTables.map((t) => t.tablename);
    const publishedSet = new Set(publishedNames);

    const expected = [...ZERO_PUB_TABLE_NAMES];
    const missingExpected = expected.filter((t) => !publishedSet.has(t));
    const unexpectedExcluded = publishedNames.filter(
      (t) => !(ZERO_PUB_TABLE_NAMES as readonly string[]).includes(t)
    );
    const forbiddenPresent = publishedNames.filter((t) =>
      (ZERO_PUB_EXCLUDED_TABLES as readonly string[]).includes(t)
    );

    if (missingExpected.length) {
      errors.push(`zero_pub missing expected tables: ${missingExpected.join(', ')}`);
    }
    if (forbiddenPresent.length) {
      errors.push(`zero_pub includes forbidden tables: ${forbiddenPresent.join(', ')}`);
    }

    for (const row of pubTables) {
      const cols = await listPublicationColumns(sql, ZERO_PUB_NAME, row.tablename);
      if (cols?.includes(ZERO_PUB_EXCLUDED_COLUMN)) {
        embeddingColumnsPublished.push(`${row.tablename}.${ZERO_PUB_EXCLUDED_COLUMN}`);
      }
      // Full-table publish of a relation that has an embedding column is also forbidden.
      if (cols === null) {
        const emb = await sql<{ has_embedding: boolean }[]>`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = ${row.tablename}
              AND column_name = ${ZERO_PUB_EXCLUDED_COLUMN}
          ) AS has_embedding
        `;
        if (emb[0]?.has_embedding) {
          embeddingColumnsPublished.push(`${row.tablename}.${ZERO_PUB_EXCLUDED_COLUMN}`);
        }
      }

      const { replicaIdentity, pkColumns, pkTypes } = await tableReplicaAndPk(sql, row.tablename);
      const singleColumnUuidPk = pkColumns.length === 1 && pkTypes[0] === 'uuid';
      const issues: string[] = [];
      if (replicaIdentity !== 'DEFAULT') {
        issues.push(`REPLICA IDENTITY is ${replicaIdentity}, expected DEFAULT`);
      }
      if (!singleColumnUuidPk) {
        issues.push(
          `PK must be single-column uuid (got cols=[${pkColumns.join(',')}] types=[${pkTypes.join(',')}])`
        );
      }
      const ok = issues.length === 0;
      if (!ok) {
        for (const issue of issues) {
          errors.push(`${row.tablename}: ${issue}`);
        }
      }
      publishedTables.push({
        table: row.tablename,
        schema: row.schemaname,
        replicaIdentity,
        pkColumns,
        pkTypes,
        singleColumnUuidPk,
        publishedColumns: cols,
        ok,
        issues,
      });
    }

    if (embeddingColumnsPublished.length) {
      errors.push(
        `vector/embedding columns must not be published: ${embeddingColumnsPublished.join(', ')}`
      );
    }

    const allReplicaOk = publishedTables.length > 0 && publishedTables.every((t) => t.ok);
    const ok =
      errors.length === 0 &&
      walLevelOk &&
      exists &&
      missingExpected.length === 0 &&
      forbiddenPresent.length === 0 &&
      embeddingColumnsPublished.length === 0 &&
      allReplicaOk &&
      publishedTables.length > 0;

    return {
      ok,
      databaseUrl,
      walLevel,
      walLevelOk,
      publicationName: ZERO_PUB_NAME,
      publicationExists: exists,
      publishedTables,
      missingExpected,
      unexpectedExcluded,
      forbiddenPresent,
      embeddingColumnsPublished,
      errors,
      messages,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function formatReplStatusText(result: ReplStatusResult): string {
  const lines: string[] = [];
  lines.push('holo repl:status — CAP-SYNC-01 zero_pub / logical replication');
  lines.push(`  DATABASE_URL:     ${result.databaseUrl}`);
  lines.push(
    `  wal_level:        ${result.walLevel}${result.walLevelOk ? '' : '  ← FAIL (need logical)'}`
  );
  lines.push(
    `  publication:      ${result.publicationName} (${result.publicationExists ? 'present' : 'MISSING'})`
  );
  lines.push(`  published tables: ${result.publishedTables.length}`);

  if (result.publishedTables.length === 0) {
    lines.push('  (no tables in publication)');
  } else {
    lines.push('  --- zero_pub membership ---');
    for (const t of result.publishedTables) {
      const hasEmbeddingCol = t.publishedColumns?.includes(ZERO_PUB_EXCLUDED_COLUMN) ?? false;
      const colNote =
        t.publishedColumns === null
          ? 'columns: ALL'
          : hasEmbeddingCol
            ? `columns: ${t.publishedColumns.length} (HAS embedding — BAD)`
            : `columns: ${t.publishedColumns.length} (no vector/embedding)`;
      const pkNote = t.singleColumnUuidPk
        ? 'single-column PK: uuid'
        : `PK: [${t.pkColumns.join(',')}] (${t.pkTypes.join(',')})`;
      const mark = t.ok ? 'OK' : 'FAIL';
      lines.push(
        `  \`${t.table}\`  REPLICA IDENTITY: ${t.replicaIdentity}  |  ${pkNote}  |  ${colNote}  [${mark}]`
      );
    }
  }

  if (result.missingExpected.length) {
    lines.push(`  missing expected: ${result.missingExpected.join(', ')}`);
  }
  if (result.forbiddenPresent.length) {
    lines.push(`  FORBIDDEN present: ${result.forbiddenPresent.join(', ')}`);
  }
  if (result.embeddingColumnsPublished.length) {
    lines.push(`  embedding columns published: ${result.embeddingColumnsPublished.join(', ')}`);
  }
  if (result.errors.length) {
    lines.push('  errors:');
    for (const e of result.errors) lines.push(`    - ${e}`);
  } else {
    lines.push('  0 errors');
  }
  lines.push(result.ok ? '  status: OK' : '  status: FAIL');
  return lines.join('\n');
}
