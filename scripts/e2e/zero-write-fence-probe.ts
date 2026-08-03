#!/usr/bin/env bun
/**
 * Sprint 29 deployed Zero read-only probe.
 *
 * Proves both shipped write envelopes are rejected by the real zero-cache:
 * custom mutators (no ZERO_MUTATE_URL) and legacy CRUD
 * (ZERO_ENABLE_CRUD_MUTATIONS=false). Postgres absence checks prove neither
 * optimistic client write reached the authoritative data plane.
 */
import { randomUUID } from 'node:crypto';
import {
  boolean,
  createSchema,
  defineMutator,
  defineMutators,
  number,
  string,
  table,
  type Transaction,
  Zero,
} from '@rocicorp/zero';
import postgres from 'postgres';

// The deployed publication deliberately excludes non-replicated application
// tables (for example media.file_objects). This probe needs only the two tables
// whose write envelopes it exercises, so negotiate that exact schema with Zero.
const conversations = table('conversations')
  .columns({
    id: string(),
    title: string().optional(),
    title_set_by_user: boolean().optional(),
    agent_busy: boolean().optional(),
    created_at: number(),
    updated_at: number(),
  })
  .primaryKey('id');
const documents = table('documents')
  .columns({
    id: string(),
    title: string().optional(),
    content: string().optional(),
    category: string().optional(),
    status: string().optional(),
    is_public: boolean().optional(),
    created_at: number(),
  })
  .primaryKey('id');
const probeSchema = createSchema({
  tables: [conversations, documents],
  enableLegacyQueries: true,
  enableLegacyMutators: true,
});
type ProbeTransaction = Transaction<typeof probeSchema>;
const probeMutators = defineMutators({
  insertDocument: defineMutator(
    async ({
      tx,
      args,
    }: {
      tx: ProbeTransaction;
      args: { id: string; title: string; content: string };
    }) => {
      await tx.mutate.documents.insert({
        id: args.id,
        title: args.title,
        content: args.content,
        category: 'general',
        status: 'draft',
        is_public: false,
        created_at: Date.now(),
      });
    }
  ),
});

type MutationDetails =
  | { type: 'success' }
  | { type: 'error'; error: { type: string; message: string } };

type QueryOnlyZero = { query: Zero<typeof probeSchema>['query'] };
type ProbeView = {
  addListener: (
    listener: (rows: readonly unknown[], resultType: string, error?: unknown) => void
  ) => void;
  destroy: () => void;
};
type CustomMutationDispatcher = (
  request: ReturnType<typeof probeMutators.insertDocument>
) => { client: Promise<MutationDetails>; server: Promise<MutationDetails> };
type LegacyConversationMutate = {
  conversations: {
    insert: (value: {
      id: string;
      title: string;
      title_set_by_user: boolean;
      agent_busy: boolean;
      created_at: number;
      updated_at: number;
    }) => Promise<void>;
  };
};

const zeroBaseUrl = process.env.ZERO_CACHE_URL ?? process.env.HOLO_ZERO_BASE_URL ?? '';
const databaseUrl = process.env.DATABASE_URL ?? '';
const timeoutMs = Number(process.env.ZERO_WRITE_PROBE_TIMEOUT_MS ?? '30000');
const runId = randomUUID();
// Both primary keys are PostgreSQL uuid columns. Keep the probe's descriptive
// labels in user/storage metadata, not in values sent to the database.
const documentId = randomUUID();
const conversationId = randomUUID();

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

function errorMessage(result: MutationDetails): string {
  return result.type === 'error' ? result.error.message : '';
}

async function waitForComplete(
  zero: QueryOnlyZero,
  table: 'documents' | 'conversations',
  id: string
): Promise<void> {
  const view = (table === 'documents'
    ? zero.query.documents.where('id', id).materialize()
    : zero.query.conversations.where('id', id).materialize()) as unknown as ProbeView;
  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        view.addListener((_rows, resultType, error) => {
          if (resultType === 'complete') resolve();
          if (resultType === 'error') reject(new Error(`Zero ${table} query failed: ${String(error)}`));
        });
      }),
      `${table} sync`
    );
  } finally {
    view.destroy();
  }
}

async function waitForConnectionError(zero: Zero<typeof probeSchema>): Promise<string> {
  const current = zero.connection.state.current;
  if (current.name === 'error') return current.reason;
  return withTimeout(
    new Promise<string>((resolve) => {
      const unsubscribe = zero.connection.state.subscribe((state) => {
        if (state.name === 'error') {
          unsubscribe();
          resolve(state.reason);
        }
      });
    }),
    'legacy CRUD rejection'
  );
}

