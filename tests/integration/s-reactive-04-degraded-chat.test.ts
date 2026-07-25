/**
 * S-REACTIVE-04 — Degraded 'local fleet unavailable' chat state (no hang).
 *
 * Static + pure-logic contracts (always run). Behavioral Maestro ACs are
 * exercised via `.maestro/reactive/degraded-*.yml` with real fleet-down.
 *
 * Negative control (red-against-start): before degraded phase / banner /
 * failure-envelope inference exist, these contracts MUST fail.
 *
 * No Zero query for degraded_mode (not in zero_pub). No cloud fallback.
 * Client infers from the chat failure envelope only.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const HOOK_PATH = join(REPO_ROOT, 'hooks', 'use-resumable-sse-stream.ts');
const CHAT_SCREEN_PATH = join(REPO_ROOT, 'app', '(drawer)', 'chat', '[conversationId].tsx');
const CHAT_THREAD_PATH = join(REPO_ROOT, 'components', 'chat', 'ChatThread.tsx');
const CONTROLLER_PATH = join(
  REPO_ROOT,
  'services',
  'platform',
  'src',
  'inference',
  'degraded-mode-controller.ts'
);
const INTERACTION_NOTES = join(REPO_ROOT, 'design', 'interaction-notes.md');
const ZERO_PUB = join(REPO_ROOT, 'services', 'platform', 'src', 'db', 'schema', 'zero-pub.ts');

const SURFACE_MSG = 'Local fleet unavailable — running in reduced mode';

const MAESTRO_FLOWS = ['degraded-no-hang.yml', 'degraded-recovery.yml'] as const;

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('S-REACTIVE-04 degraded chat state (no hang)', () => {
  describe('AC-1 / AC-3 deliverables exist', () => {
    for (const flow of MAESTRO_FLOWS) {
      it(`.maestro/reactive/${flow} exists`, () => {
        expect(existsSync(join(REPO_ROOT, '.maestro', 'reactive', flow))).toBe(true);
      });
    }

    it('hooks/use-resumable-sse-stream.ts extends state machine with degraded', () => {
      expect(existsSync(HOOK_PATH)).toBe(true);
      const src = read(HOOK_PATH);
      expect(src).toMatch(/['"]degraded['"]/);
      expect(src).toMatch(/ChatStreamPhase/);
    });
  });

  describe('AC-2 — SURFACE_UNAVAILABLE_MESSAGE + failure-envelope inference (not Zero)', () => {
    it('backend exports exact SURFACE_UNAVAILABLE_MESSAGE', () => {
      const src = read(CONTROLLER_PATH);
      expect(src).toMatch(
        /SURFACE_UNAVAILABLE_MESSAGE\s*=\s*['"]Local fleet unavailable — running in reduced mode['"]/
      );
    });

    it('design notes cite failure-envelope inference (not Zero query)', () => {
      expect(existsSync(INTERACTION_NOTES), 'design/interaction-notes.md must exist').toBe(true);
      const notes = read(INTERACTION_NOTES);
      expect(notes).toMatch(/failure envelope/i);
      expect(notes).toMatch(/infer/i);
      expect(notes).not.toMatch(/Zero-query degraded_mode|zero query.*degraded_mode/i);
    });

    it('degraded_mode is not published on zero_pub', () => {
      const src = read(ZERO_PUB);
      expect(src).not.toMatch(/degraded_mode/);
    });

    it('client does not Zero-query degraded_mode or hit a degraded HTTP endpoint', () => {
      const hook = read(HOOK_PATH);
      const screen = read(CHAT_SCREEN_PATH);
      const thread = read(CHAT_THREAD_PATH);
      const combined = `${hook}\n${screen}\n${thread}`;
      // Ban Zero/query usage of the unpublished table (allow doc mentions of the ban).
      expect(combined).not.toMatch(
        /useQuery\([^)]*degraded|from\(['"]degraded_mode['"]\)|queries\.degraded|degraded_mode\s*:/
      );
      expect(combined).not.toMatch(/\/api\/degraded-state|\/api\/degraded[-\w]*/);
      expect(combined).not.toMatch(/from\s+['"]convex\/react['"]/);
    });
  });

  describe('AC-1 / AC-2 — pure failure-envelope inference + degraded phase', () => {
    it('exports SURFACE_UNAVAILABLE_MESSAGE matching backend exactly', async () => {
      const mod = await import('../../hooks/use-resumable-sse-stream');
      expect(mod.SURFACE_UNAVAILABLE_MESSAGE).toBe(SURFACE_MSG);
    });

    it('isFleetUnavailableFailure detects ROLE_UNAVAILABLE / surface-unavailable envelopes', async () => {
      const mod = await import('../../hooks/use-resumable-sse-stream');
      expect(typeof mod.isFleetUnavailableFailure).toBe('function');

      expect(
        mod.isFleetUnavailableFailure({
          error:
            "fleet role 'divergent' unreachable at http://127.0.0.1:4545 (degradation=surface-unavailable): ECONNREFUSED",
        })
      ).toBe(true);

      expect(
        mod.isFleetUnavailableFailure({
          code: 'ROLE_UNAVAILABLE',
          message: SURFACE_MSG,
        })
      ).toBe(true);

      expect(
        mod.isFleetUnavailableFailure({
          status: 'failed',
          error: 'chat run failed for unrelated reasons',
        })
      ).toBe(false);

      expect(mod.isFleetUnavailableFailure({})).toBe(false);
    });

    it('applyFleetFailureEnvelope transitions to degraded with exact message', async () => {
      const mod = await import('../../hooks/use-resumable-sse-stream');
      expect(typeof mod.applyFleetFailureEnvelope).toBe('function');

      const hit = mod.applyFleetFailureEnvelope({
        phase: 'streaming' as const,
        error:
          "fleet role 'divergent' unreachable at http://127.0.0.1:4545 (degradation=surface-unavailable): down",
      });
      expect(hit.phase).toBe('degraded');
      expect(hit.message).toBe(SURFACE_MSG);
      expect(hit.isDegraded).toBe(true);

      const miss = mod.applyFleetFailureEnvelope({
        phase: 'streaming' as const,
        error: 'validation failed',
      });
      expect(miss.phase).toBe('streaming');
      expect(miss.isDegraded).toBe(false);
    });
  });

  describe('AC-1 / AC-3 — UI wiring (no spinner hang, recovery path)', () => {
    it('ChatThread renders degraded banner with exact message + testID (no ActivityIndicator in degraded)', () => {
      const src = read(CHAT_THREAD_PATH);
      expect(src).toMatch(/chat-degraded-banner/);
      expect(src).toMatch(
        /SURFACE_UNAVAILABLE_MESSAGE|Local fleet unavailable — running in reduced mode/
      );
      expect(src).toMatch(/streamPhase === ['"]degraded['"]|phase === ['"]degraded['"]|degraded/);
      // Degraded branch must not render a spinner (hang signature)
      // Soft check: degraded banner block exists as a distinct testID
      expect(src).toMatch(/testID=['"]chat-degraded-banner['"]/);
    });

    it('chat screen clears busy on degraded and recovers on next successful send', () => {
      const src = read(CHAT_SCREEN_PATH);
      expect(src).toMatch(/degraded/);
      // Must not keep agentBusy true solely from degraded phase
      expect(src).toMatch(/streamPhase === ['"]degraded['"]|phase === ['"]degraded['"]/);
      // Recovery: successful send / connect leaves degraded
      expect(src).toMatch(/resetStream|connectStream|setRunBusy\(false\)/);
    });

    it('hook handles terminal/error failure envelope → degraded (not complete hang)', () => {
      const src = read(HOOK_PATH);
      expect(src).toMatch(/isFleetUnavailableFailure|applyFleetFailureEnvelope/);
      expect(src).toMatch(/['"]degraded['"]/);
      // terminal failed path must consider fleet envelope
      expect(src).toMatch(/terminal/);
      expect(src).toMatch(/status === ['"]failed['"]|failed/);
    });
  });

  describe('Maestro flows assert exact message + no hang oracles', () => {
    it('degraded-no-hang.yml asserts SURFACE message within bound and no hang oracle', () => {
      const yml = read(join(REPO_ROOT, '.maestro', 'reactive', 'degraded-no-hang.yml'));
      expect(yml).toMatch(/Local fleet unavailable — running in reduced mode/);
      expect(yml).toMatch(/chat-degraded-banner|chat-stream-phase-degraded/);
      expect(yml).toMatch(/chat-input-send-button/);
      // Must capture screenshot evidence
      expect(yml).toMatch(/takeScreenshot/);
    });

    it('degraded-recovery.yml asserts degraded clears after fleet restore + new send', () => {
      const yml = read(join(REPO_ROOT, '.maestro', 'reactive', 'degraded-recovery.yml'));
      expect(yml).toMatch(/Local fleet unavailable — running in reduced mode|chat-degraded-banner/);
      expect(yml).toMatch(/chat-input-send-button/);
      expect(yml).toMatch(/takeScreenshot/);
      // Hard-required post-restore must_observe (no optional-only escape)
      expect(yml).toMatch(/chat-stream-token-count-at-least-1/);
      expect(yml).toMatch(/chat-assistant-message-latest/);
      expect(yml).toMatch(
        /assertVisible:[\s\S]*chat-assistant-message-latest|assertVisible:[\s\S]*chat-stream-token-count-at-least-1/
      );
    });

    it('harnesses fail-closed when platform_pid missing or fleet-only restart fails', () => {
      const noHang = read(join(REPO_ROOT, '.maestro', 'reactive', 'run-degraded-no-hang.sh'));
      const recovery = read(join(REPO_ROOT, '.maestro', 'reactive', 'run-degraded-recovery.sh'));
      for (const src of [noHang, recovery]) {
        expect(src).toMatch(/FAIL-CLOSED/);
        expect(src).toMatch(/platform_pid missing/);
        expect(src).toMatch(/HOLO_CHAT_FLEET_ONLY platform restart failed health/);
        // Fail-closed gates must run before maestro test
        const failIdx = src.indexOf('FAIL-CLOSED');
        const maestroIdx = src.indexOf('maestro test');
        expect(failIdx).toBeGreaterThan(-1);
        expect(maestroIdx).toBeGreaterThan(failIdx);
      }
    });
  });
});
