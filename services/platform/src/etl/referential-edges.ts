/**
 * S31-CX-04 — Derive the Convex referential edge set from convex/schema.ts
 * and resolve each edge to a Postgres table.column via the source catalog.
 *
 * Authoritative input: every `v.id('Table')` declaration in the schema.
 * After Convex decommission, the emitted artifact remains the durable proof.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defaultCatalogPath, loadCatalog, type SourceCatalog } from '../catalog/catalog-loader.ts';
import { camelToSnake } from './metadata.ts';

export type ReferentialEdge = {
  /** Convex source table that declares the v.id field. */
  sourceTable: string;
  /** Field name (or nested field name) holding the v.id. */
  sourceField: string;
  /** Convex table named inside v.id('…'). */
  referencedTable: string;
  /** Resolved Postgres column as `table.column`. */
  target: string;
  optional: boolean;
  array: boolean;
};

export type ReferentialEdgesReport = {
  version: 1;
  source: 'convex/schema.ts';
  derivedFromSchema: true;
  edgeCount: number;
  edges: ReferentialEdge[];
  generatedAt: string;
  schemaPath: string;
  catalogPath: string;
};

export type TopologicalLoadOrderResult = {
  order: string[];
  alphabeticalFallbackCount: number;
  violations: number;
};

/** Durable committed artifact path (relative to repo root). */
export const DEFAULT_REFERENTIAL_EDGES_ARTIFACT =
  '.spec/prds/mk6-migration/10-technical-requirements/convex-referential-edges.json';

type SchemaTableBlock = {
  name: string;
  body: string;
  order: number;
};

function resolveRepoRoot(cwd = process.cwd()): string {
  return resolve(cwd);
}

function defaultSchemaPath(repoRoot: string): string {
  return resolve(repoRoot, 'convex/schema.ts');
}

/**
 * Split defineSchema body into defineTable blocks with stable source order.
 */
export function parseSchemaTableBlocks(schemaSource: string): SchemaTableBlock[] {
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*defineTable\s*\(\s*\{/g;
  const matches: Array<{ name: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(schemaSource)) !== null) {
    const name = m[1];
    if (!name) continue;
    matches.push({ name, index: m.index });
  }
  const blocks: SchemaTableBlock[] = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    if (!current) continue;
    const next = matches[i + 1];
    const start = current.index;
    const end = next ? next.index : schemaSource.length;
    blocks.push({
      name: current.name,
      body: schemaSource.slice(start, end),
      order: i,
    });
  }
  return blocks;
}

/**
 * Locate the field identifier associated with a v.id() occurrence.
 * Walks upward for the nearest `fieldName:` line (handles nested objects/arrays).
 */
function fieldNameNear(body: string, idIndex: number): string {
  const before = body.slice(0, idIndex);
  const lines = before.split('\n');
  for (let li = lines.length - 1; li >= 0; li--) {
    const line = lines[li] ?? '';
    const lm = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
    if (lm?.[1]) return lm[1];
  }
  return 'unknown';
}

/**
 * Detect v.optional / v.array wrappers immediately around a v.id() call.
 */
