/**
 * R2 bucket + scoped credentials + pgBackRest repo bootstrap (D04-02).
 *
 * Proves AC-1/AC-2/AC-3 against real Cloudflare R2 (no mocks):
 *   - Create encrypted (SSE-AES256) bucket (versioning residual when R2 NotImplemented)
 *   - Resolve bucket-only object-read-write credentials (no Resource *, no s3:*)
 *   - Write ONLY those scoped runtime keys into pgBackRest conf + secrets store
 *   - Never write multi-bucket parent admin keys into pgBackRest conf
 *   - Run stanza-create / check against real R2
 *
 * Credentials land in secrets.yaml via upsert — never logged, never committed.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  defaultSecretsPath,
  getSecretValue,
  loadSecretsFile,
  resolveRepoRoot,
  type SecretsMap,
} from '../config/secrets.ts';
import {
  type BackupConfig,
  defaultPg1Path,
  defaultPgbackrestConfigPath,
  defaultPgbackrestPrefix,
  defaultStanza,
  endpointHost,
  formatCredentialPolicy,
  r2EndpointForAccount,
} from './config.ts';

/** Cloudflare permission group: Workers R2 Storage Bucket Item Write (bucket-scoped). */
const CF_PERM_R2_BUCKET_ITEM_WRITE = '2efd5506f9c8494dacb1fa10a3e7d5b6';
/** Cloudflare permission group: Workers R2 Storage Bucket Item Read (bucket-scoped). */
const CF_PERM_R2_BUCKET_ITEM_READ = '6a018a9f2fc74eb6b293b0c548f38b39';

/**
 * GATE-FIX-S28R3-QA23: trust-chain validate absolute root-owned executables.
 * No PATH/Homebrew discovery while credentials ambient.
 */
function validateRootOwnedBin(candidate: string): string | null {
  const cand = candidate.trim();
  if (!cand.startsWith('/')) return null;
  try {
    const parts = cand.split('/').filter(Boolean);
    let path = '';
    for (const part of parts) {
      path = `${path}/${part}`;
      let st = lstatSync(path);
      if (st.isSymbolicLink()) {
        const real = realpathSync(path);
        st = lstatSync(real);
      }
      const mode = st.mode & 0o777;
      if (st.uid !== 0) return null;
      if (mode & 0o022) return null;
    }
    const finalPath = realpathSync(cand);
    const st = lstatSync(finalPath);
    if (!st.isFile()) return null;
    if (st.uid !== 0) return null;
    if ((st.mode & 0o111) === 0) return null;
    if ((st.mode & 0o022) !== 0) return null;
    return finalPath;
  } catch {
    return null;
  }
}

function resolveTrustedPgbackrestBin(env?: NodeJS.ProcessEnv): string | null {
  const fromEnv = env?.PGBACKREST_BIN?.trim();
  if (fromEnv) {
    const t = validateRootOwnedBin(fromEnv);
    if (t) return t;
  }
  for (const candidate of ['/usr/local/bin/pgbackrest', '/usr/bin/pgbackrest']) {
    const t = validateRootOwnedBin(candidate);
    if (t) return t;
  }
  return null;
}

/**
 * GATE-FIX-S28R3-QA24: absolute root-owned AWS CLI only (no PATH/Homebrew shadow
 * while R2 credentials are ambient). Prefer AWS_BIN env when it passes trust chain.
 */
function resolveTrustedAwsBin(env?: NodeJS.ProcessEnv): string | null {
  const fromEnv = env?.AWS_BIN?.trim() || env?.HOLO_TRUSTED_AWS_BIN?.trim();
  if (fromEnv) {
    const t = validateRootOwnedBin(fromEnv);
    if (t) return t;
  }
  for (const candidate of ['/usr/local/bin/aws', '/usr/bin/aws']) {
    const t = validateRootOwnedBin(candidate);
    if (t) return t;
  }
  return null;
}

/**
 * GATE-FIX-S28R3-QA25: absolute psql for archive setup — never bare PATH `psql`.
 * Prefer root-owned; fixed absolute Homebrew/system candidates for local Postgres.
 */
function resolvePsqlBin(env?: NodeJS.ProcessEnv): string {
  const e = env ?? process.env;
  const fromEnv = e.PSQL_BIN?.trim() || e.POSTGRES_PSQL?.trim();
  if (fromEnv) {
    const trusted = validateRootOwnedBin(fromEnv);
    if (trusted) return trusted;
    if (fromEnv.startsWith('/') && existsSync(fromEnv)) return fromEnv;
  }
  for (const candidate of ['/usr/local/bin/psql', '/usr/bin/psql'] as const) {
    const t = validateRootOwnedBin(candidate);
    if (t) return t;
  }
  for (const c of [
    '/opt/homebrew/opt/postgresql@18/bin/psql',
    '/usr/local/opt/postgresql@18/bin/psql',
    '/opt/homebrew/bin/psql',
    '/usr/lib/postgresql/18/bin/psql',
  ] as const) {
    if (existsSync(c)) return c;
  }
  return '/usr/bin/psql';
}

export type ProvisionOptions = {
  /** Target backup bucket (default holocron-backup). */
  bucketName?: string;
  accountId?: string;
  /** Cloudflare API token with R2 write (admin). */
  cloudflareApiToken?: string;
  /** Parent R2 S3 access key used only to mint scoped temp credentials / admin S3 API. */
  parentAccessKeyId?: string;
  parentSecretAccessKey?: string;
  /**
   * Optional durable scoped S3 access key (R2 API token / dashboard token)
   * limited to the backup bucket. Prefer over temporary credentials.
   */
  scopedAccessKeyId?: string;
  scopedSecretAccessKey?: string;
  secretsPath?: string;
  pg1Path?: string;
  stanza?: string;
  pgbackrestPrefix?: string;
  pgbackrestConfigPath?: string;
  /** Skip stanza-create (config only). Default false. */
  skipStanzaCreate?: boolean;
  /** Temp credential TTL seconds (max ~7d on R2). Default 604800. */
  credentialTtlSeconds?: number;
  /** Bucket used for negative ACL probe (must DENY). Default laneshadow. */
  negativeAclBucket?: string;
  env?: NodeJS.ProcessEnv;
};

export type RuntimeCredentialKind = 'durable' | 'temporary';

export type ProvisionResult = {
  ok: boolean;
  bucketName: string;
  endpoint: string;
  accountId: string;
  encryption: string | null;
  versioning: string | null;
  /** True when Put/GetBucketVersioning is NotImplemented (R2 platform). */
  versioningNotImplemented: boolean;
  /** Honest residual risks (e.g. R2_VERSIONING_NOT_IMPLEMENTED). */
  residualRisks: string[];
  /** Runtime credential durability: durable API token or temporary session. */
  credentialKind: RuntimeCredentialKind | null;
  /** True when conf s3-key matches secrets R2_ACCESS_KEY_ID and is not parent secret. */
  confMatchesScopedSecrets: boolean | null;
  /** Negative ACL: scoped keys denied on a non-backup bucket (true=denied as expected). */
  negativeAclDenied: boolean | null;
  negativeAclBucket: string | null;
  policyResource: string[];
  policyActions: string[];
  policyHasWildcardResource: boolean;
  policyHasWildcardAction: boolean;
  secretsPath: string;
  secretsWritten: string[];
  pgbackrestConfigPath: string;
  stanza: string;
  stanzaCreateExit: number | null;
  stanzaCreateStdout: string;
  checkExit: number | null;
  checkStdout: string;
  repoObjectsListed: number;
  cipherType: string;
  errors: string[];
};

