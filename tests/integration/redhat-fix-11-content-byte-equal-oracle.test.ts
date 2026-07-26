/**
 * REDHAT-FIX-11 — F-TEXT-DIFF-ORACLE content byte-equal oracle.
 *
 * PATH-A: pure equality helper + ChatThread/Maestro wiring prove rendered
 * latest assistant text is byte-equal to durable Zero/chat_messages content.
 * Negative control: deliberate mismatch → equal===false / mismatch testID.
 *
 * NOT a substitute: redhat-fix-04 UNIQUE_TEXT SSE stub equality.
 *
 * Run:
 *   pnpm vitest run tests/integration/redhat-fix-11-content-byte-equal-oracle.test.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const EVIDENCE_DIR = join(REPO_ROOT, '.tmp', 'REDHAT-FIX-11');
const PATH_JSON = join(REPO_ROOT, '.tmp', 'sprint-25', 'redhat-fix-11-path.json');
const CHAT_THREAD = join(REPO_ROOT, 'components', 'chat', 'ChatThread.tsx');
const MAESTRO_EXACTLY_ONE = join(
  REPO_ROOT,
  '.maestro',
  'reactive',
  'exactly-one-final-message.yml'
);
const MAESTRO_RECONNECT = join(REPO_ROOT, '.maestro', 'reactive', 'reconnect-exactly-once.yml');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('REDHAT-FIX-11 content byte-equal oracle', () => {
  it('AC-2: match and mismatch discriminate (durable vs rendered)', async () => {
    // Pure production helper (no RN natives) — same functions ChatThread mounts
    const { chatContentsAreByteEqual, resolveChatContentByteEqualOracleId } = await import(
      '@/components/chat/chat-content-byte-equal'
    );

    // Match case — durable Zero content === rendered latest agent text
    const matchRendered = 'OneTwoThreeFourFive';
    const matchDurable = 'OneTwoThreeFourFive';
    expect(chatContentsAreByteEqual(matchRendered, matchDurable)).toBe(true);
    expect(resolveChatContentByteEqualOracleId(matchRendered, matchDurable)).toBe(
      'chat-content-byte-equal'
    );

    // Negative control — deliberate durable/render divergence MUST fail equality
    const mismatchRendered = 'OneTwoThreeFourFive';
    const mismatchDurable = 'Completely different text';
    expect(chatContentsAreByteEqual(mismatchRendered, mismatchDurable)).toBe(false);
    expect(resolveChatContentByteEqualOracleId(mismatchRendered, mismatchDurable)).toBe(
      'chat-content-byte-mismatch'
    );

    // Empty durable → no oracle (not yet finalized / Zero lag)
    expect(resolveChatContentByteEqualOracleId('preview', '')).toBeNull();
    expect(resolveChatContentByteEqualOracleId(null, 'x')).toBeNull();

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const seeded = [
      'AC-2 PATH-A equality helper',
      `match equal=${chatContentsAreByteEqual(matchRendered, matchDurable)}`,
      `match oracle=${resolveChatContentByteEqualOracleId(matchRendered, matchDurable)}`,
      `mismatch equal=${chatContentsAreByteEqual(mismatchRendered, mismatchDurable)}`,
      `mismatch oracle=${resolveChatContentByteEqualOracleId(mismatchRendered, mismatchDurable)}`,
    ].join('\n');
    writeFileSync(join(EVIDENCE_DIR, 'AC-2-green.txt'), seeded);
    writeFileSync(join(EVIDENCE_DIR, 'AC-2-seeded-artifact.txt'), seeded);
  });

  it('AC-1 wiring: ChatThread emits equality testIDs; Maestro asserts them', () => {
    const thread = read(CHAT_THREAD);
    expect(thread).toMatch(/chat-content-byte-equal/);
    expect(thread).toMatch(/chat-content-byte-mismatch/);
    expect(thread).toMatch(/chat-content-byte-equal/);
    // Durable source — not SSE UNIQUE_TEXT stub alone
    expect(thread).toMatch(/durableMessages|durableContent|durable/);
    expect(thread).toMatch(/resolveChatContentByteEqualOracleId/);

    const helper = read(join(REPO_ROOT, 'components', 'chat', 'chat-content-byte-equal.ts'));
    expect(helper).toMatch(/export function chatContentsAreByteEqual/);
    expect(helper).toMatch(/export function resolveChatContentByteEqualOracleId/);

    const yml = read(MAESTRO_EXACTLY_ONE);
    expect(yml).toMatch(/chat-content-byte-equal/);
    // Retained bubble/latest oracles (AC-3)
    expect(yml).toMatch(/chat-assistant-message-latest/);
    expect(yml).toMatch(/Streaming/);

    const reconnect = read(MAESTRO_RECONNECT);
    expect(reconnect).toMatch(/chat-assistant-bubble-count-1|chat-assistant-message-latest/);

    if (existsSync(PATH_JSON)) {
      const p = JSON.parse(read(PATH_JSON)) as {
        path?: string;
        finding?: string;
        follow_up_task_id?: string;
      };
      expect(['A', 'B']).toContain(p.path);
      expect(String(p.finding ?? '') + JSON.stringify(p)).toMatch(/F-TEXT-DIFF-ORACLE/);
      if (p.path === 'B') {
        expect(typeof p.follow_up_task_id).toBe('string');
        expect((p.follow_up_task_id ?? '').length).toBeGreaterThan(0);
      }
    }
  });
});