async function probeCustomMutation() {
  const zero = new Zero<typeof probeSchema>({
    cacheURL: zeroBaseUrl,
    schema: probeSchema,
    mutators: probeMutators,
    userID: `s29-custom-${runId}`,
    storageKey: `s29-custom-${runId}`,
    logLevel: 'error',
  });
  try {
    await waitForComplete(zero, 'documents', documentId);
    const dispatch = zero.mutate as unknown as CustomMutationDispatcher;
    const mutation = dispatch(
      probeMutators.insertDocument({
        id: documentId,
        title: 'Sprint 29 Zero fence probe',
        content: 'must never reach Postgres',
      })
    );
    const client = (await withTimeout(mutation.client, 'custom client mutation')) as MutationDetails;
    const server = (await withTimeout(mutation.server, 'custom server rejection')) as MutationDetails;
    const message = errorMessage(server);
    return {
      connected: true,
      clientOptimistic: client.type === 'success',
      serverRejected: server.type === 'error',
      expectedRejection: /ZERO_MUTATE_URL|custom mutations/i.test(message),
      rejectionMessage: message,
    };
  } finally {
    await zero.close();
  }
}

async function probeLegacyCrudMutation() {
  const zero = new Zero<typeof probeSchema>({
    cacheURL: zeroBaseUrl,
    schema: probeSchema,
    userID: `s29-crud-${runId}`,
    storageKey: `s29-crud-${runId}`,
    logLevel: 'error',
  });
  try {
    await waitForComplete(zero, 'conversations', conversationId);
    const rejected = waitForConnectionError(zero);
    const legacyMutate = zero.mutate as unknown as LegacyConversationMutate;
    await legacyMutate.conversations.insert({
      id: conversationId,
      title: 'Sprint 29 Zero fence probe',
      title_set_by_user: true,
      agent_busy: false,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    const rejectionMessage = await rejected;
    return {
      connected: true,
      serverRejected: true,
      expectedRejection: /legacy CRUD mutations is disabled|InvalidPush/i.test(rejectionMessage),
      rejectionMessage,
    };
  } finally {
    await zero.close();
  }
}

async function main() {
  if (!zeroBaseUrl || !databaseUrl || !Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    throw new Error('ZERO_CACHE_URL/HOLO_ZERO_BASE_URL, DATABASE_URL, and a valid timeout are required');
  }

  const sql = postgres(databaseUrl, { max: 1 });
  let cleanedUnexpectedRows = false;
  try {
    const before = await sql<{ documents: number; conversations: number }[]>`
      SELECT
        (SELECT count(*)::int FROM documents WHERE id = ${documentId}) AS documents,
        (SELECT count(*)::int FROM conversations WHERE id = ${conversationId}) AS conversations
    `;
    const custom = await probeCustomMutation();
    const crud = await probeLegacyCrudMutation();
    const after = await sql<{ documents: number; conversations: number }[]>`
      SELECT
        (SELECT count(*)::int FROM documents WHERE id = ${documentId}) AS documents,
        (SELECT count(*)::int FROM conversations WHERE id = ${conversationId}) AS conversations
    `;
    const authoritativeUnchanged =
      before[0]?.documents === 0 &&
      before[0]?.conversations === 0 &&
      after[0]?.documents === 0 &&
      after[0]?.conversations === 0;

    if (!authoritativeUnchanged) {
      await sql`DELETE FROM documents WHERE id = ${documentId}`;
      await sql`DELETE FROM conversations WHERE id = ${conversationId}`;
      cleanedUnexpectedRows = true;
    }

    const ok =
      custom.connected &&
      custom.clientOptimistic &&
      custom.serverRejected &&
      custom.expectedRejection &&
      crud.connected &&
      crud.serverRejected &&
      crud.expectedRejection &&
      authoritativeUnchanged;
    console.log(
      JSON.stringify({
        ok,
        zeroBaseUrl,
        custom,
        crud,
        authoritativeUnchanged,
        cleanedUnexpectedRows,
      })
    );
    process.exitCode = ok ? 0 : 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main().catch((error) => {
  console.log(
    JSON.stringify({
      ok: false,
      zeroBaseUrl,
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exitCode = 1;
});
