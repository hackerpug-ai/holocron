import { createHash } from 'node:crypto';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }

  return value;
}

export function canonicalJsonValue<T>(value: T): T {
  return canonicalize(value) as T;
}

export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(canonicalJsonValue(value));
}

export function sha256Hex(value: unknown): string {
  return createHash('sha256').update(canonicalJsonString(value)).digest('hex');
}
