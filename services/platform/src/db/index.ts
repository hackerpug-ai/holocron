/**
 * Platform DB — connection defaults, schema, migrate/probe/verify surfaces.
 *
 * Postgres 18 + pgvector is provisioned (schema-1). Domain tables + migrations
 * are owned by schema-2 (this module).
 */

export { createDb, createSql, withDb } from './client';
export {
  DEFAULT_DATABASE_URL,
  DEFAULT_HOLOCRON_DATABASE_URL,
  postgresConnectionFacts,
  resolveDatabaseUrl,
} from './connection';
export * from './enums';
export {
  COVERING_BTREE_INDEXES,
  FTS_SEARCH_VECTOR_TARGETS,
  HNSW_INDEXES,
} from './indexes';
export { applyMigrations, countPublicTables, MIGRATIONS_DIR } from './migrate';
export { probeJsonbCardData, probeStatusCheck } from './probe';
export { ANALYSIS_TRIO, DOMAIN_TABLE_NAMES, RESEARCH_TRIO, schema } from './schema';
export { verifyIndexes, verifyMerges } from './verify';
