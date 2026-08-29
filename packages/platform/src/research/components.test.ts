/**
 * UNIT_TEST_JUSTIFIED: pure hash/freeze logic with zero I/O.
 */
import { describe, expect, it } from 'vitest';
import { assertComponentsFrozen, freezeComponents } from './components.ts';

describe('freezeComponents', () => {
  it('is order-insensitive', () => {
    const a = freezeComponents(['beta', 'alpha', 'gamma']);
    const b = freezeComponents(['gamma', 'alpha', 'beta']);
    expect(a.hash).toBe(b.hash);
    expect(a.components).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('dedupes before hashing', () => {
    const frozen = freezeComponents(['alpha', 'alpha', 'beta']);
    expect(frozen.components).toEqual(['alpha', 'beta']);
  });

  it('rejects invalid slug', () => {
    expect(() => freezeComponents(['Bad_Slug'])).toThrow(/invalid component slug/);
    expect(() => freezeComponents([''])).toThrow(/invalid component slug/);
    expect(() => freezeComponents(['-leading-dash'])).toThrow(/invalid component slug/);
  });
});

describe('assertComponentsFrozen', () => {
  it('passes when current matches frozen set', () => {
    const frozen = freezeComponents(['market', 'type-system']);
    expect(() => assertComponentsFrozen(frozen, ['type-system', 'market'])).not.toThrow();
  });

  it('throws RESEARCH_COMPONENTS_MUTATED when list changes after freeze', () => {
    const frozen = freezeComponents(['market', 'type-system']);
    expect(() => assertComponentsFrozen(frozen, ['market', 'type-system', 'extra'])).toThrow(
      'RESEARCH_COMPONENTS_MUTATED'
    );
    expect(() => assertComponentsFrozen(frozen, ['market'])).toThrow('RESEARCH_COMPONENTS_MUTATED');
  });
});
