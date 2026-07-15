/**
 * evidence:revise — call SECURITY DEFINER revise_belief(...) on real Postgres.
 */
import { createSql } from '../client';
import { resolveProductDatabaseUrl } from './roles';

export interface ReviseBeliefInput {
  beliefId: string;
  actor: string;
  runId: string;
  idempotencyKey: string;
  statement: string;
  confidence?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  databaseUrl?: string;
}

export interface ReviseBeliefResult {
  ok: boolean;
  successorId: string | null;
  predecessorId: string;
  actor: string;
  runId: string;
  idempotencyKey: string;
  statement: string;
  confidence: number | null;
  /** Session role observed on the product connection (must be holocron_app). */
  sessionRole: string | null;
  messages: string[];
  errors: string[];
}

/**
 * Call public.revise_belief(...) and return the successor belief id.
 */
export async function reviseBelief(input: ReviseBeliefInput): Promise<ReviseBeliefResult> {
  // Product path: bind to holocron_app unless caller supplies an explicit URL override.
  const databaseUrl = input.databaseUrl ?? resolveProductDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  const messages: string[] = [];
  const errors: string[] = [];
  const confidence = input.confidence ?? null;
  const validFrom = input.validFrom ?? null;
  const validTo = input.validTo ?? null;
  let sessionRole: string | null = null;

  try {
    const who = await sql<{ current_user: string }[]>`SELECT current_user::text`;
    sessionRole = who[0]?.current_user ?? null;
    messages.push(`current_user: ${sessionRole ?? ''}`);

    const rows = await sql<{ revise_belief: string }[]>`
      SELECT revise_belief(
        ${input.beliefId}::uuid,
        ${input.actor},
        ${input.runId},
        ${input.idempotencyKey},
        ${input.statement},
        ${confidence},
        ${validFrom}::timestamptz,
        ${validTo}::timestamptz
      )::text AS revise_belief
    `;
    const successorId = rows[0]?.revise_belief ?? null;
    if (!successorId) {
      errors.push('revise_belief returned no id');
      return {
        ok: false,
        successorId: null,
        predecessorId: input.beliefId,
        actor: input.actor,
        runId: input.runId,
        idempotencyKey: input.idempotencyKey,
        statement: input.statement,
        confidence,
        sessionRole,
        messages,
        errors,
      };
    }
    messages.push(`successorId: ${successorId}`);
    messages.push(`predecessorId: ${input.beliefId}`);
    messages.push(`actor: ${input.actor}`);
    messages.push(`runId: ${input.runId}`);
    messages.push(`idempotencyKey: ${input.idempotencyKey}`);
    return {
      ok: true,
      successorId,
      predecessorId: input.beliefId,
      actor: input.actor,
      runId: input.runId,
      idempotencyKey: input.idempotencyKey,
      statement: input.statement,
      confidence,
      sessionRole,
      messages,
      errors,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    return {
      ok: false,
      successorId: null,
      predecessorId: input.beliefId,
      actor: input.actor,
      runId: input.runId,
      idempotencyKey: input.idempotencyKey,
      statement: input.statement,
      confidence,
      sessionRole,
      messages,
      errors,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export interface SeedOpenBeliefInput {
  claimId?: string;
  statement?: string;
  confidence?: number;
  actor?: string;
  runId?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  databaseUrl?: string;
}

export interface SeedOpenBeliefResult {
  ok: boolean;
  beliefId: string | null;
  claimId: string;
  statement: string;
  errors: string[];
}

/**
 * Insert a single open belief (tx_to IS NULL) for immutability / revise tests.
 * Prefers SECURITY DEFINER seed_open_belief (H1) so holocron_app product path works
 * after beliefs INSERT is revoked; falls back to direct INSERT when the function is absent.
 */
export async function seedOpenBelief(input?: SeedOpenBeliefInput): Promise<SeedOpenBeliefResult> {
  // Product default is holocron_app; tests may pass owner URL for privileged fixture seeding.
  const databaseUrl = input?.databaseUrl ?? resolveProductDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  const claimId = input?.claimId ?? `claim-ledger-2-${Date.now()}`;
  const statement = input?.statement ?? 'Initial open belief for ledger-2';
  const confidence = input?.confidence ?? 0.5;
  const actor = input?.actor ?? 'seed';
  const runId = input?.runId ?? null;
  const validFrom = input?.validFrom ?? null;
  const validTo = input?.validTo ?? null;
  const errors: string[] = [];

  try {
    // Prefer DEFINER when present (0006+); works as holocron_app.
    try {
      const fnRows = await sql<{ id: string }[]>`
        SELECT seed_open_belief(
          ${claimId},
          ${statement},
          ${confidence},
          ${actor},
          ${runId},
          ${validFrom}::timestamptz,
          ${validTo}::timestamptz
        )::text AS id
      `;
      const beliefId = fnRows[0]?.id ?? null;
      if (beliefId) {
        return { ok: true, beliefId, claimId, statement, errors };
      }
    } catch (fnErr) {
      const fnMsg = fnErr instanceof Error ? fnErr.message : String(fnErr);
      // Fall back only when the function is missing; permission errors on INSERT path below.
      if (!/function seed_open_belief|does not exist/i.test(fnMsg)) {
        errors.push(fnMsg);
        return { ok: false, beliefId: null, claimId, statement, errors };
      }
    }

    const rows = await sql<{ id: string }[]>`
      INSERT INTO beliefs (claim_id, statement, confidence, tx_from, tx_to, actor)
      VALUES (
        ${claimId},
        ${statement},
        ${confidence},
        now(),
        NULL,
        ${actor}
      )
      RETURNING id::text AS id
    `;
    const beliefId = rows[0]?.id ?? null;
    return {
      ok: beliefId !== null,
      beliefId,
      claimId,
      statement,
      errors: beliefId ? errors : ['failed to insert open belief'],
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { ok: false, beliefId: null, claimId, statement, errors };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
