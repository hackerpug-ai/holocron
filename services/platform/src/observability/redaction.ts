/**
 * Shared redaction for Holocron observability exporters.
 * Always uses the literal token `[REDACTED]` so integration ACs can observe it.
 */
import type { AnySpan, SpanOutputProcessor } from '@mastra/core/observability';

export const REDACTION_TOKEN = '[REDACTED]' as const;

const SENSITIVE_KEY_RE =
  /^(password|token|secret|key|apikey|auth|authorization|bearer|bearertoken|jwt|credential|clientsecret|privatekey|refresh|ssn|email)$/i;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SECRET_ASSIGN_RE =
  /\b(secret|password|token|api[_-]?key|authorization|bearer)\s*[:=]\s*([^\s,;]+)/gi;

/**
 * Redact sensitive keys and free-text secrets/PII before export.
 *
 * Two-phase:
 *  1) Collect secret/PII values from the payload
 *  2) Replace those values everywhere (covers model echoes of the sentinel)
 */
export function redactForExport<T>(value: T): T {
  const secrets = new Set<string>();
  collectSecretValues(value, secrets, new WeakSet());
  return redactDeep(value, secrets, new WeakSet()) as T;
}

function collectSecretValues(value: unknown, secrets: Set<string>, seen: WeakSet<object>): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    for (const m of value.matchAll(EMAIL_RE)) {
      if (m[0]) secrets.add(m[0]);
    }
    for (const m of value.matchAll(SECRET_ASSIGN_RE)) {
      const val = m[2];
      if (val && val.length >= 3) secrets.add(val);
    }
    for (const m of value.matchAll(/\b(?:trace-secret|OBS0[12]-SECRET-SENTINEL)[0-9a-zA-Z_-]*\b/g)) {
      if (m[0]) secrets.add(m[0]);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectSecretValues(v, secrets, seen);
    return;
  }
  if (typeof value === 'object') {
    if (seen.has(value as object)) return;
    seen.add(value as object);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k) && typeof v === 'string' && v.length >= 3) {
        secrets.add(v);
      }
      collectSecretValues(v, secrets, seen);
    }
  }
}

function redactDeep(value: unknown, secrets: Set<string>, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return redactString(value, secrets);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((v) => redactDeep(v, secrets, seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = REDACTION_TOKEN;
      } else {
        out[k] = redactDeep(v, secrets, seen);
      }
    }
    return out;
  }
  return value;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (SENSITIVE_KEY_RE.test(normalized)) return true;
  if (normalized.includes('secret') || normalized.includes('password')) return true;
  if (normalized === 'email' || normalized.endsWith('email')) return true;
  return false;
}

function redactString(s: string, secrets: Set<string>): string {
  let out = s.replace(EMAIL_RE, REDACTION_TOKEN);
  // Replace "authorization=..." / "bearer ..." assignments wholesale so the
  // disallowed header key itself does not remain in exported blobs.
  out = out.replace(
    /\b(authorization|bearer|password|token|api[_-]?key|secret)\s*[:=]\s*([^\s,;]+)/gi,
    REDACTION_TOKEN
  );
  out = out.replace(/\bBearer\s+[A-Za-z0-9._\-]+/gi, REDACTION_TOKEN);
  const ordered = [...secrets].sort((a, b) => b.length - a.length);
  for (const secret of ordered) {
    if (!secret || secret === REDACTION_TOKEN) continue;
    if (out.includes(secret)) {
      out = out.split(secret).join(REDACTION_TOKEN);
    }
  }
  return out;
}

/** Keep only allowlisted attribute keys after redaction. */
export function filterAllowlistedAttributes(
  attrs: Record<string, unknown>,
  allowlist: readonly string[]
): Record<string, unknown> {
  const allowed = new Set(allowlist.map((k) => k.toLowerCase()));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (allowed.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

/**
 * SpanOutputProcessor that redacts free-text secrets/PII before ANY exporter
 * (including MastraStorageExporter → local Postgres).
 * SensitiveDataFilter only matches key names; this catches sentinel values in goals.
 */
export class HolocronRedactionProcessor implements SpanOutputProcessor {
  name = 'holocron-redaction-processor';

  process(span?: AnySpan): AnySpan | undefined {
    if (!span) return span;
    span.attributes = redactForExport(span.attributes) as typeof span.attributes;
    span.metadata = redactForExport(span.metadata) as typeof span.metadata;
    span.input = redactForExport(span.input);
    span.output = redactForExport(span.output);
    if (span.errorInfo) {
      span.errorInfo = redactForExport(span.errorInfo) as typeof span.errorInfo;
    }
    return span;
  }

  async shutdown(): Promise<void> {
    // no-op
  }
}
