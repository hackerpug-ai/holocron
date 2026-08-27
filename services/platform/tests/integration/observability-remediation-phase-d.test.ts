/**
 * OBS remediation — phase D focused tests (D1 backup coverage).
 *
 *   D1a The pgBackRest topology template targets compose-network service
 *       names, not the stale 127.0.0.1:44112 host port (compose publishes no
 *       database host ports — only the edge at 127.0.0.1:44111).
 *   D1b A [langfuse] stanza covers the Langfuse application database.
 *   D1c `backup:langfuse` can resolve the production compose project
 *       fail-closed (operator gate + required endpoint env, never guessed).
 *
 * Pure static/pure-JS assertions — no docker required. The on-device restore
 * drill is phase E.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  resolveBackupSource,
  runLangfuseConsistentBackup,
} from '../../src/backup/langfuse-backup.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const PGBACKREST_CONF = resolve(REPO_ROOT, 'services/platform/deploy/compose/pgbackrest.conf');
const COMPOSE_PATH = resolve(REPO_ROOT, 'services/platform/deploy/compose/compose.yaml');

function confSection(name: string): string {
  const conf = readFileSync(PGBACKREST_CONF, 'utf8');
  const match = conf.match(new RegExp(`\\[${name}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
  return match?.[1] ?? '';
}

describe('D1 — pgBackRest topology template', () => {
  it('targets the compose-network postgres, not a stale host port', () => {
    const conf = readFileSync(PGBACKREST_CONF, 'utf8');
    expect(conf).not.toContain('44112');
    expect(confSection('main')).toContain('pg1-host=postgres');
    expect(confSection('main')).toContain('pg1-port=5432');
    expect(confSection('main')).toContain('pg1-user=holocron');
    expect(confSection('main')).toContain('pg1-database=holocron');
  });

  it('adds a [langfuse] stanza covering the Langfuse database', () => {
    const stanza = confSection('langfuse');
    expect(stanza).toContain('pg1-host=langfuse-postgres');
    expect(stanza).toContain('pg1-port=5432');
    expect(stanza).toContain('pg1-path=/var/lib/postgresql/data');
    expect(stanza).toContain('pg1-user=langfuse');
    expect(stanza).toContain('pg1-database=langfuse');
  });

  it('keeps the non-secret global contract (cipher, retention, placeholder endpoint)', () => {
    const conf = readFileSync(PGBACKREST_CONF, 'utf8');
    expect(conf).toContain('repo1-cipher-type=aes-256-cbc');
    expect(conf).toContain('repo1-retention-full=4');
    expect(conf).toContain('repo1-retention-diff=14');
    expect(conf).toContain('example.invalid.r2.cloudflarestorage.com');
  });
});

describe('D1 — compose publishes no database host ports', () => {
  it('only the edge publishes 127.0.0.1:44111', () => {
    const compose = parseYaml(readFileSync(COMPOSE_PATH, 'utf8')) as {
      services: Record<string, { ports?: unknown[] }>;
    };
    const published: string[] = [];
    for (const [name, service] of Object.entries(compose.services ?? {})) {
      for (const entry of service.ports ?? []) {
        published.push(`${name}: ${String(entry)}`);
      }
    }
    expect(published).toEqual(['edge: 127.0.0.1:44111:44111']);
  });
});

describe('D1 — resolveBackupSource', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the canary source unchanged', () => {
    const canary = resolveBackupSource('obs01-canary');
    expect(canary.webBaseUrl).toBe('http://127.0.0.1:13100');
    expect(canary.publicKey).toBe('pk-lf-obs01-canary-public');
    expect(canary.postgresContainer).toBe('obs01-canary-langfuse-postgres-1');
    expect(canary.otelContainer).toBe('obs01-canary-otel-collector-1');
  });

  it('fails closed on production without endpoint env (lists every required name)', () => {
    expect(() => resolveBackupSource('holocron-production', {})).toThrow(
      /HOLO_LANGFUSE_PUBLIC_BASE_URL/
    );
    const message = (() => {
      try {
        resolveBackupSource('holocron-production', {});
      } catch (error) {
        return String(error);
      }
      return '';
    })();
    expect(message).toContain('LANGFUSE_PUBLIC_KEY');
    expect(message).toContain('LANGFUSE_SECRET_KEY');
  });

  it('resolves the production compose containers from env (trailing slash stripped)', () => {
    const source = resolveBackupSource('holocron-production', {
      HOLO_LANGFUSE_PUBLIC_BASE_URL: 'https://holocron.tail011a51.ts.net:44111/observability/',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-production',
      LANGFUSE_SECRET_KEY: 'sk-lf-production',
    });
    expect(source.webBaseUrl).toBe('https://holocron.tail011a51.ts.net:44111/observability');
    expect(source.clickhouseContainer).toBe('holocron-production-langfuse-clickhouse-1');
    expect(source.postgresContainer).toBe('holocron-production-langfuse-postgres-1');
    expect(source.minioContainer).toBe('holocron-production-langfuse-minio-1');
    expect(source.otelContainer).toBe('holocron-production-otel-collector-1');
  });

  it('rejects unknown projects', () => {
    expect(() => resolveBackupSource('some-random-project')).toThrow(/unsupported/);
  });
});

describe('D1 — production backup operator gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses holocron-production without HOLO_PRODUCTION_BACKUP_AUTHORIZE (no docker needed)', async () => {
    await expect(
      runLangfuseConsistentBackup({
        evidenceDir: resolve(REPO_ROOT, '.tmp/d1-gate-test'),
        sourceProject: 'holocron-production',
      })
    ).rejects.toThrow(/operator gate/);
  });

  it('still refuses other production-ish project names outright', async () => {
    await expect(
      runLangfuseConsistentBackup({
        evidenceDir: resolve(REPO_ROOT, '.tmp/d1-gate-test'),
        sourceProject: 'shadow-production-copy',
      })
    ).rejects.toThrow(/refusing/);
  });

  it('authorized but missing endpoint env fails closed listing the env names', async () => {
    vi.stubEnv('HOLO_PRODUCTION_BACKUP_AUTHORIZE', '1');
    await expect(
      runLangfuseConsistentBackup({
        evidenceDir: resolve(REPO_ROOT, '.tmp/d1-gate-test'),
        sourceProject: 'holocron-production',
      })
    ).rejects.toThrow(/HOLO_LANGFUSE_PUBLIC_BASE_URL/);
  });
});
