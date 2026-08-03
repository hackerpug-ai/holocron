#!/usr/bin/env bun
/** Live Zero authorization oracle for Sprint 29 file_objects reads/writes. */
import { randomUUID } from 'node:crypto';
import { Zero } from '@rocicorp/zero';
import postgres from 'postgres';
import { schema } from '../../app/zero/schema.ts';

const databaseUrl = process.env.DATABASE_URL ?? '';
const server = process.env.ZERO_CACHE_URL ?? 'http://127.0.0.1:4848';
if (!databaseUrl.includes('holocron_nonprod')) {
  console.log(JSON.stringify({ ok: false, error: 'DATABASE_URL must target holocron_nonprod' }));
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });
const seedId = randomUUID();
const deniedInsertId = randomUUID();
const controlId = randomUUID();
const runTag = randomUUID();
const seedHash = `s29-zero-permission-seed-${runTag}`;
const deniedHash = `s29-zero-permission-denied-${runTag}`;
const originalName = `s29-zero-original-${runTag}.bin`;
const deniedName = `s29-zero-denied-${runTag}.bin`;
const controlKey = `s29-zero-permission-control-${runTag}`;

async function waitFor<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  message: string,
  timeoutMs = 30_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await read();
    if (accept(last)) return last;
    await Bun.sleep(250);
  }
  throw new Error(`${message}; last=${JSON.stringify(last)}`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let zero: Zero<typeof schema> | undefined;
try {
  await sql`
    INSERT INTO file_objects (
      id, content_hash, mime_type, byte_size, storage_path, original_name, metadata_json
    ) VALUES (
      ${seedId}::uuid,
      ${seedHash},
      'application/octet-stream',
      1,
      ${`s29-zero/${runTag}/seed.bin`},
      ${originalName},
      ${sql.json({ oracle: 's29-zero-file-objects-permissions' })}
    )
  `;

  zero = new Zero({ server, schema, userID: `s29-zero-permissions-${runTag}` });
  const seeded = await withTimeout(
    zero.query.file_objects.where('id', seedId).run({ type: 'complete' }),
    30_000,
    'live zero-cache did not complete the file_objects read'
  );
  if (
    seeded.length !== 1 ||
    seeded[0]?.content_hash !== seedHash ||
    seeded[0]?.original_name !== originalName
  ) {
    throw new Error(`file_objects read oracle mismatch: ${JSON.stringify(seeded)}`);
  }

  // Positive transport control: unchanged Postgres rows count as denials only
  // after this same client proves that an allowed Zero mutation reaches SQL.
  const now = Date.now();
  await zero.mutate.app_settings.insert({
    id: controlId,
    key: controlKey,
    value_json: { oracle: 'allowed-control' },
    created_at: now,
    updated_at: now,
  });
  await waitFor(
    async () => {
      const rows = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM app_settings WHERE id = ${controlId}::uuid
      `;
      return Number(rows[0]?.count ?? 0);
    },
    (count) => count === 1,
    'allowed app_settings control mutation never reached Postgres'
  );

  await zero.mutate.file_objects.insert({
    id: deniedInsertId,
    content_hash: deniedHash,
    mime_type: 'application/octet-stream',
    byte_size: 1,
    storage_path: `s29-zero/${runTag}/denied.bin`,
    original_name: deniedName,
    metadata_json: { oracle: 'denied-insert' },
    created_at: Date.now(),
  });
  const optimisticInsert = await zero.query.file_objects
    .where('id', deniedInsertId)
    .run({ type: 'unknown' });
  if (optimisticInsert.length !== 1) throw new Error('file_objects insert was not queued locally');
  await waitFor(
    () => zero!.query.file_objects.where('id', deniedInsertId).run({ type: 'unknown' }),
    (rows) => rows.length === 0,
    'denied file_objects insert did not roll back'
  );
  const inserted = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM file_objects WHERE id = ${deniedInsertId}::uuid
  `;
  if (Number(inserted[0]?.count ?? 0) !== 0) {
    throw new Error('file_objects insert reached Postgres')
  }

  await zero.mutate.file_objects.update({
    id: seedId,
    content_hash: seedHash,
    original_name: deniedName,
  });
  const optimisticUpdate = await zero.query.file_objects
    .where('id', seedId)
    .run({ type: 'unknown' });
  if (optimisticUpdate[0]?.original_name !== deniedName) {
    throw new Error('file_objects update was not queued locally');
  }
  await waitFor(
    () => zero!.query.file_objects.where('id', seedId).run({ type: 'unknown' }),
    (rows) => rows[0]?.original_name === originalName,
    'denied file_objects update did not roll back'
  );
  const updated = await sql<{ original_name: string | null }[]>`
    SELECT original_name FROM file_objects WHERE id = ${seedId}::uuid
  `;
  if (updated[0]?.original_name !== originalName) {
    throw new Error('file_objects update reached Postgres');
  }

  // Zero's server transform also keys this published table by its immutable
  // content hash. Supplying both identifiers ensures the denial comes from the
  // write policy, not from a structurally incomplete operation.
  await zero.mutate.file_objects.delete({ id: seedId, content_hash: seedHash } as {
    id: string;
  });
  const optimisticDelete = await zero.query.file_objects
    .where('id', seedId)
    .run({ type: 'unknown' });
  if (optimisticDelete.length !== 0) throw new Error('file_objects delete was not queued locally');
  await waitFor(
    () => zero!.query.file_objects.where('id', seedId).run({ type: 'unknown' }),
    (rows) => rows.length === 1 && rows[0]?.original_name === originalName,
    'denied file_objects delete did not roll back'
  );
  const deleted = await sql<{ count: string; original_name: string | null }[]>`
    SELECT count(*)::text AS count, min(original_name) AS original_name
    FROM file_objects WHERE id = ${seedId}::uuid
  `;
  if (Number(deleted[0]?.count ?? 0) !== 1 || deleted[0]?.original_name !== originalName) {
    throw new Error('file_objects delete reached Postgres');
  }

  console.log(
    JSON.stringify({
      ok: true,
      read_allowed: true,
      insert_denied: true,
      update_denied: true,
      delete_denied: true,
      allowed_transport_control: true,
    })
  );
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally {
  if (zero) await zero.close();
  await sql`DELETE FROM app_settings WHERE id = ${controlId}::uuid`;
  await sql`DELETE FROM file_objects WHERE id IN (${seedId}::uuid, ${deniedInsertId}::uuid)`;
  await sql.end({ timeout: 5 });
}

process.exit(process.exitCode ?? 0);
