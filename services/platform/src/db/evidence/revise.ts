/**
 * evidence:revise — call SECURITY DEFINER revise_belief(...) on real Postgres.
 */
import { createSql } from '../client';
import { resolveDatabaseUrl } from '../connection';

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
  messages: string[];
  errors: string[];
}

/**
 * Call public.revise_belief(...) and return the successor belief id.
 */
export async function reviseBelief(input: ReviseBeliefInput): Promise<ReviseBeliefResult> {
  const databaseUrl = input.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  const messages: string[] = [];
  const errors: string[] = [];
  const confidence = input.confidence ?? null;
  const validFrom = input.validFrom ?? null;
  const validTo = input.validTo ?? null;

  try {
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
 * Insert a single open belief (tx_to IS NULL) via SECURITY DEFINER seed_open_belief.
 * holocron_app has no raw INSERT on beliefs after 0006; this is the authorized path.
 */
export async function seedOpenBelief(input?: SeedOpenBeliefInput): Promise<SeedOpenBeliefResult> {
  const databaseUrl = input?.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
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
    const rows = await sql<{ id: string }[]>`
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
    const beliefId = rows[0]?.id ?? null;
    return {
      ok: beliefId !== null,
      beliefId,
      claimId,
      statement,
      errors: beliefId ? errors : ['failed to seed open belief via seed_open_belief'],
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { ok: false, beliefId: null, claimId, statement, errors };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
