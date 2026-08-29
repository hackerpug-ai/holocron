/**
 * S31-FE-04 — single reconciler + no screen-level module turn state (TC-10).
 *
 * Source-level integration: proves the chat screen no longer holds module
 * singletons for pending user / local turn, and routes optimistic paint through
 * reconcileThreadMessages only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '../..');
const CHAT_SCREEN = join(REPO_ROOT, 'app/(drawer)/chat/[conversationId].tsx');
const RECONCILER = join(REPO_ROOT, 'packages/mobile/hooks/use-resumable-sse-stream.ts');
const HISTORY = join(REPO_ROOT, 'packages/mobile/hooks/use-chat-history.ts');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('S31-FE-04 single reconciler', () => {
  it('chat screen holds no module turn state', () => {
    const src = read(CHAT_SCREEN);

    // Deleted defect: module-level mutable turn / message singletons
    expect(src).not.toMatch(/\blet\s+modulePendingUser\b/);
    expect(src).not.toMatch(/\blet\s+moduleLocalTurn\b/);
    expect(src).not.toMatch(/\bmodulePendingUser\s*=/);
    expect(src).not.toMatch(/\bmoduleLocalTurn\s*=/);

    // No 24-character prefix identity (the weaker second reconciler)
    expect(src).not.toMatch(/\.slice\(\s*0\s*,\s*24\s*\)/);
    expect(src).not.toMatch(/agentContent\.slice\(0,\s*24\)/);

    // Screen renders history as returned by useChatHistory (no merge IIFE on top)
    expect(src).toMatch(/useChatHistory\(/);
    expect(src).toMatch(/pendingUser/);
    // Collision-safe client id path
    expect(src).toMatch(/pending-user-/);
  });

  it('reconcileThreadMessages accepts optimistic pending user overlay', () => {
    const src = read(RECONCILER);
    expect(src).toMatch(/export type PendingUserOverlay/);
    expect(src).toMatch(/export function reconcileThreadMessages\(\s*durable[\s\S]*pendingUser/);
    // Still pure — no module reads inside the reducer body
    const fnStart = src.indexOf('export function reconcileThreadMessages');
    const fnBody = src.slice(fnStart, fnStart + 2500);
    expect(fnBody).not.toMatch(/moduleStreamHandoff|modulePendingUser|moduleLocalTurn/);
  });

  it('useChatHistory forwards pending user into the single reducer', () => {
    const src = read(HISTORY);
    expect(src).toMatch(/pendingUser/);
    expect(src).toMatch(/reconcileThreadMessages\(durableMessages,\s*overlay,\s*pendingUser/);
  });
});
