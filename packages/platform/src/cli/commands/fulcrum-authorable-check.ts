/**
 * holo fulcrum:authorable-check — compile fulcrum (evidence-research alias)
 * against the 5 platform seams it requires. Zero new platform code; proves
 * contract + ledger + gate + role-bindings + publish already exist.
 *
 * Fail-fast: first MISSING seam yields FAIL + Overall INSUFFICIENT (exit 1).
 * Citations are concrete file:line (code) or table:name (schema).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
// Import connection helper directly — avoid db/index barrel (pulls drizzle).
import { resolveDatabaseUrl } from '../../db/connection.ts';

export type SeamName =
  | 'contract-seam'
  | 'ledger-seam'
  | 'gate-seam'
  | 'role-bindings-seam'
  | 'publish-seam';

export type SeamStatus = 'PASS' | 'FAIL';

export type SeamCheckResult = {
  seam: SeamName;
  status: SeamStatus;
  /** Human-readable PASS/FAIL line body (after "seam: PASS — "). */
  detail: string;
  /** Concrete citation, e.g. packages/platform/src/db/schema/mission.ts:14 */
  citation: string | null;
  /** MISSING reason when status is FAIL */
  reason: string | null;
  /** Full stdout line for this seam */
  line: string;
};

export type FulcrumAuthorableCheckResult = {
  ok: boolean;
  verdict: 'SUFFICIENT' | 'INSUFFICIENT';
  seams: SeamCheckResult[];
  lines: string[];
  overallLine: string;
};

const EM = '\u2014'; // em dash used in AC output

const REL = {
  missionSchema: 'packages/platform/src/db/schema/mission.ts',
  evidenceSchema: 'packages/platform/src/db/schema/evidence.ts',
  documentsSchema: 'packages/platform/src/db/schema/documents.ts',
  evidenceGate: 'packages/platform/src/research/evidence-gate.ts',
  evidenceResearchTemplate: 'packages/platform/src/mission/templates/evidence-research.ts',
  documentPublish: 'packages/platform/src/mission/document-publish.ts',
} as const;

const LEDGER_TABLES = ['sources', 'passages', 'claims', 'beliefs'] as const;

export function resolveRepoRoot(fromFileUrl: string = import.meta.url): string {
  // commands → cli → src → platform → services → repo
  const here = dirname(fileURLToPath(fromFileUrl));
  return resolve(here, '../../../../..');
}

function findLineNumber(filePath: string, pattern: RegExp): number | null {
  if (!existsSync(filePath)) return null;
  const lines = readFileSync(filePath, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i] ?? '')) return i + 1;
  }
  return null;
}

function findLineNumbers(filePath: string, patterns: RegExp[]): number[] {
  const found: number[] = [];
  for (const pattern of patterns) {
    const n = findLineNumber(filePath, pattern);
    if (n != null) found.push(n);
  }
  return found;
}

