/**
 * Shared helpers for embedding backfill handlers.
 * Uses the real fleet embed() path — never fabricates vectors.
 */
import { embed } from '../../inference/embed.ts';

export const EMBED_DIM = 1024;
export const BACKFILL_BATCH = 5;

export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

export function normalizeUnitVector(vector: number[]): number[] {
  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || norm <= 0) {
    throw new Error('refused zero/invalid norm vector');
  }
  return vector.map((value) => value / norm);
}

/**
 * Embed a non-empty document string via the live fleet role.
 * Throws on fleet failure, wrong dim, or zero vector.
 */
export async function embedDocumentText(text: string): Promise<number[]> {
  const vector = await embed(text, 'document');
  if (!Array.isArray(vector) || vector.length !== EMBED_DIM) {
    throw new Error(
      `embed dimension mismatch: got ${Array.isArray(vector) ? vector.length : 0}, expected ${EMBED_DIM}`
    );
  }
  if (vector.every((v) => v === 0)) {
    throw new Error('embed refused all-zero vector');
  }
  return normalizeUnitVector(vector);
}

/** Non-empty text worth embedding. */
export function isEmbeddableText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