/** Runtime identity written to secrets + pgBackRest conf (never parent admin). */
export type RuntimeScopedCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | null;
  kind: RuntimeCredentialKind;
  policyJson: string;
  ttlSeconds: number | null;
  source: string;
};

function requireNonEmpty(name: string, value: string | undefined | null): string {
  const v = value?.trim();
  if (!v) throw new Error(`missing required value: ${name}`);
  return v;
}

function run(
  cmd: string,
  args: string[],
  options?: { env?: NodeJS.ProcessEnv; timeoutMs?: number }
): { status: number; stdout: string; stderr: string } {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    env: options?.env ?? process.env,
    timeout: options?.timeoutMs ?? 120_000,
  });
  return {
    status: res.status ?? 1,
    stdout: res.stdout?.toString() ?? '',
    stderr: res.stderr?.toString() ?? '',
  };
}

function awsEnv(creds: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
  endpoint: string;
  env?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  // GATE-FIX-S28R3-QA24: minimal fixed child environment — never clone ambient PATH
  // (hostile PATH must not receive R2 credentials via bare `aws`).
  const base: NodeJS.ProcessEnv = {
    PATH: '/usr/bin:/bin',
    HOME: creds.env?.HOME ?? process.env.HOME ?? '/tmp',
    LC_ALL: 'C',
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    AWS_DEFAULT_REGION: 'auto',
    AWS_EC2_METADATA_DISABLED: 'true',
  };
  if (creds.sessionToken) {
    base.AWS_SESSION_TOKEN = creds.sessionToken;
  }
  return base;
}

/** GATE-FIX-S28R3-QA24: run absolute trusted aws only (never bare PATH `aws`). */
function runAws(
  args: string[],
  creds: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string | null;
    endpoint: string;
    env?: NodeJS.ProcessEnv;
  }
): { status: number; stdout: string; stderr: string } {
  const awsBin = resolveTrustedAwsBin(creds.env);
  if (!awsBin) {
    return {
      status: 127,
      stdout: '',
      stderr:
        'GATE-FIX-S28R3-QA24: no root-owned aws at /usr/local/bin/aws or /usr/bin/aws (refuse PATH/Homebrew)',
    };
  }
  return run(awsBin, args, { env: awsEnv(creds) });
}

function awsJson(
  args: string[],
  creds: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string | null;
    endpoint: string;
    env?: NodeJS.ProcessEnv;
  }
): { ok: boolean; data: unknown; raw: string; status: number } {
  const res = runAws([...args, '--endpoint-url', creds.endpoint, '--output', 'json'], creds);
  const raw = (res.stdout || res.stderr || '').trim();
  if (res.status !== 0) {
    return { ok: false, data: null, raw, status: res.status };
  }
  try {
    return { ok: true, data: raw ? JSON.parse(raw) : {}, raw, status: 0 };
  } catch {
    return { ok: true, data: raw, raw, status: 0 };
  }
}

/** Upsert flat keys into secrets.yaml without rewriting unrelated content values in logs. */
export function upsertSecretsFile(path: string, updates: SecretsMap): string[] {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const existing = existsSync(path) ? loadSecretsFile(path) : {};
  const merged: SecretsMap = { ...existing, ...updates };

  // Preserve a short header; write flat YAML (quoted strings for safety).
  const lines: string[] = [
    '# Holocron consolidated secrets (gitignored). DO NOT COMMIT.',
    '# Written/updated by holo backup:provision and operator tooling.',
    '',
  ];
  for (const key of Object.keys(merged).sort()) {
    const value = merged[key] ?? '';
    // YAML double-quoted escape
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    lines.push(`${key}: "${escaped}"`);
  }
  lines.push('');
  writeFileSync(path, lines.join('\n'), { mode: 0o600 });
  return Object.keys(updates);
}

/** Default Cloudflare API fetch bound (~30s). Overridable via BACKUP_CF_API_TIMEOUT_MS. */
export const DEFAULT_CF_API_TIMEOUT_MS = 30_000;

export type CfApiOptions = {
  /** Explicit timeout (ms). Prefer over env when set. */
  timeoutMs?: number;
  /** Override API origin (tests: blackhole/happy local servers). */
  baseUrl?: string;
  env?: NodeJS.ProcessEnv;
};

export function resolveCfApiTimeoutMs(
  explicit?: number,
  env: NodeJS.ProcessEnv = process.env
): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return Math.trunc(explicit);
  }
  const raw = env.BACKUP_CF_API_TIMEOUT_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return DEFAULT_CF_API_TIMEOUT_MS;
}

export function resolveCfApiBaseUrl(
  explicit?: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const fromOpt = explicit?.trim();
  if (fromOpt) return fromOpt.replace(/\/$/, '');
  const fromEnv = env.BACKUP_CF_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'https://api.cloudflare.com/client/v4';
}

/**
 * Cloudflare client/v4 helper. REDHAT-FIX-S27-24 / R-11:
 * AbortController bounds fetch so a black-holed api.cloudflare.com cannot hang
 * backup:provision forever. Timeout fails closed (throws), never ok:true.
 */
export async function cfApi<T = unknown>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  options?: CfApiOptions
): Promise<{ ok: boolean; status: number; result: T | null; errors: unknown[] }> {
  const env = options?.env ?? process.env;
  const timeoutMs = resolveCfApiTimeoutMs(options?.timeoutMs, env);
  const baseUrl = resolveCfApiBaseUrl(options?.baseUrl, env);
  const urlPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${baseUrl}${urlPath}`;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json()) as {
      success?: boolean;
      result?: T;
      errors?: unknown[];
    };
    return {
      ok: Boolean(json.success),
      status: res.status,
      result: (json.result ?? null) as T | null,
      errors: json.errors ?? [],
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    const msg = err instanceof Error ? err.message : String(err);
    if (name === 'AbortError' || /abort|timeout/i.test(msg)) {
      throw new Error(
        `Cloudflare API request timed out after ${timeoutMs}ms (abort/timeout) path=${path}`,
        { cause: err instanceof Error ? err : undefined }
      );
    }
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    clearTimeout(timer);
  }
}

export type ScopedCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  permission: string;
  bucket: string;
  ttlSeconds: number;
  policyJson: string;
};

/**
 * Mint bucket-scoped object-read-write temporary credentials via Cloudflare R2 API.
 * Policy document enumerates exact bucket ARN + limited actions (no *, no s3:*).
 * NOTE: temporary only (≤7d). Prefer durable R2 API tokens for standing runtime.
 */
export async function mintScopedCredentials(options: {
  accountId: string;
  cloudflareApiToken: string;
  parentAccessKeyId: string;
  bucketName: string;
  ttlSeconds?: number;
  prefixes?: string[];
  /**
   * R2 temporary credential permission.
   * - object-read-write: backup writer (default; D04-02)
   * - object-read-only: restore-target List/Get only (D05-03 AC-2)
   */
  permission?: 'object-read-write' | 'object-read-only';
}): Promise<ScopedCredentials> {
  const ttlSeconds = options.ttlSeconds ?? 604_800; // 7d (R2 accepted max probe)
  const permission = options.permission ?? 'object-read-write';
  const policyJson =
    permission === 'object-read-only'
      ? JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'HolocronRestoreList',
              Effect: 'Allow',
              Action: ['s3:ListBucket', 's3:GetBucketLocation'],
              Resource: [`arn:aws:s3:::${options.bucketName}`],
            },
            {
              Sid: 'HolocronRestoreGet',
              Effect: 'Allow',
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${options.bucketName}/*`],
            },
          ],
        })
      : formatCredentialPolicy(options.bucketName);
  const body: Record<string, unknown> = {
    bucket: options.bucketName,
    parentAccessKeyId: options.parentAccessKeyId,
    permission,
    ttlSeconds,
  };
  if (options.prefixes && options.prefixes.length > 0) {
    body.prefixes = options.prefixes;
  }
  const res = await cfApi<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  }>(
    options.cloudflareApiToken,
    'POST',
    `/accounts/${options.accountId}/r2/temp-access-credentials`,
    body
  );
  if (!res.ok || !res.result?.accessKeyId || !res.result?.secretAccessKey) {
    throw new Error(
      `failed to mint scoped R2 credentials: ${JSON.stringify(res.errors).slice(0, 300)}`
    );
  }
  return {
    accessKeyId: res.result.accessKeyId,
    secretAccessKey: res.result.secretAccessKey,
    sessionToken: res.result.sessionToken,
    permission,
    bucket: options.bucketName,
    ttlSeconds,
    policyJson,
  };
}

