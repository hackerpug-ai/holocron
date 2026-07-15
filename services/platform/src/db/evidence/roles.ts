/**
 * Application vs privileged DB roles for beliefs immutability (ledger-2).
 * holocron_app: SELECT (+ seed-table INSERT); EXECUTE revise_belief; no UPDATE/DELETE on beliefs.
 * holocron_owner: UPDATE/DELETE + SECURITY DEFINER owner of revise_belief / seed_open_belief.
 */
import { resolveDatabaseUrl } from '../connection';

export const HOLOCRON_APP_ROLE = 'holocron_app';
export const HOLOCRON_OWNER_ROLE = 'holocron_owner';

/**
 * Rewrite a postgres connection string to authenticate as holocron_app.
 * Trust auth on loopback accepts the role without a password (provisioning model).
 */
export function toAppRoleDatabaseUrl(databaseUrl: string): string {
  try {
    const u = new URL(databaseUrl);
    u.username = HOLOCRON_APP_ROLE;
    u.password = '';
    // URL.password '' may leave trailing ':' — strip empty password form.
    return u.toString().replace(`://${HOLOCRON_APP_ROLE}:@`, `://${HOLOCRON_APP_ROLE}@`);
  } catch {
    // Fallback for non-URL forms like postgres://host/db
    if (databaseUrl.includes('://')) {
      return databaseUrl
        .replace(/:\/\/([^/@]*)@/, `://${HOLOCRON_APP_ROLE}@`)
        .replace(/:\/\/([^/]+)/, (match, hostPart: string) => {
          if (hostPart.includes('@')) return match;
          return `://${HOLOCRON_APP_ROLE}@${hostPart}`;
        });
    }
    return databaseUrl;
  }
}

/**
 * Default product/CLI evidence connection: raw DATABASE_URL rewritten to holocron_app.
 * Use for seed / revise / belief as-of / register-doc / probe-raw product paths.
 * Admin/migrate must NOT use this — call resolveOwnerDatabaseUrl / resolveDatabaseUrl.
 */
export function resolveProductDatabaseUrl(options?: { preferHolocron?: boolean }): string {
  const base = resolveDatabaseUrl(options === undefined ? { preferHolocron: true } : options);
  return toAppRoleDatabaseUrl(base);
}
