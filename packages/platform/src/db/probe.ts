/**
 * db:probe — real write/read probes against migrated Postgres.
 * --jsonb cardData: polymorphic jsonb structural equality
 * --status: CHECK rejects in-progress, accepts in_progress
 */
import { createSql } from './client';
import { LifecycleStatusSchema } from './enums';
import { resolveDatabaseUrl } from './index';

/**
 * Structural deep equality (order-independent for object keys).
 * Postgres jsonb may reorder object keys on read-back; stringify equality is insufficient.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).sort();
  const bk = Object.keys(bo).sort();
  if (ak.length !== bk.length) return false;
  if (ak.some((k, i) => k !== bk[i])) return false;
  return ak.every((k) => deepEqual(ao[k], bo[k]));
}

export interface JsonbProbeResult {
  ok: boolean;
  column: string;
  table: string;
  written: unknown;
  read: unknown;
  structuralEquality: boolean;
  pgType: string | null;
  messages: string[];
  errors: string[];
}

export async function probeJsonbCardData(options?: {
  databaseUrl?: string;
}): Promise<JsonbProbeResult> {
  const databaseUrl = options?.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  const messages: string[] = [];
  const errors: string[] = [];
  const payload = {
    kind: 'research_card',
    title: 'Probe Card',
    nested: { a: 1, b: [true, null, 'x'], score: 0.87 },
    meta: { source: 'holo db:probe', ts: '2026-07-14T00:00:00.000Z' },
  };

  try {
    // Confirm column is jsonb
    const typeRows = await sql<{ data_type: string; udt_name: string }[]>`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'chat_messages'
        AND column_name = 'card_data'
    `;
    const pgType = typeRows[0] ? `${typeRows[0].data_type}/${typeRows[0].udt_name}` : null;
    if (!typeRows[0] || typeRows[0].udt_name !== 'jsonb') {
      errors.push(`card_data is not jsonb (got ${pgType ?? 'missing'})`);
      return {
        ok: false,
        column: 'cardData',
        table: 'chat_messages',
        written: payload,
        read: null,
        structuralEquality: false,
        pgType,
        messages,
        errors,
      };
    }
    messages.push(`pg type: ${pgType}`);

    // Insert conversation + message with card_data
    const conv = await sql<{ id: string }[]>`
      INSERT INTO conversations (title, legacy_convex_id)
      VALUES ('probe-jsonb', 'probe_conv_jsonb')
      RETURNING id
    `;
    const conversationId = conv[0]!.id;

    const msg = await sql<{ id: string; card_data: unknown }[]>`
      INSERT INTO chat_messages (conversation_id, role, content, card_data, legacy_convex_id)
      VALUES (${conversationId}, 'assistant', 'probe', ${sql.json(payload as never)}, 'probe_msg_jsonb')
      RETURNING id, card_data
    `;
    let read: unknown = msg[0]!.card_data;
    // postgres.js may return jsonb as object; if string, parse for comparison.
    if (typeof read === 'string') {
      read = JSON.parse(read);
    }
    const structuralEquality = deepEqual(payload, read);
    messages.push(`payload matches: ${structuralEquality}`);
    messages.push(`structural equality: ${structuralEquality}`);

    // Cleanup probe rows
    await sql`DELETE FROM chat_messages WHERE id = ${msg[0]!.id}`;
    await sql`DELETE FROM conversations WHERE id = ${conversationId}`;

    if (!structuralEquality) {
      errors.push('structural inequality between written and read card_data');
    }

    return {
      ok: structuralEquality && errors.length === 0,
      column: 'cardData',
      table: 'chat_messages',
      written: payload,
      read,
      structuralEquality,
      pgType,
      messages,
      errors,
    };
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    errors.push(m);
    return {
      ok: false,
      column: 'cardData',
      table: 'chat_messages',
      written: payload,
      read: null,
      structuralEquality: false,
      pgType: null,
      messages,
      errors,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export interface StatusProbeResult {
  ok: boolean;
  rejectedInvalid: boolean;
  acceptedValid: boolean;
  invalidValue: string;
  validValue: string;
  constraintError: string | null;
  zodValidatesNormalized: boolean;
  messages: string[];
  errors: string[];
}

export async function probeStatusCheck(options?: {
  databaseUrl?: string;
}): Promise<StatusProbeResult> {
  const databaseUrl = options?.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  const messages: string[] = [];
  const errors: string[] = [];
  const invalidValue = 'in-progress';
  const validValue = 'in_progress';
  let rejectedInvalid = false;
  let acceptedValid = false;
  let constraintError: string | null = null;

  try {
    // Zod shared enum: invalid hyphen form fails, normalized form passes
    const zodInvalid = LifecycleStatusSchema.safeParse(invalidValue);
    const zodValid = LifecycleStatusSchema.safeParse(validValue);
    const zodValidatesNormalized = !zodInvalid.success && zodValid.success;
    messages.push(`zod rejects '${invalidValue}': ${!zodInvalid.success}`);
    messages.push(`zod accepts '${validValue}': ${zodValid.success}`);

    // Attempt invalid status on tasks (has work_status CHECK including in_progress only)
    try {
      await sql`
        INSERT INTO tasks (task_type, status, legacy_convex_id)
        VALUES ('probe', ${invalidValue}, 'probe_status_invalid')
      `;
      errors.push(`invalid status '${invalidValue}' was accepted (CHECK missing?)`);
      // cleanup if somehow inserted
      await sql`DELETE FROM tasks WHERE legacy_convex_id = 'probe_status_invalid'`;
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      rejectedInvalid = /check|constraint|violates/i.test(m);
      constraintError = m;
      messages.push(`'${invalidValue}' rejected by CHECK: ${rejectedInvalid}`);
      messages.push(`constraint violation error: ${m.split('\n')[0]}`);
      if (!rejectedInvalid) {
        errors.push(`unexpected error (not constraint): ${m}`);
      }
    }

    // Attempt valid status
    try {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO tasks (task_type, status, legacy_convex_id)
        VALUES ('probe', ${validValue}, 'probe_status_valid')
        RETURNING id
      `;
      acceptedValid = rows.length === 1;
      messages.push(`'${validValue}' accepted: ${acceptedValid}`);
      await sql`DELETE FROM tasks WHERE id = ${rows[0]!.id}`;
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      errors.push(`valid status '${validValue}' rejected: ${m}`);
      messages.push(`'${validValue}' accepted: false`);
    }

    const ok =
      rejectedInvalid &&
      acceptedValid &&
      zodValidatesNormalized &&
      errors.length === 0 &&
      constraintError !== null;

    if (!ok && errors.length === 0) {
      if (!rejectedInvalid) errors.push('in-progress was not rejected by CHECK');
      if (!acceptedValid) errors.push('in_progress was not accepted');
      if (!zodValidatesNormalized) errors.push('Zod enum did not validate normalized status');
    }

    return {
      ok,
      rejectedInvalid,
      acceptedValid,
      invalidValue,
      validValue,
      constraintError,
      zodValidatesNormalized,
      messages,
      errors,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