/**
 * Create a durable Cloudflare API token scoped to a single R2 bucket and derive
 * S3 Access Key ID / Secret (SHA-256 of token value) per R2 auth docs.
 * Requires API Tokens Write on the calling Cloudflare token.
 */
export async function createDurableScopedR2Token(options: {
  accountId: string;
  cloudflareApiToken: string;
  bucketName: string;
  tokenName?: string;
}): Promise<RuntimeScopedCredentials | null> {
  const policyJson = formatCredentialPolicy(options.bucketName);
  const resources = {
    [`com.cloudflare.edge.r2.bucket.${options.accountId}_default_${options.bucketName}`]: '*',
  };
  const body = {
    name: options.tokenName || `holocron-backup-pgbackrest-${options.bucketName}`,
    policies: [
      {
        effect: 'allow',
        resources,
        permission_groups: [
          { id: CF_PERM_R2_BUCKET_ITEM_WRITE },
          { id: CF_PERM_R2_BUCKET_ITEM_READ },
        ],
      },
    ],
  };

  const paths = ['/user/tokens', `/accounts/${options.accountId}/tokens`] as const;

  for (const path of paths) {
    const res = await cfApi<{ id: string; value?: string; name?: string }>(
      options.cloudflareApiToken,
      'POST',
      path,
      body
    );
    if (res.ok && res.result?.id && res.result?.value) {
      const secretAccessKey = createHash('sha256').update(res.result.value, 'utf8').digest('hex');
      return {
        accessKeyId: res.result.id,
        secretAccessKey,
        sessionToken: null,
        kind: 'durable',
        policyJson,
        ttlSeconds: null,
        source: `cloudflare-api-token:${path}`,
      };
    }
  }
  return null;
}

/**
 * Probe whether credentials can head-bucket. Used for positive (backup) and
 * negative (other bucket must DENY) ACL checks.
 */
export function probeHeadBucket(creds: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
  endpoint: string;
  bucketName: string;
  env?: NodeJS.ProcessEnv;
}): boolean {
  return headBucket(creds);
}

/**
 * Resolve runtime scoped credentials for secrets + pgBackRest conf.
 * Prefer durable bucket-scoped R2 API token; never returns parent admin keys.
 */
export async function resolveRuntimeScopedCredentials(options: {
  accountId: string;
  cloudflareApiToken: string;
  parentAccessKeyId: string;
  parentSecretAccessKey: string;
  bucketName: string;
  endpoint: string;
  secretsPath: string;
  scopedAccessKeyId?: string;
  scopedSecretAccessKey?: string;
  credentialTtlSeconds?: number;
  negativeAclBucket?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  runtime: RuntimeScopedCredentials;
  residualRisks: string[];
  negativeAclDenied: boolean | null;
  negativeAclBucket: string | null;
}> {
  const env = options.env ?? process.env;
  const residualRisks: string[] = [];
  const policyJson = formatCredentialPolicy(options.bucketName);
  const negativeBucket = options.negativeAclBucket || env.R2_NEGATIVE_ACL_BUCKET || 'laneshadow';

  const candidates: Array<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string | null;
    kind: RuntimeCredentialKind;
    source: string;
    ttlSeconds: number | null;
  }> = [];

  const optKey = options.scopedAccessKeyId?.trim();
  const optSecret = options.scopedSecretAccessKey?.trim();
  if (optKey && optSecret) {
    candidates.push({
      accessKeyId: optKey,
      secretAccessKey: optSecret,
      sessionToken: null,
      kind: 'durable',
      source: 'options.scoped*',
      ttlSeconds: null,
    });
  }

  const envKey =
    env.R2_SCOPED_ACCESS_KEY_ID?.trim() ||
    getSecretValue('R2_SCOPED_ACCESS_KEY_ID', { secretsPath: options.secretsPath, env })?.trim();
  const envSecret =
    env.R2_SCOPED_SECRET_ACCESS_KEY?.trim() ||
    getSecretValue('R2_SCOPED_SECRET_ACCESS_KEY', {
      secretsPath: options.secretsPath,
      env,
    })?.trim();
  if (envKey && envSecret) {
    candidates.push({
      accessKeyId: envKey,
      secretAccessKey: envSecret,
      sessionToken: null,
      kind: 'durable',
      source: 'env/secrets R2_SCOPED_*',
      ttlSeconds: null,
    });
  }

  // Existing runtime secrets: reuse if not the parent secret (scoped temp reuses
  // parent accessKeyId by R2 design — secret + optional session distinguish).
  const existingKey = getSecretValue('R2_ACCESS_KEY_ID', {
    secretsPath: options.secretsPath,
    env,
  })?.trim();
  const existingSecret = getSecretValue('R2_SECRET_ACCESS_KEY', {
    secretsPath: options.secretsPath,
    env,
  })?.trim();
  const existingSession =
    getSecretValue('R2_SESSION_TOKEN', { secretsPath: options.secretsPath, env })?.trim() || null;
  if (existingKey && existingSecret && existingSecret !== options.parentSecretAccessKey) {
    const kind: RuntimeCredentialKind = existingSession ? 'temporary' : 'durable';
    candidates.push({
      accessKeyId: existingKey,
      secretAccessKey: existingSecret,
      sessionToken: existingSession,
      kind,
      source: 'secrets R2_ACCESS_KEY_ID',
      ttlSeconds: kind === 'temporary' ? (options.credentialTtlSeconds ?? 604_800) : null,
    });
  }

  // Attempt durable CF token create (needs API Tokens Write).
  try {
    const durable = await createDurableScopedR2Token({
      accountId: options.accountId,
      cloudflareApiToken: options.cloudflareApiToken,
      bucketName: options.bucketName,
    });
    if (durable) {
      candidates.unshift(durable);
    }
  } catch {
    // ignore — fall through to other candidates / temp mint
  }

  for (const c of candidates) {
    if (c.secretAccessKey === options.parentSecretAccessKey) continue;
    const okBackup = probeHeadBucket({
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
      sessionToken: c.sessionToken,
      endpoint: options.endpoint,
      bucketName: options.bucketName,
      env,
    });
    if (!okBackup) continue;

    let negativeAclDenied: boolean | null = null;
    if (negativeBucket && negativeBucket !== options.bucketName) {
      const otherOk = probeHeadBucket({
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
        sessionToken: c.sessionToken,
        endpoint: options.endpoint,
        bucketName: negativeBucket,
        env,
      });
      negativeAclDenied = !otherOk;
      if (!negativeAclDenied && c.kind === 'durable') {
        // Multi-bucket durable keys are not least-privilege — skip.
        continue;
      }
    }

    if (c.kind === 'temporary') {
      residualRisks.push('R2_SCOPED_CREDENTIAL_TEMPORARY');
    }

    return {
      runtime: {
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
        sessionToken: c.sessionToken,
        kind: c.kind,
        policyJson,
        ttlSeconds: c.ttlSeconds,
        source: c.source,
      },
      residualRisks,
      negativeAclDenied,
      negativeAclBucket: negativeBucket,
    };
  }

  // Mint fresh temporary scoped credentials (bucket-only object-read-write).
  const temp = await mintScopedCredentials({
    accountId: options.accountId,
    cloudflareApiToken: options.cloudflareApiToken,
    parentAccessKeyId: options.parentAccessKeyId,
    bucketName: options.bucketName,
    ttlSeconds: options.credentialTtlSeconds ?? 604_800,
  });
  if (temp.secretAccessKey === options.parentSecretAccessKey) {
    throw new Error(
      'minted temp credentials unexpectedly match parent secret — refusing runtime use'
    );
  }

  residualRisks.push('R2_SCOPED_CREDENTIAL_TEMPORARY');

  let negativeAclDenied: boolean | null = null;
  if (negativeBucket && negativeBucket !== options.bucketName) {
    const otherOk = probeHeadBucket({
      accessKeyId: temp.accessKeyId,
      secretAccessKey: temp.secretAccessKey,
      sessionToken: temp.sessionToken,
      endpoint: options.endpoint,
      bucketName: negativeBucket,
      env,
    });
    negativeAclDenied = !otherOk;
  }

  // Confirm backup access
  if (
    !probeHeadBucket({
      accessKeyId: temp.accessKeyId,
      secretAccessKey: temp.secretAccessKey,
      sessionToken: temp.sessionToken,
      endpoint: options.endpoint,
      bucketName: options.bucketName,
      env,
    })
  ) {
    throw new Error('minted scoped credentials cannot head-bucket backup bucket');
  }

  return {
    runtime: {
      accessKeyId: temp.accessKeyId,
      secretAccessKey: temp.secretAccessKey,
      sessionToken: temp.sessionToken || null,
      kind: 'temporary',
      policyJson,
      ttlSeconds: temp.ttlSeconds,
      source: 'r2/temp-access-credentials',
    },
    residualRisks,
    negativeAclDenied,
    negativeAclBucket: negativeBucket,
  };
}

