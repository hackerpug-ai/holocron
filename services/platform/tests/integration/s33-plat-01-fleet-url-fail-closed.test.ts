import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runtimeSecrets } from '../../src/deploy/production-deploy.ts';

const EXPLICIT_FLEET_URL = 'http://host.docker.internal:4545';
const LOOPBACK_FLEET_URL = 'http://127.0.0.1:4545/v1';
const SECRET_FIXTURE = {
  MASTRA_API_KEY: 'm'.repeat(43),
  FLEET_KEY: 'f'.repeat(43),
  HOLO_KEY_MCP: 'h'.repeat(43),
} as const;

const temporaryRoots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'holocron-s33-plat-01-'));
  temporaryRoots.push(root);
  return root;
}

function writeFixture(root: string, fleetUrl?: string): string {
  const secretsPath = join(root, 'secrets.yaml');
  const lines = Object.entries(SECRET_FIXTURE).map(([key, value]) => `${key}: ${value}`);
  if (fleetUrl !== undefined) lines.push(`FLEET_URL: ${fleetUrl}`);
  writeFileSync(secretsPath, `${lines.join('\n')}\n`, { mode: 0o600 });
  return secretsPath;
}

function runtimePath(root: string): string {
  return join(root, 'runtime', 'secrets.json');
}

function withoutAmbientFleetConfig<T>(callback: () => T): T {
  const previous = {
    FLEET_URL: process.env.FLEET_URL,
    FLEET_URL_ALLOW_HOST_LOOPBACK: process.env.FLEET_URL_ALLOW_HOST_LOOPBACK,
    MASTRA_API_KEY: process.env.MASTRA_API_KEY,
    FLEET_KEY: process.env.FLEET_KEY,
    HOLO_KEY_MCP: process.env.HOLO_KEY_MCP,
  };
  for (const key of Object.keys(previous)) delete process.env[key];
  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('S33-PLAT-01 fleet URL resolution', () => {
  it('fails closed when FLEET_URL is absent and leaves no runtime secrets file', () => {
    const root = fixtureRoot();
    const secretsPath = writeFixture(root);
    const runtimeSecretsPath = runtimePath(root);

    withoutAmbientFleetConfig(() => {
      expect(() => runtimeSecrets({ secretsPath, runtimeSecretsPath })).toThrow(
        /FLEET_URL_REQUIRED/
      );
    });
    expect(existsSync(runtimeSecretsPath)).toBe(false);
  });

  it('persists an explicit host.docker.internal endpoint byte-identically', () => {
    const root = fixtureRoot();
    const secretsPath = writeFixture(root, EXPLICIT_FLEET_URL);
    const runtimeSecretsPath = runtimePath(root);

    const values = withoutAmbientFleetConfig(() =>
      runtimeSecrets({ secretsPath, runtimeSecretsPath })
    );
    const persisted = JSON.parse(readFileSync(runtimeSecretsPath, 'utf8')) as Record<
      string,
      string
    >;

    expect(values.FLEET_URL).toBe(EXPLICIT_FLEET_URL);
    expect(persisted.FLEET_URL).toBe(EXPLICIT_FLEET_URL);
    expect(Object.keys(persisted).sort()).toEqual([
      'DATABASE_URL',
      'FLEET_KEY',
      'FLEET_URL',
      'MASTRA_API_KEY',
      'POSTGRES_PASSWORD',
      'ZERO_ADMIN_PASSWORD',
    ]);
    expect(statSync(runtimeSecretsPath).mode & 0o777).toBe(0o600);
  });

  it('refuses loopback without an explicit co-location opt-in and leaves no file', () => {
    const root = fixtureRoot();
    const secretsPath = writeFixture(root, LOOPBACK_FLEET_URL);
    const runtimeSecretsPath = runtimePath(root);

    withoutAmbientFleetConfig(() => {
      expect(() => runtimeSecrets({ secretsPath, runtimeSecretsPath })).toThrow(
        /FLEET_URL_LOOPBACK_REFUSED.*127\.0\.0\.1.*host\.docker\.internal/
      );
    });
    expect(existsSync(runtimeSecretsPath)).toBe(false);
  });

  it('preserves the URL-credentials refusal and leaves no file', () => {
    const root = fixtureRoot();
    const secretsPath = writeFixture(root, 'http://operator:password@host.docker.internal:4545');
    const runtimeSecretsPath = runtimePath(root);

    withoutAmbientFleetConfig(() => {
      expect(() => runtimeSecrets({ secretsPath, runtimeSecretsPath })).toThrow(
        /FLEET_URL must not contain URL credentials/
      );
    });
    expect(existsSync(runtimeSecretsPath)).toBe(false);
  });

  it('requires an auditable opt-in before accepting a loopback endpoint', () => {
    const root = fixtureRoot();
    const secretsPath = writeFixture(root, LOOPBACK_FLEET_URL);
    const runtimeSecretsPath = runtimePath(root);

    withoutAmbientFleetConfig(() => {
      process.env.FLEET_URL_ALLOW_HOST_LOOPBACK = '1';
      const values = runtimeSecrets({ secretsPath, runtimeSecretsPath });
      expect(values.FLEET_URL).toBe(LOOPBACK_FLEET_URL);
    });
    expect(existsSync(runtimeSecretsPath)).toBe(true);
  });
});
