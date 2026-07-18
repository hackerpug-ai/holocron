/**
 * Platform DB — connection defaults, schema, migrate/probe/verify surfaces.
 *
 * Postgres 18 + pgvector is provisioned (schema-1). Domain tables + migrations
 * are owned by schema-2 (this module). schema-3 adds indexes; schema-4 adds
 * zero_pub + repl:status.
 */

export { createDb, createSql, withDb } from './client';
export {
  allowDangerousProdDbOverride,
  assertHolocronNonprodDatabaseUrl,
  DANGEROUS_PROD_DB_OVERRIDE_ENV,
  DEFAULT_DATABASE_URL,
  DEFAULT_HOLOCRON_DATABASE_URL,
  DEFAULT_HOLOCRON_NONPROD_DATABASE_URL,
  databaseNameFromUrl,
  isHolocronNonprodDatabaseUrl,
  isProductionLikeDatabaseUrl,
  postgresConnectionFacts,
  resolveDatabaseUrl,
  resolveHolocronNonprodDatabaseUrl,
  resolveOwnerDatabaseUrl,
} from './connection';
export * from './enums';
export {
  COVERING_BTREE_INDEXES,
  FTS_SEARCH_VECTOR_TARGETS,
  HNSW_INDEXES,
} from './indexes';
export { applyMigrations, countPublicTables, MIGRATIONS_DIR } from './migrate';
export { probeJsonbCardData, probeStatusCheck } from './probe';
export { formatReplStatusText, getReplStatus } from './repl-status';
export {
  ANALYSIS_TRIO,
  DOMAIN_TABLE_NAMES,
  RESEARCH_TRIO,
  schema,
  ZERO_PUB_EXCLUDED_TABLES,
  ZERO_PUB_NAME,
  ZERO_PUB_TABLE_NAMES,
} from './schema';
export { verifyIndexes, verifyMerges } from './verify';
