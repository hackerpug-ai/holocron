/**
 * REDHAT-FIX-H1/H5/H7 — canonical one-shot Zero read helper.
 *
 * The `@rocicorp/zero` JS client is reactive (designed for React `useQuery`),
 * so a one-shot read from a CLI/test is non-obvious. This helper materializes
 * a `chat_messages`-by-conversation view, waits for the first `complete`
 * resultType, captures the rows, and tears the view down — the genuine durable
 * read path that `app/(drawer)/chat/reference.tsx` uses at runtime.
 *
 * It is the SINGLE source of truth for "query the live zero-cache" used by:
 *   - scripts/e2e/zero-reference-read.ts (the capstone verifier's bun helper)
 *   - packages/platform/tests/integration/sprint20-reference-zero-durable.test.ts (H5)
 *   - packages/platform/tests/integration/nonprod-namespace-zero-sync.test.ts (H7)
 *
 * NEVER mock this. A red/timeout result here is real evidence that the durable
 * read path is broken, not a test defect.
 */
import { Zero } from '@rocicorp/zero';
import { schema } from '../../../../../app/zero/schema.ts';

export interface ZeroConversationRow {
  id: string;
  conversation_id: string | null;
  role: string;
  content: string | null;
  session_id?: string | null;
  created_at: number;
}

export interface ZeroReadResult {
  ok: boolean;
  server: string;
  conversationId: string;
  rowCount: number;
  rows: ZeroConversationRow[];
  /** True iff at least one row has role === 'agent'. */
  agentPresent: boolean;
  /** content length of the first agent row (0 if none). */
  agentContentLen: number;
  /** id of the first agent row (undefined if none). */
  agentId?: string;
  /** True iff the conversation row is visible through Zero. */
  conversationPresent?: boolean;
  /** Replicated conversation title, or null when absent. */
  conversationTitle?: string | null;
  /** Set when the client never reached a 'complete' resultType in time. */
  timedOut?: boolean;
  /** Error message on failure. */
  error?: string;
}

export interface ZeroReadOptions {
  server: string;
  conversationId: string;
  userId?: string;
  /** Hard cap; default 20s. Zero's first sync handshake can take several seconds. */
  timeoutMs?: number;
}

export async function readConversationViaZero(opts: ZeroReadOptions): Promise<ZeroReadResult> {
  const { server, conversationId, userId = 'zero-oneshot', timeoutMs = 20_000 } = opts;
  const base: ZeroReadResult = {
    ok: false,
    server,
    conversationId,
    rowCount: 0,
    rows: [],
    agentPresent: false,
    agentContentLen: 0,
  };

  let zero: Zero<typeof schema> | undefined;
  try {
    zero = new Zero({
      server,
      schema,
      userID: userId,
    });
  } catch (err) {
    return { ...base, error: `Zero client construction failed: ${String(err)}` };
  }

  const chatView = zero.query.chat_messages
    .where('conversation_id', conversationId)
    .orderBy('created_at', 'asc')
    .materialize();
  // H7: also read the conversations table to prove the reference conversation row
  // is visible through the live replication path after a namespace reset.
  const convView = zero.query.conversations.where('id', conversationId).materialize();

  return await new Promise<ZeroReadResult>((resolve) => {
    let settled = false;
    const finish = (result: ZeroReadResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.off('uncaughtException', uncaughtHandler);
      try {
        chatView.destroy();
        convView.destroy();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    // The zero client's connection layer can EMIT an uncaught exception when the
    // endpoint is unreachable (e.g. a closed port for the AC-2 negative control).
    // Route those into a clean red result instead of crashing the test process.
    const uncaughtHandler = (err: unknown) => {
      finish({ ...base, error: `zero client connection error: ${String(err)}` });
    };
    process.once('uncaughtException', uncaughtHandler);

    const timer = setTimeout(() => {
      finish({ ...base, timedOut: true, error: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    let chatDone = false;
    let convDone = false;
    let chatRows: ZeroConversationRow[] = [];
    let convTitle: string | null | undefined;
    let convPresent = false;
    const maybeFinish = () => {
      if (!(chatDone && convDone)) return;
      // Rows are ascending by created_at; the newest durable reply is the
      // authoritative one for a freshly executed reference flow.
      const agent = [...chatRows].reverse().find((r) => r.role === 'agent');
      finish({
        ok: true,
        server,
        conversationId,
        rowCount: chatRows.length,
        rows: chatRows,
        agentPresent: !!agent,
        agentContentLen: agent ? (agent.content?.length ?? 0) : 0,
        agentId: agent?.id,
        conversationPresent: convPresent,
        conversationTitle: convTitle ?? null,
      });
    };

    chatView.addListener(
      (rows: readonly ZeroConversationRow[], resultType: string, error?: unknown) => {
        if (resultType === 'error') {
          finish({ ...base, error: `zero chat query errored: ${JSON.stringify(error)}` });
          return;
        }
        if (resultType !== 'complete') return;
        chatRows = [...rows];
        chatDone = true;
        maybeFinish();
      }
    );
    convView.addListener(
      (
        rows: readonly { id: string; title?: string | null }[],
        resultType: string,
        _error?: unknown
      ) => {
        if (resultType === 'error') {
          // A conversations-view failure must not mask a successful chat read.
          convDone = true;
          maybeFinish();
          return;
        }
        if (resultType !== 'complete') return;
        convPresent = rows.length > 0;
        convTitle = rows[0]?.title ?? null;
        convDone = true;
        maybeFinish();
      }
    );
  });
}
