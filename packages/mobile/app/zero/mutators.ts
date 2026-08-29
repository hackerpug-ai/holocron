import { defineMutator, defineMutators, type Transaction } from '@rocicorp/zero';
import { zeroBuilder } from './queries';
import type { schema } from './schema';

type Tx = Transaction<typeof schema>;

/**
 * Client mutators for the chat and documents clusters (S-REWRITE-01/02).
 * Named per 13-client-data-contract.yaml zero_mutator targets:
 *   - publishDocument
 *   - unpublishDocument
 *   - createImportDocument
 *
 * Mutators must be idempotent (rebasing). Server registration via mutateURL
 * is expected once the platform /mutate endpoint is wired; client runs
 * optimistically against the Zero local store in the meantime.
 */
function newShareToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `share-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type DocumentRow = {
  id: string;
  content?: string | null;
  share_token?: string | null;
  is_public?: boolean | null;
};

type ConversationUpdate = {
  id: string;
  title?: string;
  title_set_by_user?: boolean;
  agent_busy?: boolean;
  agent_busy_since?: number | null;
  updated_at?: number;
};

export const mutators = defineMutators({
  updateConversation: defineMutator(async ({ tx, args }: { tx: Tx; args: ConversationUpdate }) => {
    await tx.mutate.conversations.update(args);
  }),

  deleteConversation: defineMutator(async ({ tx, args }: { tx: Tx; args: { id: string } }) => {
    await tx.mutate.conversations.delete({ id: args.id });
  }),

  softDeleteChatMessage: defineMutator(async ({ tx, args }: { tx: Tx; args: { id: string } }) => {
    await tx.mutate.chat_messages.update({ id: args.id, deleted: true });
  }),

  publishDocument: defineMutator(async ({ tx, args }: { tx: Tx; args: { id: string } }) => {
    const existing = (await tx.run(zeroBuilder.documents.where('id', args.id).one())) as
      | DocumentRow
      | undefined;
    if (!existing) {
      throw new Error(`Document ${args.id} not found`);
    }
    const shareToken = existing.share_token ?? newShareToken();
    await tx.mutate.documents.update({
      id: args.id,
      is_public: true,
      share_token: shareToken,
      published_at: Date.now(),
    });
  }),

  unpublishDocument: defineMutator(async ({ tx, args }: { tx: Tx; args: { id: string } }) => {
    await tx.mutate.documents.update({
      id: args.id,
      is_public: false,
    });
  }),

  /**
   * Append imported text onto an existing document (contract: createImportDocument).
   * Mirrors the retired imports.createImport path without writing the imports
   * table (imports is excluded from zero_pub).
   */
  createImportDocument: defineMutator(
    async ({
      tx,
      args,
    }: {
      tx: Tx;
      args: { documentId: string; source: string; text: string };
    }) => {
      const existing = (await tx.run(zeroBuilder.documents.where('id', args.documentId).one())) as
        | DocumentRow
        | undefined;
      if (!existing) {
        throw new Error(`Document ${args.documentId} not found`);
      }
      const base = existing.content ?? '';
      const updated = base.length > 0 ? `${base}\n\n${args.text}` : args.text;
      await tx.mutate.documents.update({
        id: args.documentId,
        content: updated,
      });
    }
  ),

  /** Optional insert for brand-new document shells from import flows. */
  insertDocument: defineMutator(
    async ({
      tx,
      args,
    }: {
      tx: Tx;
      args: { id?: string; title: string; content: string; category?: string };
    }) => {
      const id = args.id ?? newId();
      await tx.mutate.documents.insert({
        id,
        title: args.title,
        content: args.content,
        category: args.category ?? 'general',
        status: 'draft',
        is_public: false,
        created_at: Date.now(),
      });
    }
  ),
});

export type DocumentMutators = typeof mutators;
