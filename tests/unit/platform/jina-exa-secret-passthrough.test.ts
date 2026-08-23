/**
 * Wave 1 T1 — JINA_API_KEY / EXA_API_KEY passthrough source audits.
 *
 * Pure filesystem + module assertions (no live secret values printed).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REQUIRED_SECRET_KEYS } from '../../../services/platform/src/config/secrets.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

function readRepo(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

describe('JINA_API_KEY / EXA_API_KEY passthrough', () => {
  it('REQUIRED_SECRET_KEYS includes both names', () => {
    expect(REQUIRED_SECRET_KEYS).toEqual(expect.arrayContaining(['JINA_API_KEY', 'EXA_API_KEY']));
  });

  it('secrets.example.yaml documents both as placeholders only', () => {
    const example = readRepo('services/platform/config/secrets.example.yaml');
    expect(example).toMatch(/^JINA_API_KEY:\s*replace-me-/m);
    expect(example).toMatch(/^EXA_API_KEY:\s*replace-me-/m);
    expect(example).not.toMatch(/^JINA_API_KEY:\s*jina_[A-Za-z0-9]/m);
  });

  it('compose.yaml mastra env uses non-strict ${VAR} (not ${VAR:?})', () => {
    const compose = readRepo('services/platform/deploy/compose/compose.yaml');
    expect(compose).toMatch(/JINA_API_KEY:\s*\$\{JINA_API_KEY\}/);
    expect(compose).toMatch(/EXA_API_KEY:\s*\$\{EXA_API_KEY\}/);
    expect(compose).not.toMatch(/JINA_API_KEY:\s*\$\{JINA_API_KEY:\?/);
    expect(compose).not.toMatch(/EXA_API_KEY:\s*\$\{EXA_API_KEY:\?/);
  });

  it('production-release render map pins both to stage-render-placeholder', () => {
    const release = readRepo('services/platform/src/deploy/production-release.ts');
    expect(release).toMatch(/JINA_API_KEY:\s*'stage-render-placeholder'/);
    expect(release).toMatch(/EXA_API_KEY:\s*'stage-render-placeholder'/);
  });

  it('production.env.example lists both as commented names-only', () => {
    const envExample = readRepo('services/platform/deploy/compose/production.env.example');
    expect(envExample).toMatch(/^# JINA_API_KEY=$/m);
    expect(envExample).toMatch(/^# EXA_API_KEY=$/m);
  });

  it('ci-integration.yml wires secrets and fail-closed guards for both', () => {
    const ci = readRepo('.github/workflows/ci-integration.yml');
    expect(ci).toMatch(/JINA_API_KEY:\s*\$\{\{\s*secrets\.JINA_API_KEY\s*\}\}/);
    expect(ci).toMatch(/EXA_API_KEY:\s*\$\{\{\s*secrets\.EXA_API_KEY\s*\}\}/);
    expect(ci).toMatch(
      /if \[ -z "\$\{JINA_API_KEY:-\}" \]; then\s*\n\s*echo "JINA_API_KEY required — fail closed \(no mocks\)"/
    );
    expect(ci).toMatch(
      /if \[ -z "\$\{EXA_API_KEY:-\}" \]; then\s*\n\s*echo "EXA_API_KEY required — fail closed \(no mocks\)"/
    );
  });

  it('.env.example includes EXA_API_KEY placeholder alongside JINA', () => {
    const envExample = readRepo('.env.example');
    expect(envExample).toMatch(/^JINA_API_KEY=/m);
    expect(envExample).toMatch(/^EXA_API_KEY=/m);
  });
});