function wrapperFlags(body: string, idIndex: number): { optional: boolean; array: boolean } {
  const windowStart = Math.max(0, idIndex - 80);
  const window = body.slice(windowStart, idIndex + 20);
  return {
    optional:
      /v\.optional\s*\(\s*(?:v\.array\s*\(\s*)?$/.test(
        body.slice(Math.max(0, idIndex - 40), idIndex)
      ) || /v\.optional\s*\(/.test(window),
    array:
      /v\.array\s*\(\s*$/.test(body.slice(Math.max(0, idIndex - 20), idIndex)) ||
      /v\.array\s*\(\s*v\.id/.test(window) ||
      /v\.optional\s*\(\s*v\.array\s*\(\s*$/.test(body.slice(Math.max(0, idIndex - 40), idIndex)),
  };
}

/**
 * Parse every v.id('Table') declaration from convex/schema.ts source text.
 * Pure: same source always yields the same edge list (targets unresolved).
 */
export function parseConvexSchemaIdEdges(
  schemaSource: string
): Array<Omit<ReferentialEdge, 'target'>> {
  const blocks = parseSchemaTableBlocks(schemaSource);
  const edges: Array<Omit<ReferentialEdge, 'target'>> = [];
  const idRe = /v\.id\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const block of blocks) {
    let im: RegExpExecArray | null;
    idRe.lastIndex = 0;
    while ((im = idRe.exec(block.body)) !== null) {
      const referencedTable = im[1];
      if (!referencedTable) continue;
      const flags = wrapperFlags(block.body, im.index);
      edges.push({
        sourceTable: block.name,
        sourceField: fieldNameNear(block.body, im.index),
        referencedTable,
        optional: flags.optional,
        array: flags.array,
      });
    }
  }
  return edges;
}

function localPostgresTable(catalog: SourceCatalog, sourceTable: string): string {
  const entry = catalog.tables[sourceTable];
  if (entry?.target && typeof entry.target === 'string' && entry.target.length > 0) {
    return entry.target;
  }
  return camelToSnake(sourceTable);
}

/**
 * Normalize a catalog field target to canonical `table.column` snake form.
 * Merge-group catalog entries sometimes keep camelCase column segments.
 */
export function normalizePostgresTarget(target: string): string {
  const dot = target.indexOf('.');
  if (dot <= 0) return camelToSnake(target);
  const table = target.slice(0, dot);
  const column = target.slice(dot + 1);
  return `${table}.${camelToSnake(column)}`;
}

/**
 * Resolve one edge to a Postgres `table.column` via the source catalog.
 *
 * Priority:
 * 1. Explicit field target in the catalog (when present and non-null)
 * 2. Nested fields under a known JSONB parent (agentDecision)
 * 3. Storage refs → local `{table}.blob_id` (ETL landing column)
 * 4. Synthesize `{local_table}.{snake_field}`
 */
export function resolveEdgeTarget(
  edge: Omit<ReferentialEdge, 'target'>,
  catalog: SourceCatalog
): string {
  const tableEntry = catalog.tables[edge.sourceTable];
  const fieldEntry = tableEntry?.fields?.[edge.sourceField];
  const localTable = localPostgresTable(catalog, edge.sourceTable);

  if (fieldEntry?.target && typeof fieldEntry.target === 'string') {
    // Storage values land on local blob_id after ETL; catalog target names the blob store.
    if (fieldEntry.target.startsWith('content_addressed_blobs.')) {
      return `${localTable}.blob_id`;
    }
    return normalizePostgresTarget(fieldEntry.target);
  }

  // Nested v.id inside agentDecision (mergeTargetId / similarRequests.id)
  const agentDecision = tableEntry?.fields?.agentDecision;
  if (
    agentDecision?.target &&
    (edge.sourceField === 'mergeTargetId' || edge.sourceField === 'id')
  ) {
    return normalizePostgresTarget(agentDecision.target);
  }

  // storage_refs map (table.field) — drop refs still resolve a local column form
  const storageKey = `${edge.sourceTable}.${edge.sourceField}`;
  const storageRef = catalog.storage_refs[storageKey];
  if (storageRef) {
    if (storageRef.target && typeof storageRef.target === 'string') {
      return `${localTable}.blob_id`;
    }
    return `${localTable}.${camelToSnake(edge.sourceField)}`;
  }

  return `${localTable}.${camelToSnake(edge.sourceField)}`;
}

export function resolveEdgeTargets(
  edges: Array<Omit<ReferentialEdge, 'target'>>,
  catalog: SourceCatalog
): ReferentialEdge[] {
  return edges.map((edge) => {
    const target = resolveEdgeTarget(edge, catalog);
    if (!target?.includes('.')) {
      throw new Error(
        `referential-edges: failed to resolve target for ${edge.sourceTable}.${edge.sourceField}`
      );
    }
    return { ...edge, target };
  });
}

export type ExtractReferentialEdgesOptions = {
  schemaPath?: string;
  catalogPath?: string;
  catalog?: SourceCatalog;
  repoRoot?: string;
  schemaSource?: string;
};

/**
 * Extract + resolve the full referential edge set from the live schema file.
 * Always re-parses schema text — never returns a hard-coded list.
 */
export function extractReferentialEdges(
  options: ExtractReferentialEdgesOptions = {}
): ReferentialEdgesReport {
  const repoRoot = resolveRepoRoot(options.repoRoot ?? process.cwd());
  const schemaPath = resolve(options.schemaPath ?? defaultSchemaPath(repoRoot));
  const catalogPath = resolve(options.catalogPath ?? defaultCatalogPath(repoRoot));
  const schemaSource = options.schemaSource ?? readFileSync(schemaPath, 'utf8');
  const catalog = options.catalog ?? loadCatalog(catalogPath);

  const raw = parseConvexSchemaIdEdges(schemaSource);
  if (raw.length === 0) {
    throw new Error(`referential-edges: zero v.id edges extracted from ${schemaPath}`);
  }
  const edges = resolveEdgeTargets(raw, catalog);

  return {
    version: 1,
    source: 'convex/schema.ts',
    derivedFromSchema: true,
    edgeCount: edges.length,
    edges,
    generatedAt: new Date().toISOString(),
    schemaPath,
    catalogPath,
  };
}

export function writeReferentialEdgesArtifact(
  artifactPath: string,
  report: ReferentialEdgesReport
): string {
  const abs = resolve(artifactPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return abs;
}

/**
 * Load a durable referential-edges artifact with fail-closed integrity checks.
 *
 * Rejects empty stubs, edgeCount mismatches, and non-schema-derived payloads so
 * a planted edges=[] file cannot pass the FK audit gate as ok:true.
 */
export function loadReferentialEdgesArtifact(artifactPath: string): ReferentialEdgesReport {
  const abs = resolve(artifactPath);
  const raw = JSON.parse(readFileSync(abs, 'utf8')) as Partial<ReferentialEdgesReport>;
  if (!raw || !Array.isArray(raw.edges) || typeof raw.edgeCount !== 'number') {
    throw new Error(`referential-edges: invalid artifact at ${artifactPath}`);
  }
  if (raw.derivedFromSchema !== true) {
    throw new Error(
      `referential-edges: artifact integrity failed at ${artifactPath}: derivedFromSchema must be true`
    );
  }
  if (raw.edges.length === 0) {
    throw new Error(
      `referential-edges: artifact integrity failed at ${artifactPath}: empty edges (zero edges)`
    );
  }
  if (raw.edges.length !== raw.edgeCount) {
    throw new Error(
      `referential-edges: artifact integrity failed at ${artifactPath}: edgeCount mismatch ` +
        `(edgeCount=${raw.edgeCount} !== edges.length=${raw.edges.length})`
    );
  }
  for (const edge of raw.edges) {
    if (!edge || typeof edge !== 'object') {
      throw new Error(
        `referential-edges: artifact integrity failed at ${artifactPath}: malformed edge entry`
      );
    }
    if (typeof edge.target !== 'string' || !edge.target.includes('.')) {
      throw new Error(
        `referential-edges: artifact integrity failed at ${artifactPath}: edge missing target ` +
          `(${String(edge.sourceTable)}.${String(edge.sourceField)})`
      );
    }
  }
  return raw as ReferentialEdgesReport;
}

/** Why an edge cannot receive an ordinary Postgres FOREIGN KEY constraint. */
export type EdgeConstraintExclusionReason = 'storage_ref' | 'nested_jsonb' | 'array_ids';

/**
 * Classify whether an edge is eligible for ordinary column-level FK enforcement.
 *
 * Nested JSONB paths, Convex `_storage` refs, and array-of-id columns cannot
 * host a standard REFERENCES constraint; the FK audit excludes them from
 * unenforcedEdges so the gate stays honest without being permanently impossible.
 */
export function classifyEdgeConstraintEligibility(edge: ReferentialEdge): {
  eligible: boolean;
  reason: EdgeConstraintExclusionReason | null;
} {
  if (edge.array) {
    return { eligible: false, reason: 'array_ids' };
  }
  if (
    edge.referencedTable === '_storage' ||
    edge.target.endsWith('.blob_id') ||
    /(?:^|\.)(?:audio_)?storage_id$/.test(edge.target)
  ) {
    return { eligible: false, reason: 'storage_ref' };
  }
  // Nested v.id inside JSONB (e.g. agent_decision.mergeTargetId / similarRequests.id)
  if (edge.target.endsWith('.agent_decision') || edge.sourceField === 'mergeTargetId') {
    return { eligible: false, reason: 'nested_jsonb' };
  }
  return { eligible: true, reason: null };
}

type OrderEdge = Pick<ReferentialEdge, 'sourceTable' | 'referencedTable' | 'optional' | 'array'>;

function createsCycle(
  tables: readonly string[],
  selected: ReadonlyArray<{ from: string; to: string }>,
  candidate: { from: string; to: string }
): boolean {
  const tableSet = new Set(tables);
  const dependents = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const t of tables) {
    dependents.set(t, new Set());
    indegree.set(t, 0);
  }
  for (const e of [...selected, candidate]) {
    if (e.from === e.to || !tableSet.has(e.from) || !tableSet.has(e.to)) continue;
    const set = dependents.get(e.from);
    if (!set || set.has(e.to)) continue;
    set.add(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }
  const ready = tables.filter((t) => (indegree.get(t) ?? 0) === 0);
  const queue = [...ready];
  let seen = 0;
  while (queue.length > 0) {
    const n = queue.shift();
    if (n === undefined) break;
    seen += 1;
    for (const dep of dependents.get(n) ?? []) {
      const next = (indegree.get(dep) ?? 0) - 1;
      indegree.set(dep, next);
      if (next === 0) queue.push(dep);
    }
  }
  return seen < tables.length;
}

/**
 * Topological load order over the full source-table set.
 *
 * Edge direction for load: referenced table must precede the referrer.
 * Required edges are preferred; optional/array reverse edges that would
 * introduce a cycle are dropped from the constraint graph (cycle breakers).
 * Tables with no edges still appear in the provided `tables` list order —
 * never via an alphabetical remainder pass.
 */
export function buildTopologicalLoadOrder(options: {
  edges: ReadonlyArray<OrderEdge | Pick<ReferentialEdge, 'sourceTable' | 'referencedTable'>>;
  tables: readonly string[];
}): TopologicalLoadOrderResult {
  const tables = [...options.tables];
  const tableSet = new Set(tables);
  const indexOf = new Map(tables.map((t, i) => [t, i]));

  const candidates = options.edges
    .map((edge) => {
      const optional = 'optional' in edge ? Boolean(edge.optional) : false;
      const array = 'array' in edge ? Boolean(edge.array) : false;
      return {
        from: edge.referencedTable,
        to: edge.sourceTable,
        optional,
        array,
      };
    })
    .filter((e) => e.from !== e.to && e.from !== '_storage')
    .filter((e) => tableSet.has(e.from) && tableSet.has(e.to))
    // Prefer required non-array constraints when breaking cycles.
    .sort((a, b) => Number(a.optional) - Number(b.optional) || Number(a.array) - Number(b.array));

  const selected: Array<{ from: string; to: string }> = [];
  const selectedKeys = new Set<string>();
  for (const c of candidates) {
    const key = `${c.from}->${c.to}`;
    if (selectedKeys.has(key)) continue;
    if (createsCycle(tables, selected, c)) continue;
    selected.push({ from: c.from, to: c.to });
    selectedKeys.add(key);
  }

  // adjacency: dependency -> dependents (referenced -> referrers)
  const dependents = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const t of tables) {
    dependents.set(t, new Set());
    indegree.set(t, 0);
  }
  for (const e of selected) {
    const set = dependents.get(e.from);
    if (!set || set.has(e.to)) continue;
    set.add(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }

  // Stable ready queue: prefer earlier catalog order (not alphabetical sort).
  const ready: string[] = tables
    .filter((t) => (indegree.get(t) ?? 0) === 0)
    .sort((a, b) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0));

  const order: string[] = [];
  while (ready.length > 0) {
    const n = ready.shift();
    if (n === undefined) break;
    order.push(n);
    for (const dep of dependents.get(n) ?? []) {
      const next = (indegree.get(dep) ?? 0) - 1;
      indegree.set(dep, next);
      if (next === 0) {
        ready.push(dep);
        ready.sort((a, b) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0));
      }
    }
  }

  // Residual (should be empty when cycle breakers work) — catalog order, not alpha.
  let residualPlacementCount = 0;
  if (order.length < tables.length) {
    for (const t of tables) {
      if (!order.includes(t)) {
        order.push(t);
        residualPlacementCount += 1;
      }
    }
  }

  // Violations: constrained edges where referenced does not precede referrer.
  // Cycle-breaker edges intentionally omitted from the constraint set are not
  // counted — they cannot be satisfied simultaneously with the reverse edge.
  const pos = new Map(order.map((t, i) => [t, i]));
  let violations = 0;
  for (const e of selected) {
    if ((pos.get(e.from) ?? 0) > (pos.get(e.to) ?? 0)) {
      violations += 1;
    }
  }

  return {
    order,
    // Residual remainder placements (catalog order). Alphabetical sort is never used.
    // AC-3 requires 0 when the graph is fully ordered by required edges.
    alphabeticalFallbackCount: residualPlacementCount,
    violations,
  };
}

/**
 * Convenience: extract edges and compute load order for the catalog's 60 tables.
 */
export function resolveLoadOrderFromSchema(options: ExtractReferentialEdgesOptions = {}): {
  report: ReferentialEdgesReport;
  loadOrder: TopologicalLoadOrderResult;
} {
  const report = extractReferentialEdges(options);
  const repoRoot = resolveRepoRoot(options.repoRoot ?? process.cwd());
  const catalogPath = resolve(options.catalogPath ?? defaultCatalogPath(repoRoot));
  const catalog = options.catalog ?? loadCatalog(catalogPath);
  const tables = Object.keys(catalog.tables);
  const loadOrder = buildTopologicalLoadOrder({ edges: report.edges, tables });
  return { report, loadOrder };
}
