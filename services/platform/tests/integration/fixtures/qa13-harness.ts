/**
 * GATE-FIX-S28R3-QA13 — isolated script harness for unit tests.
 * Production scripts never accept fixture providers; tests copy and pin fixtures.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const ACCOUNT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
export const BUCKET = 'holocron-backup';
export const PREFIX = 'pgbackrest';

export type HarnessPaths = {
  root: string;
  prove: string;
  provision: string;
  runner: string;
  verify: string;
  trustedAws: string;
  trustedCurl: string;
};

export function makeHarness(repoRoot: string, evidenceDir: string): HarnessPaths {
  mkdirSync(evidenceDir, { recursive: true });
  const harnessRoot = resolve(
    evidenceDir,
    `harness-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const fixtureAws = resolve(repoRoot, 'services/platform/tests/integration/fixtures/bin/aws');
  const fixtureCurl = resolve(repoRoot, 'services/platform/tests/integration/fixtures/bin/curl');
  const maker = resolve(repoRoot, 'scripts/test-harness/make-r2-ro-test-harness.sh');
  const run = spawnSync('bash', [maker, harnessRoot, fixtureAws, fixtureCurl], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (run.status !== 0) {
    throw new Error(`make harness failed: ${run.stderr || run.stdout}`);
  }
  const paths: HarnessPaths = {
    root: harnessRoot,
    prove: resolve(harnessRoot, 'scripts/prove-r2-readonly.sh'),
    provision: resolve(harnessRoot, 'scripts/provision-fresh-restore-target.sh'),
    runner: resolve(harnessRoot, 'scripts/run-fire-drill-on-fresh-target.sh'),
    verify: resolve(repoRoot, 'scripts/verify-restore-creds.sh'),
    trustedAws: fixtureAws,
    trustedCurl: fixtureCurl,
  };
  for (const p of [paths.prove, paths.provision, paths.runner]) {
    if (!existsSync(p)) throw new Error(`harness missing ${p}`);
  }
  return paths;
}

export function baseHarnessEnv(repoRoot: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const fixBin = resolve(repoRoot, 'services/platform/tests/integration/fixtures/bin');
  return {
    ...process.env,
    // Production path ignores HOLO_TRUSTED_*; keep unset for honesty.
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
    HOLO_AWS_MOCK_MODE: 'default',
    ...extra,
  };
}
