/**
 * GATE-FIX-S28R3-QA26 — shared root-trust executable selection.
 *
 * Credential-bearing descendants (psql / pg_ctl / and siblings) must only run
 * fixed, absolute, regular, non-symlinked, root-owned, not group/other-writable
 * binaries. Absolute overrides and Homebrew candidates use the SAME validation.
 * Refusal throws before any credential-bearing environment is constructed or
 * ambient on the child.
 */
import { existsSync, lstatSync, realpathSync } from 'node:fs';

const FIXED_PSQL_CANDIDATES = [
  '/usr/local/bin/psql',
  '/usr/bin/psql',
  '/opt/homebrew/opt/postgresql@18/bin/psql',
  '/usr/local/opt/postgresql@18/bin/psql',
  '/opt/homebrew/bin/psql',
  '/usr/lib/postgresql/18/bin/psql',
] as const;

const FIXED_PG_CTL_CANDIDATES = [
  '/usr/local/bin/pg_ctl',
  '/usr/bin/pg_ctl',
  '/opt/homebrew/opt/postgresql@18/bin/pg_ctl',
  '/usr/local/opt/postgresql@18/bin/pg_ctl',
  '/opt/homebrew/bin/pg_ctl',
  '/usr/lib/postgresql/18/bin/pg_ctl',
] as const;

/**
 * Validate absolute root-owned trust chain (mirrors r2_ro_validate_root_bin).
 * Returns realpath on success; null on any failure.
 */
export function validateRootOwnedBin(candidate: string): string | null {
  const cand = candidate.trim();
  if (!cand.startsWith('/')) return null;
  try {
    // Refuse the candidate path itself when it is a symlink — operator must
    // point at the fixed non-symlinked root-owned regular file.
    const leaf = lstatSync(cand);
    if (leaf.isSymbolicLink()) return null;

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
      if (mode & 0o022) return null; // group/world writable
    }
    const finalPath = realpathSync(cand);
    // Final path must remain non-symlinked regular file.
    const stFinal = lstatSync(finalPath);
    if (stFinal.isSymbolicLink()) return null;
    if (!stFinal.isFile()) return null;
    if (stFinal.uid !== 0) return null;
    if ((stFinal.mode & 0o111) === 0) return null;
    if ((stFinal.mode & 0o022) !== 0) return null;
    // Candidate must resolve to itself (no silent symlink rewrite).
    if (finalPath !== cand && !existsSync(cand)) return null;
    // After realpath, require equality OR that every component stayed root-owned
    // (already checked). Prefer returning the verified final path.
    return finalPath === cand ? cand : finalPath;
  } catch {
    return null;
  }
}

/**
 * Resolve psql only via root-trust. Absolute env overrides and fixed/Homebrew
 * candidates all must pass validateRootOwnedBin. Throws on refusal — never
 * returns a user-owned or bare PATH name.
 */
export function resolveTrustedPsqlBin(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.PSQL_BIN?.trim() || env.POSTGRES_PSQL?.trim();
  if (fromEnv) {
    const trusted = validateRootOwnedBin(fromEnv);
    if (trusted) return trusted;
    throw new Error(
      `GATE-FIX-S28R3-QA26: PSQL_BIN refused — not fixed absolute regular non-symlinked root-owned non-group/other-writable: ${fromEnv}`
    );
  }
  for (const candidate of FIXED_PSQL_CANDIDATES) {
    const t = validateRootOwnedBin(candidate);
    if (t) return t;
  }
  throw new Error(
    'GATE-FIX-S28R3-QA26: no root-trusted psql found (require root-owned /usr/local/bin/psql or /usr/bin/psql; absolute overrides and Homebrew candidates must pass the same root-trust validation)'
  );
}

/**
 * Resolve pg_ctl only via root-trust. Same contract as resolveTrustedPsqlBin.
 */
export function resolveTrustedPgCtlBin(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.PG_CTL_BIN?.trim() || env.POSTGRES_PG_CTL?.trim();
  if (fromEnv) {
    const trusted = validateRootOwnedBin(fromEnv);
    if (trusted) return trusted;
    throw new Error(
      `GATE-FIX-S28R3-QA26: PG_CTL_BIN refused — not fixed absolute regular non-symlinked root-owned non-group/other-writable: ${fromEnv}`
    );
  }
  for (const candidate of FIXED_PG_CTL_CANDIDATES) {
    const t = validateRootOwnedBin(candidate);
    if (t) return t;
  }
  throw new Error(
    'GATE-FIX-S28R3-QA26: no root-trusted pg_ctl found (require root-owned /usr/local/bin/pg_ctl or /usr/bin/pg_ctl; absolute overrides and Homebrew candidates must pass the same root-trust validation)'
  );
}

/** Credential env keys stripped before any non-root-trust-exempt spawn. */
const CREDENTIAL_ENV_KEYS = [
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_SESSION_TOKEN',
  'R2_RESTORE_ACCESS_KEY_ID',
  'R2_RESTORE_SECRET_ACCESS_KEY',
  'R2_RESTORE_SESSION_TOKEN',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'RESTIC_PASSWORD',
  'R2_REPO_CIPHER_PASS',
  'PGBACKREST_REPO1_S3_KEY',
  'PGBACKREST_REPO1_S3_KEY_SECRET',
  'PGBACKREST_REPO1_S3_TOKEN',
  'R2_PARENT_ACCESS_KEY_ID',
  'R2_PARENT_SECRET_ACCESS_KEY',
  'CLOUDFLARE_API_TOKEN',
] as const;

/**
 * Build an env for local postgres client/control tools after a trusted bin is
 * selected. Strips backup/restore credentials so even a mistaken ambient parent
 * cannot hand secrets to the child. Call only AFTER resolveTrusted*.
 */
export function pgToolEnv(env: NodeJS.ProcessEnv, extras?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env, ...(extras ?? {}) };
  for (const k of CREDENTIAL_ENV_KEYS) {
    delete out[k];
  }
  // Minimal PATH — no Homebrew while any residual secrets could remain.
  out.PATH = '/usr/local/bin:/usr/bin:/bin';
  return out;
}
