/**
 * Frozen component vocabulary for a research run.
 * Callers enforce depth/breadth floors; this module only freezes + detects mutation.
 */
import { createHash } from 'node:crypto';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;

export type FrozenComponents = {
  readonly components: readonly string[];
  readonly hash: string;
};

function sortedUnique(components: string[]): string[] {
  return [...new Set(components)].sort();
}

function hashSorted(components: string[]): string {
  return createHash('sha256')
    .update(JSON.stringify(sortedUnique(components)))
    .digest('hex');
}

function assertValidSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`invalid component slug: ${slug}`);
  }
}

export function freezeComponents(components: string[]): FrozenComponents {
  for (const slug of components) {
    assertValidSlug(slug);
  }
  const unique = sortedUnique(components);
  return Object.freeze({
    components: Object.freeze([...unique]),
    hash: hashSorted(unique),
  });
}

export function assertComponentsFrozen(frozen: FrozenComponents, current: string[]): void {
  if (hashSorted(current) !== frozen.hash) {
    throw new Error('RESEARCH_COMPONENTS_MUTATED');
  }
}