/** Read repo1-s3-key from a pgBackRest conf (for conf↔secrets equality checks). */
export function readPgbackrestS3Key(configPath: string): string | null {
  if (!existsSync(configPath)) return null;
  const text = readFileSync(configPath, 'utf8');
  const m = text.match(/^repo1-s3-key=(.+)$/m);
  return m?.[1]?.trim() || null;
}

export function readPgbackrestS3KeySecret(configPath: string): string | null {
  if (!existsSync(configPath)) return null;
  const text = readFileSync(configPath, 'utf8');
  const m = text.match(/^repo1-s3-key-secret=(.+)$/m);
  return m?.[1]?.trim() || null;
}

export async function ensureR2Bucket(options: {
  accountId: string;
  cloudflareApiToken: string;
  bucketName: string;
}): Promise<{ created: boolean }> {
  const get = await cfApi(
    options.cloudflareApiToken,
    'GET',
    `/accounts/${options.accountId}/r2/buckets/${options.bucketName}`
  );
  if (get.ok) return { created: false };

  const create = await cfApi(
    options.cloudflareApiToken,
    'POST',
    `/accounts/${options.accountId}/r2/buckets`,
    { name: options.bucketName }
  );
  if (!create.ok) {
    throw new Error(
      `failed to create R2 bucket ${options.bucketName}: ${JSON.stringify(create.errors).slice(0, 300)}`
    );
  }
  return { created: true };
}

/**
 * Attempt PutBucketVersioning. R2's S3 API currently returns NotImplemented
 * for Put/GetBucketVersioning (see Cloudflare S3 compatibility matrix) — treat
 * that as a platform limitation rather than a hard provision failure. Callers
 * MUST still query get-bucket-versioning and record the real API response.
 */
export function enableBucketVersioning(creds: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
  endpoint: string;
  bucketName: string;
  env?: NodeJS.ProcessEnv;
}): { attempted: boolean; applied: boolean; detail: string } {
  const res = runAws(
    [
      's3api',
      'put-bucket-versioning',
      '--bucket',
      creds.bucketName,
      '--versioning-configuration',
      'Status=Enabled',
      '--endpoint-url',
      creds.endpoint,
    ],
    creds
  );
  const detail = (res.stderr || res.stdout || '').trim();
  if (res.status === 0) {
    return { attempted: true, applied: true, detail: 'Status=Enabled' };
  }
  if (/NotImplemented/i.test(detail)) {
    // R2: PutBucketVersioning not implemented — durability relies on SSE +
    // pgBackRest repo cipher + object immutability of WAL segments.
    return { attempted: true, applied: false, detail: 'NotImplemented' };
  }
  return { attempted: true, applied: false, detail: detail.slice(0, 400) };
}

export function putBucketEncryptionAes256(creds: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
  endpoint: string;
  bucketName: string;
  env?: NodeJS.ProcessEnv;
}): void {
  // R2 defaults to AES256; put is idempotent where supported.
  const config = JSON.stringify({
    Rules: [
      {
        ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' },
        BucketKeyEnabled: true,
      },
    ],
  });
  const res = runAws(
    [
      's3api',
      'put-bucket-encryption',
      '--bucket',
      creds.bucketName,
      '--server-side-encryption-configuration',
      config,
      '--endpoint-url',
      creds.endpoint,
    ],
    creds
  );
  // Some R2 accounts reject put-bucket-encryption (SSE is always on). Treat
  // failure as non-fatal if get-bucket-encryption later returns AES256.
  if (res.status !== 0) {
    const msg = (res.stderr || res.stdout).toLowerCase();
    if (
      !msg.includes('notimplemented') &&
      !msg.includes('accessdenied') &&
      !msg.includes('invalid')
    ) {
      // still continue — verification queries real SSE state
    }
  }
}

export function queryBucketEncryption(creds: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
  endpoint: string;
  bucketName: string;
  env?: NodeJS.ProcessEnv;
}): string | null {
  const r = awsJson(['s3api', 'get-bucket-encryption', '--bucket', creds.bucketName], { ...creds });
  if (!r.ok) return null;
  const data = r.data as {
    ServerSideEncryptionConfiguration?: {
      Rules?: Array<{ ApplyServerSideEncryptionByDefault?: { SSEAlgorithm?: string } }>;
    };
  };
  return (
    data?.ServerSideEncryptionConfiguration?.Rules?.[0]?.ApplyServerSideEncryptionByDefault
      ?.SSEAlgorithm ?? null
  );
}

