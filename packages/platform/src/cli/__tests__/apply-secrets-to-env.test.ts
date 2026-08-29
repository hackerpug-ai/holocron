/**
 * RH-1 — applyConsolidatedSecretsToEnv unit coverage.
 *
 * Env wins over file; missing keys are filled from secrets.yaml.
 * Never overwrites non-empty process.env values.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyConsolidatedSecretsToEnv, REQUIRED_SECRET_KEYS } from '../../config/secrets.ts';

function writeSecrets(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'holo-secrets-'));
  const path = join(dir, 'secrets.yaml');
  writeFileSync(path, body, 'utf8');
  return path;
}

describe('applyConsolidatedSecretsToEnv (RH-1)', () => {
  it('REQUIRED_SECRET_KEYS includes JINA_API_KEY and EXA_API_KEY', () => {
    expect(REQUIRED_SECRET_KEYS).toEqual(expect.arrayContaining(['JINA_API_KEY', 'EXA_API_KEY']));
  });

  it('fills missing HOLO_KEY_* from secrets file into env bag', () => {
    const secretsPath = writeSecrets(`
HOLO_KEY_RN: rn-from-file
HOLO_KEY_MCP: mcp-from-file
HOLO_KEY_CONTROL: ctl-from-file
DATABASE_URL: postgres://file/holocron
FLEET_KEY: fleet-from-file
`);
    const env: NodeJS.ProcessEnv = {
      // launchd-like clean env — only non-auth keys
      DATABASE_URL: 'postgres://127.0.0.1:5432/holocron',
      PORT: '4111',
      FLEET_URL: 'http://127.0.0.1:4545/v1',
    };

    const result = applyConsolidatedSecretsToEnv({ secretsPath, env });

    expect(env.HOLO_KEY_RN).toBe('rn-from-file');
    expect(env.HOLO_KEY_MCP).toBe('mcp-from-file');
    expect(env.HOLO_KEY_CONTROL).toBe('ctl-from-file');
    expect(env.FLEET_KEY).toBe('fleet-from-file');
    // env wins for DATABASE_URL already set
    expect(env.DATABASE_URL).toBe('postgres://127.0.0.1:5432/holocron');
    expect(result.applied).toEqual(
      expect.arrayContaining(['HOLO_KEY_RN', 'HOLO_KEY_MCP', 'HOLO_KEY_CONTROL', 'FLEET_KEY'])
    );
    expect(result.skipped).toContain('DATABASE_URL');
  });

  it('never overwrites non-empty env values (env-over-file)', () => {
    const secretsPath = writeSecrets(`
HOLO_KEY_RN: file-rn
MASTRA_API_KEY: file-mastra
`);
    const env: NodeJS.ProcessEnv = {
      HOLO_KEY_RN: 'env-rn',
    };

    const result = applyConsolidatedSecretsToEnv({ secretsPath, env });

    expect(env.HOLO_KEY_RN).toBe('env-rn');
    expect(env.MASTRA_API_KEY).toBe('file-mastra');
    expect(result.skipped).toContain('HOLO_KEY_RN');
    expect(result.applied).toContain('MASTRA_API_KEY');
  });

  it('treats empty-string env as unset and fills from file', () => {
    const secretsPath = writeSecrets(`HOLO_KEY_RN: file-rn\n`);
    const env: NodeJS.ProcessEnv = {
      HOLO_KEY_RN: '   ',
    };

    applyConsolidatedSecretsToEnv({ secretsPath, env });
    expect(env.HOLO_KEY_RN).toBe('file-rn');
  });

  it('no-ops when secrets file is missing (fail-closed auth still applies)', () => {
    const env: NodeJS.ProcessEnv = {};
    const result = applyConsolidatedSecretsToEnv({
      secretsPath: join(tmpdir(), 'no-such-holo-secrets-file.yaml'),
      env,
    });
    expect(result.fileExists).toBe(false);
    expect(result.applied).toEqual([]);
    expect(env.HOLO_KEY_RN).toBeUndefined();
  });

  it('respects keys filter when provided', () => {
    const secretsPath = writeSecrets(`
HOLO_KEY_RN: rn
HOLO_KEY_MCP: mcp
FLEET_KEY: fleet
`);
    const env: NodeJS.ProcessEnv = {};
    applyConsolidatedSecretsToEnv({
      secretsPath,
      env,
      keys: ['HOLO_KEY_RN'],
    });
    expect(env.HOLO_KEY_RN).toBe('rn');
    expect(env.HOLO_KEY_MCP).toBeUndefined();
    expect(env.FLEET_KEY).toBeUndefined();
  });

  it('uses HOLO_SECRETS_PATH by default so service boot cannot fall back to operator secrets', () => {
    const secretsPath = writeSecrets(`
FLEET_KEY: isolated-fleet-key
HOLO_KEY_CONTROL: isolated-control-key
`);
    const env: NodeJS.ProcessEnv = {
      HOLO_SECRETS_PATH: secretsPath,
    };

    const result = applyConsolidatedSecretsToEnv({ env });

    expect(result.secretsPath).toBe(secretsPath);
    expect(env.FLEET_KEY).toBe('isolated-fleet-key');
    expect(env.HOLO_KEY_CONTROL).toBe('isolated-control-key');
  });
});
