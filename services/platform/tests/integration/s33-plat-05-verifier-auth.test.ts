/**
 * S33-PLAT-05 verifier auth regression.
 *
 * This test executes the real verifier against the deployed service. It gives
 * the verifier a real RN-scoped key and an intentionally invalid MCP-scoped
 * value; a successful public POST/SSE therefore proves the live path uses RN.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const platformIt = process.env.PLATFORM_IT === '1';
const rnKey = process.env.HOLO_KEY_RN?.trim() ?? '';
const releaseLock = process.env.S33_RELEASE_LOCK?.trim() ?? '';
const expectedMain = process.env.S33_EXPECTED_MAIN_SHA?.trim() ?? '';

if (!platformIt) {
  throw new Error('S33-PLAT-05 verifier auth test requires PLATFORM_IT=1');
}
if (!rnKey) {
  throw new Error('S33-PLAT-05 verifier auth test requires HOLO_KEY_RN');
}
if (!releaseLock) {
  throw new Error('S33-PLAT-05 verifier auth test requires S33_RELEASE_LOCK');
}
if (!expectedMain) {
  throw new Error('S33-PLAT-05 verifier auth test requires S33_EXPECTED_MAIN_SHA');
}

describe('S33-PLAT-05 deployed verifier auth', () => {
  it('uses RN scope for the real public POST and SSE, not MCP scope', async () => {
    const env = {
      ...process.env,
      HOLO_KEY_RN: rnKey,
      HOLO_KEY_MCP: 's33-invalid-mcp-scope',
      S33_HOLOCRON_HOST: process.env.S33_HOLOCRON_HOST ?? 'holocron@holocron',
      S33_REQUEST_HOST: process.env.S33_REQUEST_HOST ?? 'inference1',
      S33_EXPECTED_MAIN_SHA: expectedMain,
      S33_RELEASE_LOCK: releaseLock,
    };
    let output: { stdout: string; stderr: string; code: number | string };
    try {
      const result = await execFileAsync(
        '/opt/homebrew/bin/bash',
        ['scripts/verify-s33-mini-served-turn.sh', '--mode', 'live', '--json'],
        { env, maxBuffer: 10 * 1024 * 1024 }
      );
      output = { stdout: result.stdout, stderr: result.stderr, code: 0 };
    } catch (error) {
      const failure = error as {
        stdout?: string;
        stderr?: string;
        code?: number | string;
      };
      output = {
        stdout: failure.stdout ?? '',
        stderr: failure.stderr ?? '',
        code: failure.code ?? -1,
      };
    }

    expect(output.stderr).toBe('');
    const proof = JSON.parse(output.stdout) as {
      ok?: boolean;
      error_code?: string;
      chat_request_issued?: boolean;
      request_origin?: string;
      network_mutation_performed?: boolean;
      assistant_text_length?: number;
    };
    if (output.code !== 0) {
      expect(proof.chat_request_issued).toBe(true);
      expect(proof.error_code).not.toBe('CHAT_REQUEST_FAILED');
    }
    expect(output.code).toBe(0);
    expect(proof).toMatchObject({
      ok: true,
      chat_request_issued: true,
      request_origin: 'inference1',
      network_mutation_performed: false,
    });
    expect(proof.assistant_text_length).toBeGreaterThanOrEqual(10);
  }, 300_000);
});