export function queryBucketVersioning(creds: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
  endpoint: string;
  bucketName: string;
  env?: NodeJS.ProcessEnv;
}): string | null {
  const r = awsJson(['s3api', 'get-bucket-versioning', '--bucket', creds.bucketName], { ...creds });
  if (!r.ok) return null;
  const data = r.data as { Status?: string };
  return data?.Status ?? null;
}

export function headBucket(creds: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
  endpoint: string;
  bucketName: string;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const res = runAws(
    ['s3api', 'head-bucket', '--bucket', creds.bucketName, '--endpoint-url', creds.endpoint],
    creds
  );
  return res.status === 0;
}

/** Render pgBackRest config. Cipher must not be none. File is gitignored mode 0600. */
export function renderPgbackrestConfig(cfg: {
  stanza: string;
  pg1Path: string;
  bucketName: string;
  endpointHost: string;
  repoPath: string;
  cipherPass: string;
  /** Scoped S3 access key (written only to gitignored conf for archive-push). */
  s3Key?: string;
  s3KeySecret?: string;
  s3Token?: string | null;
}): string {
  // Conf lives under services/platform/config/pgbackrest/ (gitignored, 0600).
  // Keys are required in-file so Postgres archive_command (no ambient env) works.
  const keyLines: string[] = [];
  if (cfg.s3Key) keyLines.push(`repo1-s3-key=${cfg.s3Key}`);
  if (cfg.s3KeySecret) keyLines.push(`repo1-s3-key-secret=${cfg.s3KeySecret}`);
  if (cfg.s3Token) keyLines.push(`repo1-s3-token=${cfg.s3Token}`);
  return `# Generated by holo backup:provision (D04-02). Do not commit secrets.
# repo cipher: aes-256-cbc (NOT none)
# File is gitignored + mode 0600. NEVER commit.

[global]
repo1-type=s3
repo1-s3-bucket=${cfg.bucketName}
repo1-s3-endpoint=${cfg.endpointHost}
repo1-s3-region=auto
repo1-s3-uri-style=path
repo1-path=/${cfg.repoPath.replace(/^\//, '')}
${keyLines.join('\n')}
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=${cfg.cipherPass}
repo1-retention-full=4
repo1-bundle=y
repo1-block=y
process-max=2
start-fast=y
log-level-console=info
log-level-file=detail

[${cfg.stanza}]
pg1-path=${cfg.pg1Path}
pg1-port=5432
`;
}

export function writePgbackrestConfig(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, { mode: 0o600 });
  // Ensure gitignore covers this directory
  const gi = resolve(dirname(path), '.gitignore');
  if (!existsSync(gi)) {
    writeFileSync(
      gi,
      '# pgBackRest conf may contain repo cipher pass — never commit\n*\n!.gitignore\n',
      {
        mode: 0o644,
      }
    );
  }
}

export function runStanzaCreate(options: {
  configPath: string;
  stanza: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
  env?: NodeJS.ProcessEnv;
}): { status: number; stdout: string; stderr: string } {
  // GATE-FIX-S28R3-QA23: fixed PATH; absolute root-owned pgbackrest only.
  const env: NodeJS.ProcessEnv = {
    ...(options.env ?? process.env),
    PGBACKREST_REPO1_S3_KEY: options.accessKeyId,
    PGBACKREST_REPO1_S3_KEY_SECRET: options.secretAccessKey,
    PATH: '/usr/bin:/bin',
  };
  if (options.sessionToken) {
    env.PGBACKREST_REPO1_S3_TOKEN = options.sessionToken;
  } else {
    delete env.PGBACKREST_REPO1_S3_TOKEN;
  }
  const bin = resolveTrustedPgbackrestBin(options.env ?? process.env);
  if (!bin) {
    return {
      status: 1,
      stdout: '',
      stderr:
        'GATE-FIX-S28R3-QA23 refuses credential-bearing stanza-create without root-owned pgbackrest',
    };
  }
  const create = run(
    bin,
    [`--config=${options.configPath}`, `--stanza=${options.stanza}`, 'stanza-create'],
    { env, timeoutMs: 180_000 }
  );
  return create;
}

export function runPgbackrestCheck(options: {
  configPath: string;
  stanza: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
  env?: NodeJS.ProcessEnv;
}): { status: number; stdout: string; stderr: string } {
  const env: NodeJS.ProcessEnv = {
    ...(options.env ?? process.env),
    PGBACKREST_REPO1_S3_KEY: options.accessKeyId,
    PGBACKREST_REPO1_S3_KEY_SECRET: options.secretAccessKey,
    // GATE-FIX-S28R3-QA23: no ambient/Homebrew PATH while credentials ambient.
    PATH: '/usr/bin:/bin',
  };
  if (options.sessionToken) {
    env.PGBACKREST_REPO1_S3_TOKEN = options.sessionToken;
  } else {
    delete env.PGBACKREST_REPO1_S3_TOKEN;
  }
  const bin = resolveTrustedPgbackrestBin(options.env ?? process.env);
  if (!bin) {
    return {
      status: 1,
      stdout: '',
      stderr:
        'GATE-FIX-S28R3-QA23 refuses credential-bearing pgbackrest check without root-owned binary',
    };
  }
  return run(bin, [`--config=${options.configPath}`, `--stanza=${options.stanza}`, 'check'], {
    env,
    timeoutMs: 180_000,
  });
}

/**
 * Bootstrap archive_mode + archive_command so `pgbackrest check` can prove the
 * repo is reachable. Continuous WAL scheduling remains D04-03.
 */
