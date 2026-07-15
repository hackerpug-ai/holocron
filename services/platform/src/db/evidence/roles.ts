/**
 * Application vs privileged DB roles for beliefs immutability (ledger-2 / H1).
 * holocron_app: SELECT on beliefs; EXECUTE seed_open_belief + revise_belief;
 *   no INSERT/UPDATE/DELETE (closed-history INSERT forgery path closed by 0006).
 * holocron_owner: INSERT/UPDATE/DELETE + SECURITY DEFINER owner of seed_open_belief + revise_belief.
 */
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
