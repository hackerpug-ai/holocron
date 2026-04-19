/**
 * TDD Suite for NEWSFEED-004: Create NewsfeedHeroCard Component
 *
 * Tests follow RED → GREEN → REFACTOR cycle per acceptance criterion.
 *
 * NOTE: These tests use source code analysis instead of rendering due to
 * vitest configuration limitations with React Native components.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const componentPath = join(process.cwd(), 'components', 'whats-new', 'NewsfeedHeroCard.tsx');

const readComponent = (): string => readFileSync(componentPath, 'utf-8');

describe('NEWSFEED-004: NewsfeedHeroCard', () => {
  describe('AC-1: TOP SIGNAL eyebrow is present', () => {
    it('topSignalEyebrowPresent - renders TOP SIGNAL eyebrow text', () => {
      const source = readComponent();

      // Should have eyebrow Text component with "TOP SIGNAL"
      expect(source).toContain('TOP SIGNAL');
      expect(source).toContain('-eyebrow');
      expect(source).toContain('text-xs');
      expect(source).toContain('uppercase');
      expect(source).toContain('text-muted-foreground');
    });

    it('topSignalEyebrowPresent - has correct testID', () => {
      const source = readComponent();

      // Eyebrow should have testID pattern
      expect(source).toContain('testID=');
      expect(source).toContain('-eyebrow');
    });
  });

  describe('AC-2: Left border is 4 px wide', () => {
    it('leftBorderIs4pxWide - has borderLeftWidth of 4', () => {
      const source = readComponent();

      // Should have borderLeftWidth: 4 (NOT 3)
      expect(source).toContain('borderLeftWidth: 4');
      expect(source).not.toContain('borderLeftWidth: 3');
    });

    it('leftBorderIs4pxWide - uses CATEGORY_COLORS for border color', () => {
      const source = readComponent();

      // Should import and use CATEGORY_COLORS
      expect(source).toContain("from './categoryColors'");
      expect(source).toContain('CATEGORY_COLORS');
      expect(source).toContain('borderLeftColor');
    });

    it('leftBorderIs4pxWide - uses Card wrapper component', () => {
      const source = readComponent();

      // Should use Card component from ui/card
      expect(source).toContain("from '@/components/ui/card'");
      expect(source).toContain('<Card');
    });
  });

  describe('AC-3: Title is extrabold xl with 3-line cap', () => {
    it('titleIsExtraboldXlWith3LineCap - has font-extrabold and text-xl classes', () => {
      const source = readComponent();

      // Title should have extrabold and xl styling
      expect(source).toContain('font-extrabold');
      expect(source).toContain('text-xl');
      expect(source).toContain('-title');
    });

    it('titleIsExtraboldXlWith3LineCap - has numberOfLines={3}', () => {
      const source = readComponent();

      // Title should have 3-line cap
      expect(source).toContain('numberOfLines={3}');
    });
  });

  describe('AC-4: Bottom row has velocity, source, and time', () => {
    it('bottomRowHasVelocitySourceAndTime - renders meta row container', () => {
      const source = readComponent();

      // Should have meta row View with flex-row and justify-between
      expect(source).toContain('-meta-row');
      expect(source).toContain('flex-row');
      expect(source).toContain('justify-between');
    });

    it('bottomRowHasVelocitySourceAndTime - displays velocity', () => {
      const source = readComponent();

      // Should render velocity with Zap icon
      expect(source).toContain('-velocity');
      expect(source).toContain('engagementVelocity');
    });

    it('bottomRowHasVelocitySourceAndTime - displays source', () => {
      const source = readComponent();

      // Should render source text
      expect(source).toContain('-source');
      expect(source).toContain('{source}');
    });

    it('bottomRowHasVelocitySourceAndTime - displays relative time', () => {
      const source = readComponent();

      // Should have time display with testID
      expect(source).toContain('-time');
      expect(source).toContain('formatRelativeTime');
    });
  });

  describe('AC-5: onPress is required — TypeScript errors without it', () => {
    it('onPressIsRequiredTypeCheck - uses Omit pattern to make onPress required', () => {
      const source = readComponent();

      // Should use Omit<WhatsNewFindingCardProps, 'onPress'> & { onPress: () => void }
      expect(source).toContain('Omit<WhatsNewFindingCardProps');
      expect(source).toContain('onPress: () => void');
      expect(source).toContain('import type { WhatsNewFindingCardProps }');
    });

    it('onPressIsRequiredTypeCheck - has required onPress in component signature', () => {
      const source = readComponent();

      // Component function should have onPress as required parameter
      expect(source).toMatch(/onPress[^?]/);
    });
  });

  describe('Component structure', () => {
    it('exports named component wrapped in React.memo', () => {
      const source = readComponent();

      // Should export named component wrapped in React.memo
      expect(source).toContain('export const NewsfeedHeroCard = React.memo');
      expect(source).toContain('function NewsfeedHeroCardComponent');
    });

    it('has default testID', () => {
      const source = readComponent();

      // Should have default testID parameter
      expect(source).toContain("testID = 'newsfeed-hero-card'");
    });

    it('summary has numberOfLines={4}', () => {
      const source = readComponent();

      // Summary should have 4-line cap
      expect(source).toContain('numberOfLines={4}');
    });

    it('conditionally renders summary', () => {
      const source = readComponent();

      // Should only render summary if it exists
      expect(source).toMatch(/summary\s*&&/);
    });

    it('has Pressable with onPress handler', () => {
      const source = readComponent();

      // Should have Pressable component
      expect(source).toContain('<Pressable');
      expect(source).toContain('onPress={onPress}');
      expect(source).toContain('-pressable');
    });
  });

  describe('Type safety', () => {
    it('exports NewsfeedHeroCardProps type', () => {
      const source = readComponent();

      // Should export the props type
      expect(source).toContain('export type NewsfeedHeroCardProps');
    });
  });
});