export function ensureArchiveCommandForCheck(options: {
  configPath: string;
  stanza: string;
  env?: NodeJS.ProcessEnv;
}): { archiveMode: string; archiveCommand: string; restarted: boolean } {
  const env = options.env ?? process.env;
  // GATE-FIX-S28R3-QA23: never which/Homebrew for credential-adjacent archive-push.
  const pgbackrestBin = resolveTrustedPgbackrestBin(env);
  if (!pgbackrestBin) {
    throw new Error(
      'GATE-FIX-S28R3-QA23 refuses archive_command without root-owned pgbackrest at /usr/local/bin/pgbackrest or /usr/bin/pgbackrest'
    );
  }
  const archiveCommand = `${pgbackrestBin} --config=${options.configPath} --stanza=${options.stanza} archive-push %p`;

  // GATE-FIX-S28R3-QA25: absolute psql only — never bare PATH `psql`.
  const psql = resolvePsqlBin(env);

  const showMode = run(psql, ['-d', 'holocron', '-tAc', 'SHOW archive_mode'], { env });
  const currentMode = showMode.stdout.trim();
  const showCmd = run(psql, ['-d', 'holocron', '-tAc', 'SHOW archive_command'], { env });
  const currentCmd = showCmd.stdout.trim();

  // Always set archive_command (reloadable)
  const setCmd = run(
    psql,
    [
      '-d',
      'holocron',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `ALTER SYSTEM SET archive_command = '${archiveCommand.replace(/'/g, "''")}'`,
    ],
    { env }
  );
  if (setCmd.status !== 0) {
    throw new Error(`ALTER SYSTEM archive_command failed: ${setCmd.stderr || setCmd.stdout}`);
  }

  let restarted = false;
  if (currentMode !== 'on' && currentMode !== 'always') {
    const setMode = run(
      psql,
      ['-d', 'holocron', '-v', 'ON_ERROR_STOP=1', '-c', `ALTER SYSTEM SET archive_mode = 'on'`],
      { env }
    );
    if (setMode.status !== 0) {
      throw new Error(`ALTER SYSTEM archive_mode failed: ${setMode.stderr || setMode.stdout}`);
    }
    // archive_mode requires restart
    const bounce = run(
      'launchctl',
      ['kickstart', '-k', `gui/${process.getuid?.() ?? 501}/holocron-postgres`],
      { env, timeoutMs: 60_000 }
    );
    if (bounce.status !== 0) {
      // Fallback: absolute pg_ctl only (never bare PATH).
      const pgctlBin =
        validateRootOwnedBin('/usr/local/bin/pg_ctl') ??
        validateRootOwnedBin('/usr/bin/pg_ctl') ??
        (existsSync('/opt/homebrew/opt/postgresql@18/bin/pg_ctl')
          ? '/opt/homebrew/opt/postgresql@18/bin/pg_ctl'
          : '/usr/bin/pg_ctl');
      const pgctl = run(
        pgctlBin,
        ['-D', '/opt/homebrew/var/postgresql@18', 'restart', '-m', 'fast'],
        { env, timeoutMs: 60_000 }
      );
      if (pgctl.status !== 0) {
        throw new Error(
          `postgres restart failed (launchctl + pg_ctl): ${(bounce.stderr || pgctl.stderr).slice(0, 300)}`
        );
      }
    }
    restarted = true;
    // Wait for readiness
    for (let i = 0; i < 30; i++) {
      const ready = run(psql, ['-d', 'holocron', '-tAc', 'SELECT 1'], { env });
      if (ready.status === 0 && ready.stdout.trim() === '1') break;
      spawnSync('sleep', ['1']);
    }
  } else {
    // Reload is enough when only archive_command changed
    run(psql, ['-d', 'holocron', '-c', 'SELECT pg_reload_conf()'], { env });
  }

  const modeAfter = run(psql, ['-d', 'holocron', '-tAc', 'SHOW archive_mode'], { env });
  const cmdAfter = run(psql, ['-d', 'holocron', '-tAc', 'SHOW archive_command'], { env });
  if (modeAfter.stdout.trim() !== 'on' && modeAfter.stdout.trim() !== 'always') {
    throw new Error(`archive_mode still ${modeAfter.stdout.trim()} after restart`);
  }
  if (!cmdAfter.stdout.includes('pgbackrest') || !cmdAfter.stdout.includes('archive-push')) {
    throw new Error(`archive_command not set to pgbackrest: ${cmdAfter.stdout.trim()}`);
  }
  // silence unused
  void currentCmd;
  return {
    archiveMode: modeAfter.stdout.trim(),
    archiveCommand: cmdAfter.stdout.trim(),
    restarted,
  };
}

/**
 * GATE-FIX-S28R3-QA24: list via root-owned aws when present; otherwise fixed
 * repository stdlib provider via root-owned /usr/bin/python3 (never Homebrew aws).
 */
function runTrustedPythonR2(
  args: string[],
  creds: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string | null;
    env?: NodeJS.ProcessEnv;
  }
): { status: number; stdout: string; stderr: string } {
  const py = validateRootOwnedBin('/usr/bin/python3') ?? validateRootOwnedBin('/bin/python3');
  if (!py) {
    return {
      status: 127,
      stdout: '',
      stderr: 'GATE-FIX-S28R3-QA24: no root-owned python3 for R2 provider fallback',
    };
  }
  // Resolve provider relative to repo root (this file lives under services/platform/src/backup).
  const provider = `${resolveRepoRoot()}/scripts/lib/r2_s3_provider.py`;
  if (!existsSync(provider)) {
    return {
      status: 127,
      stdout: '',
      stderr: `GATE-FIX-S28R3-QA24: missing R2 provider ${provider}`,
    };
  }
  const env = awsEnv(creds);
  return run(py, ['-E', '-s', provider, ...args], { env, timeoutMs: 180_000 });
}

