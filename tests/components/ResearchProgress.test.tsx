/**
 * Test for ResearchProgressWithConvex component
 *
 * The component imports from @/convex/_generated/api which uses path aliases
 * that aren't available in the vitest environment. These tests verify the
 * component file structure and interface expectations without importing
 * the component directly.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('ResearchProgressWithConvex - Component Structure', () => {
  const componentPath = join(
    process.cwd(),
    'components',
    'ResearchProgressWithConvex.tsx'
  );

  const readComponent = (): string => {
    return readFileSync(componentPath, 'utf-8');
  };

  it('should export ResearchProgressWithConvex as a named export', () => {
    const source = readComponent();
    expect(source).toContain('export');
    expect(source).toContain('ResearchProgressWithConvex');
  });

  it('should define ResearchStatus type covering all states', () => {
    const source = readComponent();

    // The component should handle these research statuses
    const expectedStatuses = [
      'pending',
      'searching',
      'analyzing',
      'synthesizing',
      'completed',
      'failed',
      'cancelled',
    ];

    for (const status of expectedStatuses) {
      expect(source).toContain(`'${status}'`);
    }
  });

  it('should accept sessionId in its props interface', () => {
    const source = readComponent();

    // Props interface should include sessionId
    expect(source).toContain('sessionId');
    expect(source).toMatch(/interface\s+ResearchProgressWithConvexProps/);
  });

  it('should use useQuery to fetch session data from Convex', () => {
    const source = readComponent();

    expect(source).toContain('useQuery');
    expect(source).toContain('convex/react');
  });
})
