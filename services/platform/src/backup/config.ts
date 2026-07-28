/**
 * Off-mini backup config (CAP-BAK-01 / D04-02).
 *
 * R2 endpoint/bucket/prefix + credential key names resolve from the consolidated
 * secrets store (env > secrets.yaml). Never hardcode credential values.
 */
import { getSecretValue, loadConsolidatedSecrets, resolveRepoRoot } from '../config/secrets.ts';

/** Secrets keys used by the backup/R2 stack (distinct from DATABASE_URL / Fleet). */
export const BACKUP_SECRET_KEYS = [
  'R2_ACCOUNT_ID',
  'R2_ENDPOINT',
  'R2_BUCKET_NAME',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_SESSION_TOKEN',
  'R2_CREDENTIAL_POLICY',
  'R2_CREDENTIAL_KIND',
  'R2_RESIDUAL_RISKS',
  'R2_REPO_CIPHER_PASS',
  'R2_PGBACKREST_PREFIX',
  'PGBACKREST_CONFIG',
  'PGBACKREST_STANZA',
  'PGBACKREST_PG1_PATH',
] as const;

export type BackupSecretKey = (typeof BACKUP_SECRET_KEYS)[number];

/** Admin-only keys used during `holo backup:provision` (never the runtime backup token). */
export const BACKUP_ADMIN_SECRET_KEYS = [
  'CLOUDFLARE_API_TOKEN',
  'R2_PARENT_ACCESS_KEY_ID',
  'R2_PARENT_SECRET_ACCESS_KEY',
] as const;

export type BackupConfig = {
  accountId: string;
  endpoint: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | null;
  /** IAM-style policy JSON string enumerating bucket-only resources + limited actions. */
  credentialPolicy: string | null;
  repoCipherPass: string;
  /** Object prefix inside the bucket for pgBackRest (no leading slash). */
  pgbackrestPrefix: string;
  pgbackrestConfigPath: string;
  stanza: string;
  pg1Path: string;
};

export type BackupConfigPartial = {
  [K in keyof BackupConfig]?: BackupConfig[K] | null;
};

export function defaultPgbackrestConfigPath(repoRoot = resolveRepoRoot()): string {
  return `${repoRoot}/services/platform/config/pgbackrest/pgbackrest.conf`;
}

export function defaultPg1Path(): string {
  return process.env.PGBACKREST_PG1_PATH?.trim() || '/opt/homebrew/var/postgresql@18';
}

export function defaultStanza(): string {
  return process.env.PGBACKREST_STANZA?.trim() || 'main';
}

export function defaultBucketName(): string {
  return process.env.R2_BUCKET_NAME?.trim() || 'holocron-backup';
}

export function defaultPgbackrestPrefix(): string {
  return process.env.R2_PGBACKREST_PREFIX?.trim() || 'pgbackrest';
}

/** Build the S3-compatible R2 endpoint URL (https, TLS ≥ 1.2). */
export function r2EndpointForAccount(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

/**
 * Least-privilege policy for the backup-bucket-only R2 token.
 * Resource is the exact bucket ARN (+ object ARN); Action list is limited (no s3:*).
 */
export function buildBackupCredentialPolicy(bucketName: string): {
  Version: string;
  Statement: Array<{
    Sid: string;
    Effect: 'Allow';
    Action: string[];
    Resource: string[];
  }>;
} {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'HolocronBackupBucketOnly',
        Effect: 'Allow',
        Action: ['s3:ListBucket', 's3:GetBucketLocation'],
        Resource: [`arn:aws:s3:::${bucketName}`],
      },
      {
        Sid: 'HolocronBackupObjectRW',
        Effect: 'Allow',
        Action: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
        Resource: [`arn:aws:s3:::${bucketName}/*`],
      },
    ],
  };
}

export function formatCredentialPolicy(bucketName: string): string {
  return JSON.stringify(buildBackupCredentialPolicy(bucketName), null, 2);
}

/**
 * Load backup config from consolidated secrets. Missing required fields throw
 * with the key name only (never values).
 */