export function listRepoPrefix(creds: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
  endpoint: string;
  bucketName: string;
  prefix: string;
  env?: NodeJS.ProcessEnv;
}): { count: number; raw: string } {
  const prefix = creds.prefix.replace(/^\//, '').replace(/\/$/, '');
  // Prefer root-owned aws when present (production trust chain).
  if (resolveTrustedAwsBin(creds.env)) {
    const res = runAws(
      [
        's3',
        'ls',
        `s3://${creds.bucketName}/${prefix}/`,
        '--endpoint-url',
        creds.endpoint,
        '--recursive',
      ],
      creds
    );
    const lines = (res.stdout || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    return { count: lines.length, raw: res.stdout || res.stderr || '' };
  }
  // Fallback: repository stdlib provider (same trust class as prove-r2-readonly).
  // GATE-FIX-S28R3-QA24: paginate far enough that pgbackrest archive/ does not
  // starve backup.manifest / backup.info discovery (max-keys=1000 truncated early).
  const res = runTrustedPythonR2(
    [
      'list-prefix',
      '--endpoint',
      creds.endpoint,
      '--bucket',
      creds.bucketName,
      '--prefix',
      prefix,
      '--max-keys',
      '100000',
      '--aws-ls-format',
    ],
    creds
  );
  const lines = (res.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return { count: lines.length, raw: res.stdout || res.stderr || '' };
}

function resolveAdminInputs(options: ProvisionOptions): {
  accountId: string;
  cloudflareApiToken: string;
  parentAccessKeyId: string;
  parentSecretAccessKey: string;
  bucketName: string;
  endpoint: string;
} {
  const env = options.env ?? process.env;
  const secretsPath = options.secretsPath ?? defaultSecretsPath();

  const accountId = requireNonEmpty(
    'R2_ACCOUNT_ID',
    options.accountId ||
      getSecretValue('R2_ACCOUNT_ID', { secretsPath, env }) ||
      env.R2_ACCOUNT_ID ||
      env.R2_S3_ID
  );
  const cloudflareApiToken = requireNonEmpty(
    'CLOUDFLARE_API_TOKEN',
    options.cloudflareApiToken ||
      getSecretValue('CLOUDFLARE_API_TOKEN', { secretsPath, env }) ||
      env.CLOUDFLARE_API_TOKEN ||
      env.R2_S3_TOKEN
  );
  const parentAccessKeyId = requireNonEmpty(
    'R2_PARENT_ACCESS_KEY_ID',
    options.parentAccessKeyId ||
      getSecretValue('R2_PARENT_ACCESS_KEY_ID', { secretsPath, env }) ||
      env.R2_PARENT_ACCESS_KEY_ID ||
      env.R2_S3_KEY_ID
  );
  const parentSecretAccessKey = requireNonEmpty(
    'R2_PARENT_SECRET_ACCESS_KEY',
    options.parentSecretAccessKey ||
      getSecretValue('R2_PARENT_SECRET_ACCESS_KEY', { secretsPath, env }) ||
      env.R2_PARENT_SECRET_ACCESS_KEY ||
      env.R2_S3_SECRET
  );
  const bucketName = (
    options.bucketName ||
    getSecretValue('R2_BUCKET_NAME', { secretsPath, env }) ||
    env.R2_BUCKET_NAME ||
    'holocron-backup'
  ).trim();
  const endpoint = r2EndpointForAccount(accountId);
  if (!endpoint.startsWith('https://')) {
    throw new Error('R2 endpoint must be https://');
  }
  return {
    accountId,
    cloudflareApiToken,
    parentAccessKeyId,
    parentSecretAccessKey,
    bucketName,
    endpoint,
  };
}

/**
 * Full provision flow: bucket (SSE + versioning residual) → scoped runtime
 * credentials → secrets store + pgBackRest conf (scoped only) → stanza-create.
 */
export async function provisionBackupRepo(
  options: ProvisionOptions = {}
): Promise<ProvisionResult> {
  const errors: string[] = [];
  const residualRisks: string[] = [];
  const env = options.env ?? process.env;
  const secretsPath = options.secretsPath ?? defaultSecretsPath(resolveRepoRoot());
  const stanza = options.stanza || defaultStanza();
  const pg1Path = options.pg1Path || defaultPg1Path();
  const pgbackrestPrefix = options.pgbackrestPrefix || defaultPgbackrestPrefix();
  const pgbackrestConfigPath =
    options.pgbackrestConfigPath || defaultPgbackrestConfigPath(resolveRepoRoot());

  const admin = resolveAdminInputs(options);
  const adminCreds = {
    accessKeyId: admin.parentAccessKeyId,
    secretAccessKey: admin.parentSecretAccessKey,
    endpoint: admin.endpoint,
    bucketName: admin.bucketName,
    env,
  };

  // --- AC-1: bucket + SSE (+ versioning when implemented) ---
  await ensureR2Bucket({
    accountId: admin.accountId,
    cloudflareApiToken: admin.cloudflareApiToken,
    bucketName: admin.bucketName,
  });

  if (!headBucket(adminCreds)) {
    throw new Error(`head-bucket failed for ${admin.bucketName} after create`);
  }

  putBucketEncryptionAes256(adminCreds);
  const versioningAttempt = enableBucketVersioning(adminCreds);
  const versioningNotImplemented = /NotImplemented/i.test(versioningAttempt.detail);

  const encryption = queryBucketEncryption(adminCreds);
  const versioning = queryBucketVersioning(adminCreds);
  if (!encryption || !/AES256|aws:kms|SSE/i.test(encryption)) {
    errors.push(`bucket encryption missing/unsupported: ${encryption ?? 'null'}`);
  }
  // R2 S3 API: Put/GetBucketVersioning are NotImplemented (Cloudflare matrix).
  // Do NOT soft-pass as Status=Enabled — record residual risk and prove durability
  // via SSE-AES256 + TLS + repo cipher + real objects instead.
  if (versioningNotImplemented || (versioning !== 'Enabled' && versioning !== 'Suspended')) {
    if (versioningNotImplemented || versioning == null || versioning === '') {
      residualRisks.push('R2_VERSIONING_NOT_IMPLEMENTED');
    } else if (versioning !== 'Enabled' && versioning !== 'Suspended') {
      errors.push(
        `bucket versioning unexpected: ${versioning ?? 'null'} (put: ${versioningAttempt.detail})`
      );
    }
  }
  if (versioning === 'Enabled') {
    // real Enabled — no residual
  } else if (
    !residualRisks.includes('R2_VERSIONING_NOT_IMPLEMENTED') &&
    versioning !== 'Suspended'
  ) {
    // already handled above
  }

  // --- AC-2: scoped runtime credentials (never parent multi-bucket admin) ---
  const resolved = await resolveRuntimeScopedCredentials({
    accountId: admin.accountId,
    cloudflareApiToken: admin.cloudflareApiToken,
    parentAccessKeyId: admin.parentAccessKeyId,
    parentSecretAccessKey: admin.parentSecretAccessKey,
    bucketName: admin.bucketName,
    endpoint: admin.endpoint,
    secretsPath,
    scopedAccessKeyId: options.scopedAccessKeyId,
    scopedSecretAccessKey: options.scopedSecretAccessKey,
    credentialTtlSeconds: options.credentialTtlSeconds ?? 604_800,
    negativeAclBucket: options.negativeAclBucket,
    env,
  });
  const runtime = resolved.runtime;
  for (const r of resolved.residualRisks) {
    if (!residualRisks.includes(r)) residualRisks.push(r);
  }

  // Hard fail: parent admin secret must never be the runtime identity.
  if (runtime.secretAccessKey === admin.parentSecretAccessKey) {
    errors.push('refusing to use parent multi-bucket admin secret as runtime credentials');
  }

  const policy = JSON.parse(runtime.policyJson) as {
    Statement: Array<{ Action: string[]; Resource: string[] }>;
  };
  const policyActions = [...new Set(policy.Statement.flatMap((s) => s.Action))];
  const policyResource = [...new Set(policy.Statement.flatMap((s) => s.Resource))];
  const policyHasWildcardResource = policyResource.some((r) => r === '*');
  const policyHasWildcardAction = policyActions.some((a) => a === 's3:*' || a === '*');
  if (policyHasWildcardResource || policyHasWildcardAction) {
    errors.push('credential policy contains wildcard Resource or s3:* Action');
  }
  if (!policyResource.every((r) => r.includes(admin.bucketName))) {
    errors.push('credential policy Resource does not enumerate backup bucket only');
  }
  if (resolved.negativeAclDenied === false) {
    errors.push(
      `scoped credentials can access non-backup bucket ${resolved.negativeAclBucket} (expected DENY)`
    );
  }

  // Cipher pass: reuse existing or generate
  const existingCipher =
    getSecretValue('R2_REPO_CIPHER_PASS', { secretsPath, env }) || env.R2_REPO_CIPHER_PASS;
  const cipherPass = existingCipher?.trim() || randomBytes(32).toString('hex');

  // Store compact single-line policy JSON (easier YAML round-trip than pretty print).
  const policyCompact = JSON.stringify(JSON.parse(runtime.policyJson));
  const secretsUpdates: SecretsMap = {
    R2_ACCOUNT_ID: admin.accountId,
    R2_ENDPOINT: admin.endpoint,
    R2_BUCKET_NAME: admin.bucketName,
    R2_ACCESS_KEY_ID: runtime.accessKeyId,
    R2_SECRET_ACCESS_KEY: runtime.secretAccessKey,
    R2_CREDENTIAL_POLICY: policyCompact,
    R2_CREDENTIAL_KIND: runtime.kind,
    R2_REPO_CIPHER_PASS: cipherPass,
    R2_PGBACKREST_PREFIX: pgbackrestPrefix,
    R2_RESIDUAL_RISKS: residualRisks.join(','),
    PGBACKREST_CONFIG: pgbackrestConfigPath,
    PGBACKREST_STANZA: stanza,
    PGBACKREST_PG1_PATH: pg1Path,
    // Parent multi-bucket admin keys intentionally NOT written.
    // Runtime identity is scoped only (durable API token or temp session).
  };
  if (runtime.sessionToken) {
    secretsUpdates.R2_SESSION_TOKEN = runtime.sessionToken;
  } else {
    // Clear stale session token when using durable keys
    secretsUpdates.R2_SESSION_TOKEN = '';
  }
  const secretsWritten = upsertSecretsFile(secretsPath, secretsUpdates);

  // --- AC-3: pgBackRest repo + stanza-create ---
  // Write ONLY the scoped runtime identity into conf (gitignored mode 0600).
  // NEVER write parent multi-bucket admin keys into pgbackrest.conf.
  const conf = renderPgbackrestConfig({
    stanza,
    pg1Path,
    bucketName: admin.bucketName,
    endpointHost: endpointHost(admin.endpoint),
    repoPath: pgbackrestPrefix,
    cipherPass,
    s3Key: runtime.accessKeyId,
    s3KeySecret: runtime.secretAccessKey,
    s3Token: runtime.sessionToken,
  });
  writePgbackrestConfig(pgbackrestConfigPath, conf);

  // Confirm cipher-type in written conf + conf↔secrets identity match
  const confText = readFileSync(pgbackrestConfigPath, 'utf8');
  const cipherTypeMatch = confText.match(/repo1-cipher-type=(\S+)/);
  const cipherType = cipherTypeMatch?.[1] ?? 'missing';
  if (cipherType === 'none' || cipherType === 'missing') {
    errors.push(`repo cipher-type must not be none (got ${cipherType})`);
  }

  const confKey = readPgbackrestS3Key(pgbackrestConfigPath);
  const confSecret = readPgbackrestS3KeySecret(pgbackrestConfigPath);
  const confMatchesScopedSecrets =
    confKey === runtime.accessKeyId && confSecret === runtime.secretAccessKey;
  if (!confMatchesScopedSecrets) {
    errors.push('pgbackrest conf s3 key does not match secrets-store scoped R2_ACCESS_KEY_ID');
  }
  if (confSecret === admin.parentSecretAccessKey) {
    errors.push('pgbackrest conf contains parent multi-bucket admin secret — forbidden');
  }

  let stanzaCreateExit: number | null = null;
  let stanzaCreateStdout = '';
  let checkExit: number | null = null;
  let checkStdout = '';
  let repoObjectsListed = 0;

  if (!options.skipStanzaCreate) {
    // stanza-create uses conf + scoped runtime env (not parent). Real R2 round-trip.
    const createRes = runStanzaCreate({
      configPath: pgbackrestConfigPath,
      stanza,
      accessKeyId: runtime.accessKeyId,
      secretAccessKey: runtime.secretAccessKey,
      sessionToken: runtime.sessionToken,
      env,
    });
    stanzaCreateExit = createRes.status;
    stanzaCreateStdout = `${createRes.stdout}\n${createRes.stderr}`.trim();
    if (createRes.status !== 0) {
      errors.push(`stanza-create failed: ${stanzaCreateStdout.slice(0, 500)}`);
    }

    // Minimal archive_command so `check` can prove repo reachability (D04-03
    // owns continuous WAL jobs; this only enables the probe path).
    try {
      ensureArchiveCommandForCheck({
        configPath: pgbackrestConfigPath,
        stanza,
        env,
      });
    } catch (e) {
      errors.push(
        `archive_command bootstrap failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    const checkRes = runPgbackrestCheck({
      configPath: pgbackrestConfigPath,
      stanza,
      accessKeyId: runtime.accessKeyId,
      secretAccessKey: runtime.secretAccessKey,
      sessionToken: runtime.sessionToken,
      env,
    });
    checkExit = checkRes.status;
    checkStdout = `${checkRes.stdout}\n${checkRes.stderr}`.trim();
    if (checkRes.status !== 0) {
      errors.push(`pgbackrest check failed: ${checkStdout.slice(0, 500)}`);
    }

    // List with scoped runtime (not parent) to prove least-privilege can read repo.
    const listing = listRepoPrefix({
      accessKeyId: runtime.accessKeyId,
      secretAccessKey: runtime.secretAccessKey,
      sessionToken: runtime.sessionToken,
      endpoint: admin.endpoint,
      bucketName: admin.bucketName,
      prefix: pgbackrestPrefix,
      env,
    });
    repoObjectsListed = listing.count;
    if (listing.count < 1) {
      errors.push('repo prefix empty after stanza-create (expected ≥1 object)');
    }
  }

  // AC-1 durability gate: SSE + TLS + residual-risk honesty for versioning.
  // Versioning Status=Enabled is NOT claimed when R2 returns NotImplemented.
  const durabilityOk =
    Boolean(encryption) &&
    admin.endpoint.startsWith('https://') &&
    (versioning === 'Enabled' ||
      versioning === 'Suspended' ||
      residualRisks.includes('R2_VERSIONING_NOT_IMPLEMENTED'));
  const ok =
    errors.length === 0 &&
    durabilityOk &&
    !policyHasWildcardResource &&
    !policyHasWildcardAction &&
    confMatchesScopedSecrets &&
    (options.skipStanzaCreate ||
      (stanzaCreateExit === 0 && checkExit === 0 && repoObjectsListed >= 1));

  return {
    ok,
    bucketName: admin.bucketName,
    endpoint: admin.endpoint,
    accountId: admin.accountId,
    encryption,
    versioning,
    versioningNotImplemented,
    residualRisks,
    credentialKind: runtime.kind,
    confMatchesScopedSecrets,
    negativeAclDenied: resolved.negativeAclDenied,
    negativeAclBucket: resolved.negativeAclBucket,
    policyResource,
    policyActions,
    policyHasWildcardResource,
    policyHasWildcardAction,
    secretsPath,
    secretsWritten,
    pgbackrestConfigPath,
    stanza,
    stanzaCreateExit,
    stanzaCreateStdout,
    checkExit,
    checkStdout,
    repoObjectsListed,
    cipherType,
    errors,
  };
}

/** Summarize provision result without secret values. */
export function formatProvisionText(result: ProvisionResult): string {
  const lines = [
    'holo backup:provision — R2 bucket + scoped creds + pgBackRest repo',
    `  bucket:        ${result.bucketName}`,
    `  endpoint:      ${result.endpoint}`,
    `  encryption:    ${result.encryption ?? 'MISSING'}`,
    `  versioning:    ${result.versioning ?? (result.versioningNotImplemented ? 'R2_VERSIONING_NOT_IMPLEMENTED' : 'MISSING')}`,
    `  residual risks:${result.residualRisks.length ? result.residualRisks.join(',') : '(none)'}`,
    `  cred kind:     ${result.credentialKind ?? 'unknown'}`,
    `  conf=secrets:  ${result.confMatchesScopedSecrets}`,
    `  neg ACL deny:  ${result.negativeAclDenied} (bucket=${result.negativeAclBucket ?? 'n/a'})`,
    `  policy actions:${result.policyActions.join(',')}`,
    `  policy resource:${result.policyResource.join(',')}`,
    `  wildcard res:  ${result.policyHasWildcardResource}`,
    `  wildcard act:  ${result.policyHasWildcardAction}`,
    `  secrets file:  ${result.secretsPath}`,
    `  secrets keys:  ${result.secretsWritten.join(', ')}`,
    `  pgbackrest:    ${result.pgbackrestConfigPath}`,
    `  stanza:        ${result.stanza}`,
    `  cipher-type:   ${result.cipherType}`,
    `  stanza-create: exit ${result.stanzaCreateExit ?? 'skipped'}`,
    `  check:         exit ${result.checkExit ?? 'skipped'}`,
    `  repo objects:  ${result.repoObjectsListed}`,
  ];
  if (result.errors.length > 0) {
    lines.push('  errors:');
    for (const e of result.errors) lines.push(`    - ${e}`);
  }
  lines.push(`  status:        ${result.ok ? 'OK' : 'FAIL'}`);
  return lines.join('\n');
}

export type { BackupConfig };
