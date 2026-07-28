/**
 * AC-3 / TC-6..7 (infer-1): Default-deny DeepSeek escape via allowEscape parameter.
 *
 * NEGATIVE CONTROL (would fail if):
 * - allowEscape=false check omitted so default path permits escape
 * - allowEscape parameter bypassed with static value so no real role/escape parameters
 * - Network assertion mocked so always shows zero cloud traffic
 *
 * Run:
 *   PLATFORM_IT=1 HOLO_ESCAPE_BUDGET_USD=10 \
 *     pnpm vitest run tests/integration/service/infer-router-default-deny.test.ts
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from './harness';
import { installNetworkCapture, writeInferArtifact } from './infer-network-capture';
import { loadResolveModel } from './infer-resolve-loader';

const itLive = PLATFORM_IT ? it : it.skip;

describe('AC-3: default-deny DeepSeek escape (allowEscape)', () => {
  const prevBudget = process.env.HOLO_ESCAPE_BUDGET_USD;

  beforeEach(() => {
    // Sufficient budget for escape path tests (infer-2 will replace with ledger)
    process.env.HOLO_ESCAPE_BUDGET_USD = process.env.HOLO_ESCAPE_BUDGET_USD || '10';
  });

  afterEach(() => {
    if (prevBudget === undefined) delete process.env.HOLO_ESCAPE_BUDGET_USD;
    else process.env.HOLO_ESCAPE_BUDGET_USD = prevBudget;
  });

  itLive('allowEscape=false returns :4545 fleet endpoint (never Anthropic)', async () => {
    const capture = installNetworkCapture();
    try {
      const { resolveModel } = await loadResolveModel();
      const resolved = await resolveModel('divergent', {
        allowEscape: false,
        estimatedCostUsd: 0.01,
      });

      expect(resolved.endpoint).toMatch(/:4545/);
      expect(resolved.endpoint).not.toMatch(/api\.deepseek\.com/i);
      expect(resolved.allowEscape === false || resolved.allowEscape === undefined).toBe(true);
      expect(capture.deepseekCount()).toBe(0);

      writeInferArtifact('AC-3-allowEscape-false.json', {
        endpoint: resolved.endpoint,
        allowEscape: resolved.allowEscape ?? false,
        deepseekCount: capture.deepseekCount(),
        rows: capture.snapshot(),
      });
    } finally {
      capture.restore();
    }
  });

  itLive(
    'allowEscape=true returns api.deepseek.com endpoint after budget pre-check + real probe',
    async () => {
      const capture = installNetworkCapture();
      try {
        const { resolveModel } = await loadResolveModel();
        const resolved = await resolveModel('divergent', {
          allowEscape: true,
          estimatedCostUsd: 0.01,
          reason: 'ac3-escape-probe',
        });

        expect(resolved.endpoint).toMatch(/api\.deepseek\.com/i);
        expect(resolved.endpoint).not.toMatch(/:4545/);
        expect(resolved.allowEscape).toBe(true);
        // Real network traffic to Anthropic (probe) — not a mocked zero counter
        expect(capture.deepseekCount()).toBeGreaterThanOrEqual(1);

        writeInferArtifact('AC-3-allowEscape-true.json', {
          endpoint: resolved.endpoint,
          allowEscape: resolved.allowEscape,
          deepseekCount: capture.deepseekCount(),
          rows: capture.snapshot(),
        });
      } finally {
        capture.restore();
      }
    }
  );

  itLive(
    'allowEscape=true is blocked when budget pre-check fails (no Anthropic traffic)',
    async () => {
      process.env.HOLO_ESCAPE_BUDGET_USD = '0';
      const capture = installNetworkCapture();
      try {
        const mod = await loadResolveModel();
        const { resolveModel } = mod;

        let threw = false;
        let code = '';
        try {
          await resolveModel('divergent', {
            allowEscape: true,
            estimatedCostUsd: 1,
            reason: 'ac3-over-budget',
          });
        } catch (err) {
          threw = true;
          code =
            err && typeof err === 'object' && 'code' in err
              ? String((err as { code: unknown }).code)
              : err instanceof Error
                ? err.message
                : String(err);
        }

        expect(threw).toBe(true);
        expect(code).toMatch(/BUDGET|budget|ESCAPE|escape|not configured|exceeded/i);
        expect(capture.deepseekCount()).toBe(0);

        writeInferArtifact('AC-3-budget-block.json', {
          threw,
          code,
          deepseekCount: capture.deepseekCount(),
        });
      } finally {
        capture.restore();
      }
    }
  );

  itLive('default allowEscape (omitted) is deny — never Anthropic', async () => {
    const capture = installNetworkCapture();
    try {
      const { resolveModel } = await loadResolveModel();
      // Explicitly omit options.allowEscape
      const resolved = await resolveModel('divergent');
      expect(resolved.endpoint).toMatch(/:4545/);
      expect(resolved.endpoint).not.toMatch(/api\.deepseek\.com/i);
      expect(capture.deepseekCount()).toBe(0);
    } finally {
      capture.restore();
    }
  });
});
