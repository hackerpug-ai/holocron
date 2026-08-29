import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('article import affordance', () => {
  it('reserves space for an accessible import control beside article search', () => {
    const screen = readFileSync(
      join(process.cwd(), 'packages', 'mobile', 'screens', 'articles-screen.tsx'),
      'utf8'
    );
    const button = readFileSync(
      join(process.cwd(), 'packages', 'mobile', 'components', 'article', 'ImportButton.tsx'),
      'utf8'
    );

    expect(screen).toContain('style={{ minWidth: 0 }}');
    expect(screen).toContain('style={{ width: 36, height: 36, flexShrink: 0 }}');
    expect(button).toContain('accessibilityLabel="Import article"');
    expect(button).toContain('flexShrink: 0');
  });
});
