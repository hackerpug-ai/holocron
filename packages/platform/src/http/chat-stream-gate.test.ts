/**
 * Sprint 25 / F1 — truth-table unit test for the chat pre-flight gate.
 *
 * Pure predicate: no Postgres, no fleet, no Hono. Imports ONLY the predicate
 * (which itself has zero side-effecting imports) so it runs in every env,
 * including worktrees where drizzle-orm is not materialized. The mock/e2e
 * proofs live in sprint25-chat-fleet-only-mock.test.ts (PLATFORM_IT-gated).
 *
 * Post-F1 expected truth:
 *   - nonprod + no env           → FALSE (real fleet path is default)
 *   - HOLO_CHAT_DETERMINISTIC_STREAM=1 → TRUE (opt-in safety net)
 *   - HOLO_E2E=1                 → TRUE
 *   - [[e2e-stream]] marker      → TRUE
 *   - production-like DB         → FALSE (unchanged; never deterministic)
 *
 * Pre-F1 (silent-default mask), nonprod + no env → TRUE. This test MUST fail
 * on the pre-flip code (RED) and pass on the post-flip code (GREEN).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { shouldUseDeterministicChatStream } from './chat-stream-gate';

const NONPROD_URL = 'postgres://127.0.0.1:5432/holocron_nonprod';
const PROD_LIKE_URL = 'postgres://127.0.0.1:5432/holocron';

const TRACKED_KEYS = [
  'HOLO_CHAT_DETERMINISTIC_STREAM',
  'HOLO_E2E',
  'HOLO_CHAT_FLEET_ONLY',
] as const;

describe('AC-1/2/3: shouldUseDeterministicChatStream truth table (post-F1)', () => {
  afterEach(() => {
    for (const key of TRACKED_KEYS) delete process.env[key];
  });

  it('returns FALSE under nonprod + no env (real fleet path is the default)', () => {
    for (const key of TRACKED_KEYS) delete process.env[key];
    expect(shouldUseDeterministicChatStream(NONPROD_URL, 'hello')).toBe(false);
  });

  it('returns TRUE under nonprod + HOLO_CHAT_DETERMINISTIC_STREAM=1 (opt-in safety net)', () => {
    for (const key of TRACKED_KEYS) delete process.env[key];
    process.env.HOLO_CHAT_DETERMINISTIC_STREAM = '1';
    expect(shouldUseDeterministicChatStream(NONPROD_URL, 'hello')).toBe(true);
  });

  it('returns FALSE under production-like DB regardless of env (never canned)', () => {
    for (const key of TRACKED_KEYS) delete process.env[key];
    expect(shouldUseDeterministicChatStream(PROD_LIKE_URL, 'hello')).toBe(false);
  });

  it('returns TRUE under HOLO_E2E=1 (e2e marker env)', () => {
    for (const key of TRACKED_KEYS) delete process.env[key];
    process.env.HOLO_E2E = '1';
    expect(shouldUseDeterministicChatStream(NONPROD_URL, 'hello')).toBe(true);
  });

  it('returns TRUE when message carries the [[e2e-stream]] marker', () => {
    for (const key of TRACKED_KEYS) delete process.env[key];
    expect(shouldUseDeterministicChatStream(NONPROD_URL, '[[e2e-stream]] probe')).toBe(true);
  });

  it('returns TRUE when message carries the [[e2e_stream]] underscore variant', () => {
    for (const key of TRACKED_KEYS) delete process.env[key];
    expect(shouldUseDeterministicChatStream(NONPROD_URL, '[[e2e_stream]] probe')).toBe(true);
  });
});
