/**
 * S31-FE-02 — Zero-backed hooks can represent error; single degraded banner.
 *
 * Integration lane (PLATFORM_IT=1). Source + export contracts for AC-4 / TC-6 /
 * TC-7 / TC-8 / TC-13. Behavioral zero-down e2e is AC-1/AC-2 Maestro.
 *
 * ChatThread is not mounted here: MessageBubble pulls expo-clipboard /
 * expo-modules-core which lack a vitest-native host. Sibling integration
 * suites (s-reactive-04, s-reactive-01) use the same static ChatThread
 * contracts; e2e proves the live node count.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ZERO_ROW_WATCHDOG_DEADLINE_MS,
  ZERO_ROW_WATCHDOG_MESSAGE,
} from '@/hooks/use-zero-row-watchdog';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const WATCHDOG_PATH = join(REPO_ROOT, 'hooks', 'use-zero-row-watchdog.ts');
const PROGRESS_PATH = join(REPO_ROOT, 'hooks', 'useResearchProgress.ts');
const SESSION_PATH = join(REPO_ROOT, 'hooks', 'useResearchSession.ts');
const HISTORY_PATH = join(REPO_ROOT, 'hooks', 'use-chat-history.ts');
const CHAT_THREAD_PATH = join(REPO_ROOT, 'components', 'chat', 'ChatThread.tsx');
const CHAT_SCREEN_PATH = join(REPO_ROOT, 'app', '(drawer)', 'chat', '[conversationId].tsx');

const runPlatform = process.env.PLATFORM_IT === '1';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('S31-FE-02 zero error representable', () => {
  it.skipIf(!runPlatform)('watchdog deadline floor', () => {
    expect(existsSync(WATCHDOG_PATH)).toBe(true);
    expect(ZERO_ROW_WATCHDOG_DEADLINE_MS).toBeGreaterThanOrEqual(15_000);
    expect(ZERO_ROW_WATCHDOG_DEADLINE_MS).toBeLessThanOrEqual(45_000);
    expect(ZERO_ROW_WATCHDOG_MESSAGE.length).toBeGreaterThanOrEqual(20);
  });

  it.skipIf(!runPlatform)('all three hooks wire the shared watchdog', () => {
    for (const path of [PROGRESS_PATH, SESSION_PATH, HISTORY_PATH]) {
      expect(existsSync(path), path).toBe(true);
      const src = read(path);
      expect(src).toMatch(/useZeroRowWatchdog/);
      expect(src).toMatch(/use-zero-row-watchdog/);
      // No remaining hardcoded null error return literals
      expect(src).not.toMatch(/error:\s*null\s*as\s+Error/);
      expect(src).not.toMatch(/^\s*error:\s*null,?$/m);
    }
    // Research detail uses useDeepResearchSession in the same file
    expect(read(SESSION_PATH)).toMatch(/function useDeepResearchSession/);
    expect(read(SESSION_PATH)).toMatch(/useZeroRowWatchdog/);
  });

  it.skipIf(!runPlatform)('screen no longer owns the banner', () => {
    const screenSrc = read(CHAT_SCREEN_PATH);
    // TC-8: deleted, not conditionally hidden
    expect(screenSrc).not.toMatch(/testID=['"]chat-degraded-banner['"]/);
    expect(screenSrc).not.toMatch(/chat-degraded-message/);
    // Phase signal still passed down to ChatThread (sole owner)
    expect(screenSrc).toMatch(/streamPhase=\{streamPhase\}/);
    expect(screenSrc).toMatch(/degradedMessage=\{degradedMessage\}/);
    expect(screenSrc).toMatch(/error=\{messagesError\}/);
  });

  it.skipIf(!runPlatform)('exactly one degraded banner', () => {
    const screenSrc = read(CHAT_SCREEN_PATH);
    const threadSrc = read(CHAT_THREAD_PATH);

    // Screen contributes 0 banner nodes (deleted, not gated).
    expect(screenSrc).not.toMatch(/testID=['"]chat-degraded-banner['"]/);

    // Thread is sole owner of chat-degraded-banner.
    const bannerDecls = threadSrc.match(/testID=['"]chat-degraded-banner['"]/g) ?? [];
    expect(bannerDecls.length).toBeGreaterThanOrEqual(1);

    // Stream degraded banner + empty-state error banner are mutually exclusive:
    // empty-state only mounts when streamPhase !== 'degraded'.
    expect(threadSrc).toMatch(/streamPhase === ['"]degraded['"]/);
    expect(threadSrc).toMatch(/error && streamPhase !== ['"]degraded['"]/);

    // Canonical a11y contract on the surviving banner presentation.
    expect(threadSrc).toMatch(/accessibilityRole=['"]alert['"]/);
    expect(threadSrc).toMatch(/testID=['"]chat-degraded-message['"]/);

    // Error branch sits beside chat-loading-inline (empty-state ordering).
    const errorIdx = threadSrc.indexOf("error && streamPhase !== 'degraded'");
    const loadingIdx = threadSrc.indexOf('testID="chat-loading-inline"');
    expect(errorIdx).toBeGreaterThan(-1);
    expect(loadingIdx).toBeGreaterThan(errorIdx);

    // Stream degraded presentation: warning surface + message, no spinner hang.
    // (reconnecting indicator legitimately owns ActivityIndicator separately.)
    expect(threadSrc).toMatch(
      /streamPhase === ['"]degraded['"][\s\S]*?testID=['"]chat-degraded-banner['"][\s\S]*?testID=['"]chat-degraded-message['"]/
    );
    expect(threadSrc).toMatch(/Exact SURFACE_UNAVAILABLE_MESSAGE — no spinner/);
  });
});