async function listPublicTables(tableNames: readonly string[]): Promise<Set<string>> {
  const url = resolveDatabaseUrl({ preferHolocron: true });
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const rows = await sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = ANY(${tableNames as unknown as string[]})
    `;
    return new Set(rows.map((r) => r.tablename));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function passLine(seam: SeamName, detail: string, citation: string): SeamCheckResult {
  const line = `${seam}: PASS ${EM} ${detail} (${citation})`;
  return {
    seam,
    status: 'PASS',
    detail,
    citation,
    reason: null,
    line,
  };
}

function failMissing(seam: SeamName, reason: string): SeamCheckResult {
  const line = `${seam}: FAIL ${EM} MISSING`;
  return {
    seam,
    status: 'FAIL',
    detail: 'MISSING',
    citation: null,
    reason,
    line,
  };
}

async function checkContractSeam(repoRoot: string): Promise<SeamCheckResult> {
  const schemaPath = resolve(repoRoot, REL.missionSchema);
  const line = findLineNumber(schemaPath, /export const missionTemplates\s*=\s*pgTable/);
  if (!existsSync(schemaPath) || line == null) {
    return failMissing(
      'contract-seam',
      `${REL.missionSchema} does not define missionTemplates table`
    );
  }
  let tables: Set<string>;
  try {
    tables = await listPublicTables(['mission_templates']);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failMissing('contract-seam', `Postgres probe failed: ${msg}`);
  }
  if (!tables.has('mission_templates')) {
    return failMissing('contract-seam', 'table:mission_templates does not exist in Postgres');
  }
  return passLine(
    'contract-seam',
    'mission_templates table exists',
    `${REL.missionSchema}:${line}`
  );
}

async function checkLedgerSeam(repoRoot: string): Promise<SeamCheckResult> {
  const schemaPath = resolve(repoRoot, REL.evidenceSchema);
  if (!existsSync(schemaPath)) {
    return failMissing('ledger-seam', `${REL.evidenceSchema} does not exist`);
  }
  const lines = findLineNumbers(schemaPath, [
    /export const sources\s*=\s*pgTable/,
    /export const passages\s*=\s*pgTable/,
    /export const claims\s*=\s*pgTable/,
    /export const beliefs\s*=\s*pgTable/,
  ]);
  if (lines.length < 4) {
    return failMissing(
      'ledger-seam',
      `${REL.evidenceSchema} missing sources/passages/claims/beliefs pgTable exports`
    );
  }
  let tables: Set<string>;
  try {
    tables = await listPublicTables([...LEDGER_TABLES]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failMissing('ledger-seam', `Postgres probe failed: ${msg}`);
  }
  const missing = LEDGER_TABLES.filter((t) => !tables.has(t));
  if (missing.length > 0) {
    return failMissing(
      'ledger-seam',
      `tables missing in Postgres: ${missing.map((t) => `table:${t}`).join(', ')}`
    );
  }
  const lineRange =
    lines.length === 1 ? String(lines[0]) : `${Math.min(...lines)}-${Math.max(...lines)}`;
  return passLine(
    'ledger-seam',
    'sources, passages, claims, beliefs tables exist',
    `${REL.evidenceSchema}:${lineRange}`
  );
}

function checkGateSeam(repoRoot: string): SeamCheckResult {
  const gatePath = resolve(repoRoot, REL.evidenceGate);
  // Fail-fast surface expected by AC-4 (reason path is research/evidence-gate.ts)
  if (!existsSync(gatePath)) {
    return failMissing('gate-seam', 'research/evidence-gate.ts does not exist');
  }
  const content = readFileSync(gatePath, 'utf8');
  const line = findLineNumber(gatePath, /export function evaluateEvidenceGate\b/);
  if (line == null || !content.includes('export function evaluateEvidenceGate')) {
    return failMissing(
      'gate-seam',
      'research/evidence-gate.ts does not export evaluateEvidenceGate pure-TS function'
    );
  }
  // Reject accidental LLM/model deps in the pure-TS gate
  if (/\bgenerateText\b|\bstreamText\b|@mastra\/core\/agent/.test(content)) {
    return failMissing(
      'gate-seam',
      'research/evidence-gate.ts is not pure-TS (model call surface detected)'
    );
  }
  return passLine('gate-seam', 'pure-TS gate exists', `${REL.evidenceGate}:${line}`);
}

function checkRoleBindingsSeam(repoRoot: string): SeamCheckResult {
  const templatePath = resolve(repoRoot, REL.evidenceResearchTemplate);
  if (!existsSync(templatePath)) {
    return failMissing(
      'role-bindings-seam',
      'mission/templates/evidence-research.ts does not exist'
    );
  }
  const content = readFileSync(templatePath, 'utf8');
  const assayLine = findLineNumber(templatePath, /assay:\s*'divergent'/);
  const challengeLine = findLineNumber(templatePath, /challenge:\s*'convergent'/);
  if (assayLine == null || challengeLine == null) {
    return failMissing(
      'role-bindings-seam',
      'assay=divergent / challenge=convergent role bindings missing in evidence-research template'
    );
  }
  // Ensure fulcrum is listed as an instantiation alias (not a separate template)
  if (!content.includes("'fulcrum'") && !content.includes('"fulcrum"')) {
    return failMissing(
      'role-bindings-seam',
      'fulcrum instantiation alias missing from evidence-research template'
    );
  }
  const lineRange = `${Math.min(assayLine, challengeLine)}-${Math.max(assayLine, challengeLine)}`;
  return passLine(
    'role-bindings-seam',
    'assay=divergent, challenge=convergent',
    `${REL.evidenceResearchTemplate}:${lineRange}`
  );
}

async function checkPublishSeam(repoRoot: string): Promise<SeamCheckResult> {
  const schemaPath = resolve(repoRoot, REL.documentsSchema);
  const publishPath = resolve(repoRoot, REL.documentPublish);
  if (!existsSync(schemaPath)) {
    return failMissing('publish-seam', `${REL.documentsSchema} does not exist`);
  }
  const docLine = findLineNumber(schemaPath, /export const documents\s*=\s*pgTable/);
  if (docLine == null) {
    return failMissing('publish-seam', `${REL.documentsSchema} missing documents pgTable export`);
  }
  if (!existsSync(publishPath)) {
    return failMissing(
      'publish-seam',
      'mission/document-publish.ts does not exist (idempotent publish path)'
    );
  }
  const publishLine = findLineNumber(publishPath, /export async function publishDocumentForRun\b/);
  if (publishLine == null) {
    return failMissing('publish-seam', 'mission/document-publish.ts missing publishDocumentForRun');
  }
  let tables: Set<string>;
  try {
    tables = await listPublicTables(['documents']);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failMissing('publish-seam', `Postgres probe failed: ${msg}`);
  }
  if (!tables.has('documents')) {
    return failMissing('publish-seam', 'table:documents does not exist in Postgres');
  }
  // Citation on documents schema per AC-1; publish path proven via exists check above.
  return passLine('publish-seam', 'documents table exists', `${REL.documentsSchema}:${docLine}`);
}

/**
 * Run all 5 seam checks in order. Fail-fast on first MISSING (INSUFFICIENT).
 */
export async function runFulcrumAuthorableCheck(options?: {
  repoRoot?: string;
}): Promise<FulcrumAuthorableCheckResult> {
  const repoRoot = options?.repoRoot ?? resolveRepoRoot();
  const seams: SeamCheckResult[] = [];

  const checks: Array<() => Promise<SeamCheckResult> | SeamCheckResult> = [
    () => checkContractSeam(repoRoot),
    () => checkLedgerSeam(repoRoot),
    () => checkGateSeam(repoRoot),
    () => checkRoleBindingsSeam(repoRoot),
    () => checkPublishSeam(repoRoot),
  ];

  for (const check of checks) {
    const result = await check();
    seams.push(result);
    if (result.status === 'FAIL') {
      const overallLine = `Overall: INSUFFICIENT`;
      const lines = [
        ...seams.map((s) => s.line),
        ...(result.reason ? [`Reason: ${result.reason}`] : []),
        overallLine,
      ];
      return {
        ok: false,
        verdict: 'INSUFFICIENT',
        seams,
        lines,
        overallLine,
      };
    }
  }

  const overallLine = `Overall: SUFFICIENT ${EM} fulcrum can be authored with zero new platform code`;
  const lines = [...seams.map((s) => s.line), overallLine];
  return {
    ok: true,
    verdict: 'SUFFICIENT',
    seams,
    lines,
    overallLine,
  };
}

export function formatAuthorableCheckText(result: FulcrumAuthorableCheckResult): string {
  return result.lines.join('\n');
}
