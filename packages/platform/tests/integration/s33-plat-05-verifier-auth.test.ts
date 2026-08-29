/**
 * S33-PLAT-05 verifier auth regression.
 *
 * This test executes the real verifier against the deployed service. It gives
 * the verifier a real RN-scoped key and an intentionally invalid MCP-scoped
 * value; a successful public POST/SSE therefore proves the live path uses RN.
 */
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';

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

type VerifierOutput = { stdout: string; stderr: string; code: number };

async function runVerifier(mode: 'live' | 'post-chat-invalid-stream'): Promise<VerifierOutput> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOLO_KEY_MCP: 's33-invalid-mcp-scope',
    S33_HOLOCRON_HOST: process.env.S33_HOLOCRON_HOST ?? 'holocron@holocron',
    S33_REQUEST_HOST: process.env.S33_REQUEST_HOST ?? 'inference1',
    S33_EXPECTED_MAIN_SHA: expectedMain,
    S33_RELEASE_LOCK: releaseLock,
  };
  delete env.HOLO_KEY_RN;
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(
      '/opt/homebrew/bin/bash',
      ['scripts/verify-s33-mini-served-turn.sh', '--mode', mode, '--json'],
      { cwd: process.cwd(), env, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    const append = (target: 'stdout' | 'stderr', chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > 10 * 1024 * 1024) {
        child.kill('SIGTERM');
        rejectProcess(new Error(`${mode} verifier exceeded the output limit`));
        return;
      }
      if (target === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };
    child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));
    child.once('error', rejectProcess);
    child.once('close', (code) => resolveProcess({ stdout, stderr, code: code ?? -1 }));
    child.stdin.end(`${rnKey}\n`);
  });
}

describe('S33-PLAT-05 deployed verifier auth', () => {
  it('uses RN scope for the real public POST and SSE, not MCP scope', async () => {
    const output = await runVerifier('live');

    expect(output.stderr).toBe('');
    expect(output.stdout).not.toContain(rnKey);
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

  it('rejects a truncated private copy of a real public SSE stream after a real POST', async () => {
    const output = await runVerifier('post-chat-invalid-stream');

    expect(output.stderr).toBe('');
    expect(output.stdout).not.toContain(rnKey);
    expect(output.code).not.toBe(0);
    const receipt = JSON.parse(output.stdout) as Record<string, unknown>;
    expect(receipt).toMatchObject({
      ok: false,
      error_code: 'CHAT_STREAM_PARSE_FAILED',
      chat_request_issued: true,
      public_post_succeeded: true,
      failure_stage: 'stream-response-parse',
      stream_capture_source: 'real-public-stream',
      response_mutation: 'truncate-first-sse-json-in-private-copy',
      receipt_source: 'scripts/verify-s33-mini-served-turn.sh',
      verifier_mode: 'post-chat-invalid-stream',
      synthetic: false,
      network_mutation_performed: false,
      literal_disconnect_claimed: false,
      credential_contract: {
        public_key_name: 'HOLO_KEY_RN',
        mcp_key_used_for_public_request: false,
        curl_config_values_quoted: true,
        secret_transport: 'ssh-stdin-private-0600-temp-curl-config',
        private_temp_config_removed: true,
        secret_in_argv: false,
        secret_in_stdout: false,
        secret_in_stderr: false,
        secret_in_receipt: false,
        secret_in_artifact: false,
      },
    });
    expect(receipt.public_post_http_status).toEqual(expect.any(Number));
    expect(Number(receipt.public_post_http_status)).toBeGreaterThanOrEqual(200);
    expect(Number(receipt.public_post_http_status)).toBeLessThan(300);
    expect(receipt.chat_run_id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/i));
  }, 300_000);
});