export function loadBackupConfig(options?: {
  secretsPath?: string;
  env?: NodeJS.ProcessEnv;
}): BackupConfig {
  const env = options?.env ?? process.env;
  const secretsPath = options?.secretsPath;
  const get = (key: string) => getSecretValue(key, { secretsPath, env });

  const accountIdRaw = get('R2_ACCOUNT_ID');
  const bucketName = get('R2_BUCKET_NAME') || defaultBucketName();
  const endpointRaw =
    get('R2_ENDPOINT') || (accountIdRaw ? r2EndpointForAccount(accountIdRaw) : undefined);
  const accessKeyIdRaw = get('R2_ACCESS_KEY_ID');
  const secretAccessKeyRaw = get('R2_SECRET_ACCESS_KEY');
  const sessionToken = get('R2_SESSION_TOKEN') ?? null;
  const credentialPolicy = get('R2_CREDENTIAL_POLICY') ?? null;
  const repoCipherPassRaw = get('R2_REPO_CIPHER_PASS');
  const pgbackrestPrefix = get('R2_PGBACKREST_PREFIX') || defaultPgbackrestPrefix();
  const pgbackrestConfigPath = get('PGBACKREST_CONFIG') || defaultPgbackrestConfigPath();
  const stanza = get('PGBACKREST_STANZA') || defaultStanza();
  const pg1Path = get('PGBACKREST_PG1_PATH') || defaultPg1Path();

  const missing: string[] = [];
  if (!accountIdRaw) missing.push('R2_ACCOUNT_ID');
  if (!endpointRaw) missing.push('R2_ENDPOINT');
  if (!bucketName) missing.push('R2_BUCKET_NAME');
  if (!accessKeyIdRaw) missing.push('R2_ACCESS_KEY_ID');
  if (!secretAccessKeyRaw) missing.push('R2_SECRET_ACCESS_KEY');
  if (!repoCipherPassRaw) missing.push('R2_REPO_CIPHER_PASS');
  if (missing.length > 0) {
    throw new Error(`backup config missing secrets: ${missing.join(', ')}`);
  }

  // Narrow after missing-check (TypeScript does not refine across array pushes).
  if (
    !accountIdRaw ||
    !endpointRaw ||
    !bucketName ||
    !accessKeyIdRaw ||
    !secretAccessKeyRaw ||
    !repoCipherPassRaw
  ) {
    throw new Error(`backup config missing secrets: ${missing.join(', ')}`);
  }

  // endpoint is https-only (TLS). Fail closed on cleartext.
  if (!endpointRaw.startsWith('https://')) {
    throw new Error('R2_ENDPOINT must use https:// (TLS required, cleartext rejected)');
  }

  return {
    accountId: accountIdRaw,
    endpoint: endpointRaw,
    bucketName,
    accessKeyId: accessKeyIdRaw,
    secretAccessKey: secretAccessKeyRaw,
    sessionToken: sessionToken && sessionToken.length > 0 ? sessionToken : null,
    credentialPolicy,
    repoCipherPass: repoCipherPassRaw,
    pgbackrestPrefix,
    pgbackrestConfigPath,
    stanza,
    pg1Path,
  };
}

/** Non-throwing partial load (for doctor / diagnostics — never returns values of secrets). */
export function backupSecretsPresence(options?: {
  secretsPath?: string;
  env?: NodeJS.ProcessEnv;
}): Array<{ key: string; present: boolean; source: 'env' | 'file' | null }> {
  const env = options?.env ?? process.env;
  const map = loadConsolidatedSecrets({ secretsPath: options?.secretsPath, env });
  return BACKUP_SECRET_KEYS.map((key) => {
    const envVal = env[key];
    const fromEnv = typeof envVal === 'string' && envVal.trim().length > 0;
    if (fromEnv) return { key, present: true, source: 'env' as const };
    const fileVal = map[key];
    const fromFile = typeof fileVal === 'string' && fileVal.trim().length > 0;
    if (fromFile) return { key, present: true, source: 'file' as const };
    return { key, present: false, source: null };
  });
}

/** Host portion of the R2 endpoint (no scheme) — for pgBackRest repo1-s3-endpoint. */
export function endpointHost(endpoint: string): string {
  return endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
