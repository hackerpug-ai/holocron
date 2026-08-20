/** Generic source-row → target-row coercion helpers for Sprint 14 ETL. */
import { documentStatusValues, lifecycleStatusValues, workStatusValues } from '../db/enums.ts';
import type { ColumnInfo } from './metadata.ts';

const STATUS_VOCAB: ReadonlySet<string> = new Set<string>([
  ...documentStatusValues,
  ...lifecycleStatusValues,
  ...workStatusValues,
]);

export function normalizeStatus(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');
}

const TABLE_STATUS_VOCAB: Record<string, ReadonlySet<string>> = {
  documents: new Set(documentStatusValues),
  research_sessions: new Set(lifecycleStatusValues),
  research_iterations: new Set(lifecycleStatusValues),
};

const STATUS_SYNONYMS: Record<string, readonly string[]> = {
  processing: ['in_progress', 'running', 'pending'],
  active: ['published', 'ready', 'in_progress', 'pending'],
  complete: ['completed', 'ready', 'published'],
  error: ['failed'],
};

export function coerceStatusForTarget(value: unknown, targetTable?: string): string {
  const normalized = normalizeStatus(value);
  const allowed = (targetTable && TABLE_STATUS_VOCAB[targetTable]) || STATUS_VOCAB;
  if (allowed.has(normalized)) return normalized;
  for (const candidate of STATUS_SYNONYMS[normalized] ?? []) {
    if (allowed.has(candidate)) return candidate;
  }
  if (allowed.has('pending')) return 'pending';
  if (allowed.has('draft')) return 'draft';
  throw new Error(`invalid status value: ${String(value)}`);
}

export function coerceForColumn(
  value: unknown,
  column: ColumnInfo,
  options: { isStatus?: boolean; forbidVectorCopy?: boolean; targetTable?: string } = {}
): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (options.forbidVectorCopy || column.udtName === 'vector') {
    return null;
  }

  if (options.isStatus) {
    return coerceStatusForTarget(value, options.targetTable);
  }

  if (column.udtName === 'jsonb' || column.dataType === 'json') {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          return JSON.parse(trimmed);
        } catch {
          return value;
        }
      }
    }
    return value;
  }

  if (column.dataType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const lowered = String(value).trim().toLowerCase();
    if (['true', '1', 'yes'].includes(lowered)) return true;
    if (['false', '0', 'no'].includes(lowered)) return false;
    return null;
  }

  if (
    column.dataType === 'integer' ||
    column.dataType === 'bigint' ||
    column.udtName === 'int4' ||
    column.udtName === 'int8'
  ) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    if (/^-?\d+$/.test(String(value).trim())) {
      return Number.parseInt(String(value).trim(), 10);
    }
    return null;
  }

  if (
    column.dataType === 'double precision' ||
    column.dataType === 'numeric' ||
    column.udtName === 'float8'
  ) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (/^-?\d+(\.\d+)?$/.test(String(value).trim())) {
      return Number.parseFloat(String(value).trim());
    }
    return null;
  }

  if (
    column.dataType.includes('timestamp') ||
    column.udtName === 'timestamptz' ||
    column.udtName === 'timestamp'
  ) {
    if (value instanceof Date) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
    if (/^-?\d+$/.test(String(value).trim())) {
      return new Date(Number.parseInt(String(value).trim(), 10));
    }
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.valueOf())) return parsed;
    return null;
  }

  if (Array.isArray(value) && column.dataType === 'text') {
    return JSON.stringify(value);
  }

  return value;
}
