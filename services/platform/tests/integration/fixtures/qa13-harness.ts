/**
 * GATE-FIX-S28R3-QA14 — isolated script harness for unit tests.
 * Production scripts never accept fixture providers or test seams.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const ACCOUNT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
export const BUCKET = 'holocron-backup';
export const PREFIX = 'pgbackrest';
export const SCOPE_IN = 'pgbackrest/qa-fixture-object.bin';
export const SCOPE_OUT = 'scope-control/out-of-prefix-object.bin';

export type HarnessPaths = {
  root: string;
  prove: string;
  provision: string;
  runner: string;
  verify: string;
};

export function makeHarness(repoRoot: string, evidenceDir: string): HarnessPaths {
  mkdirSync(evidenceDir, { recursive: true });
  const harnessRoot = resolve(
    evidenceDir,
    `harness-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const fixtureCurl = resolve(repoRoot, 'services/platform/tests/integration/fixtures/bin/curl');
  const maker = resolve(repoRoot, 'scripts/test-harness/make-r2-ro-test-harness.sh');
  const run = spawnSync('bash', [maker, harnessRoot, fixtureCurl], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (run.status !== 0) {
    throw new Error(`make harness failed: ${run.stderr || run.stdout}`);
  }
  const out = (run.stdout || '').trim().split('\n').filter(Boolean).pop() || harnessRoot;
  const root =
    out.endsWith(harnessRoot) || existsSync(resolve(out, 'scripts/prove-r2-readonly.sh'))
      ? out
      : harnessRoot;
  const paths: HarnessPaths = {
    root,
    prove: resolve(root, 'scripts/prove-r2-readonly.sh'),
    provision: resolve(root, 'scripts/provision-fresh-restore-target.sh'),
    runner: resolve(root, 'scripts/run-fire-drill-on-fresh-target.sh'),
    verify: resolve(repoRoot, 'scripts/verify-restore-creds.sh'),
  };
  for (const p of [paths.prove, paths.provision, paths.runner]) {
    if (!existsSync(p))
      throw new Error(`harness missing ${p}\nstdout=${run.stdout}\nstderr=${run.stderr}`);
  }
  return paths;
}

function mapAwsMockMode(mode: string | undefined): string {
  switch (mode) {
    case 'list_fail':
      return 'list_fail';
    case 'prefix_empty':
      return 'prefix_empty';
    case 'head_fail':
      return 'head_fail';
    case 'canary_error':
      return 'canary_error';
    case 'canary_success':
      return 'canary_success';
    case 'broader_read':
    case 'oop_allowed':
    case 'put_allowed':
    case 'delete_allowed':
      return mode === 'oop_allowed' ? 'broader_read' : mode;
    default:
      return 'default';
  }
}

export function baseHarnessEnv(repoRoot: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const fixBin = resolve(repoRoot, 'services/platform/tests/integration/fixtures/bin');
  const mockMode =
    extra.HOLO_R2_PROVIDER_MOCK_MODE || mapAwsMockMode(extra.HOLO_AWS_MOCK_MODE) || 'default';
  return {
    ...process.env,
    HOLO_TRUSTED_AWS_BIN: '',
    HOLO_TRUSTED_CURL_BIN: '',
    PATH: `${fixBin}:${process.env.PATH ?? ''}`,
    HOLOCRON_SECRETS_PATH: '/nonexistent-s28r3-qa-harness',
    HOLO_SECRETS_PATH: '/nonexistent-s28r3-qa-harness',
    CLOUDFLARE_API_TOKEN: '',
    R2_PARENT_ACCESS_KEY_ID: '',
    R2_PARENT_SECRET_ACCESS_KEY: '',
    R2_ACCOUNT_ID: ACCOUNT_ID,
    R2_ENDPOINT: ENDPOINT,
    R2_BUCKET_NAME: BUCKET,
    R2_PGBACKREST_PREFIX: PREFIX,
    R2_RESTORE_OBJECT_PREFIX: PREFIX,
    R2_CREDENTIAL_KIND: 'object-read-only',
    R2_SCOPE_PROBE_IN_KEY: SCOPE_IN,
    R2_SCOPE_PROBE_OUT_KEY: SCOPE_OUT,
    ...extra,
    HOLO_R2_PROVIDER_MOCK_MODE: mockMode,
  };
}
