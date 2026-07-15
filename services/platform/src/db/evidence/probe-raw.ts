/**
 * db:probe --raw — execute operator SQL as the application role (holocron_app).
 * Used to demonstrate ERROR 42501 on direct UPDATE/DELETE of beliefs.
 */
import { createSql } from '../client';
import { resolveDatabaseUrl } from '../connection';
import { HOLOCRON_APP_ROLE, toAppRoleDatabaseUrl } from './roles';

export interface RawProbeResult {
  ok: boolean;
  /** True when SQL raised permission denied (SQLSTATE 42501). */
  permissionDenied: boolean;
  sqlstate: string | null;
  sql: string;
  role: string;
  rowCount: number | null;
  messages: string[];
  errors: string[];
  /** Combined operator-facing text (stdout). */
  report: string;
}

/**
 * Run raw SQL as holocron_app (never as superuser) so REVOKE is observable.
 */
export async function probeRawSql(
  sqlText: string,
  options?: { databaseUrl?: string }
): Promise<RawProbeResult> {
  const baseUrl = options?.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const appUrl = toAppRoleDatabaseUrl(baseUrl);
  const sql = createSql(appUrl);
  const messages: string[] = [];
  const errors: string[] = [];
  let permissionDenied = false;
  let sqlstate: string | null = null;
  let rowCount: number | null = null;

  messages.push(`role: ${HOLOCRON_APP_ROLE}`);
  messages.push(`sql: ${sqlText}`);

  try {
    const who = await sql<{ current_user: string }[]>`SELECT current_user::text`;
    const role = who[0]?.current_user ?? HOLOCRON_APP_ROLE;
    messages.push(`current_user: ${role}`);
    if (role !== HOLOCRON_APP_ROLE) {
      errors.push(`expected session role ${HOLOCRON_APP_ROLE}, got ${role}`);
    }

    const result = await sql.unsafe(sqlText);
    rowCount = Array.isArray(result) ? result.length : null;
    messages.push(`rowCount: ${rowCount ?? 'n/a'}`);
    messages.push('status: OK (statement succeeded)');

    const report = [...messages, ...errors.map((e) => `error: ${e}`)].join('\n');
    return {
      ok: errors.length === 0,
      permissionDenied: false,
      sqlstate: null,
      sql: sqlText,
      role,
      rowCount,
      messages,
      errors,
      report,
    };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const msg = e.message ?? (err instanceof Error ? err.message : String(err));
    sqlstate = e.code ?? null;
    permissionDenied = sqlstate === '42501' || /permission denied/i.test(msg);

    const codeLabel = sqlstate ? `ERROR ${sqlstate}` : 'ERROR';
    errors.push(`${codeLabel}: ${msg.split('\n')[0]}`);
    if (permissionDenied) {
      messages.push(`${codeLabel} permission denied (expected for immutable beliefs DML)`);
    }
    messages.push(`status: FAIL`);

    // Detect operation + table hints for AC-6 observability.
    if (/beliefs/i.test(sqlText)) messages.push(`table: beliefs`);
    if (/^\s*UPDATE/i.test(sqlText)) messages.push(`operation: UPDATE`);
    if (/^\s*DELETE/i.test(sqlText)) messages.push(`operation: DELETE`);

    const report = [...messages, ...errors.map((line) => line)].join('\n');
    return {
      ok: false,
      permissionDenied,
      sqlstate,
      sql: sqlText,
      role: HOLOCRON_APP_ROLE,
      rowCount: 0,
      messages,
      errors,
      report,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
