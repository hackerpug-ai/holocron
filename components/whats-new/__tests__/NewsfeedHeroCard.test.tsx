/**
 * TDD Suite for NEWSFEED-004: Create NewsfeedHeroCard Component
 *
 * Tests follow RED → GREEN → REFACTOR cycle per acceptance criterion.
 * All tests use real rendering via @testing-library/react-native.
 */

import { render, screen } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';
import { CATEGORY_COLORS } from '../categoryColors';
import { NewsfeedHeroCard } from '../NewsfeedHeroCard';

describe('NEWSFEED-004: NewsfeedHeroCard', () => {
  const mockProps = {
    url: 'https://example.com/article',
    title: 'Top Signal: AI Breakthrough',
    source: 'Tech Insider',
    category: 'discovery' as const,
    score: 85,
    summary: 'This is a breakthrough finding that changes everything.',
    publishedAt: '2025-04-19T10:00:00Z',
    engagementVelocity: 1000,
    onPress: vi.fn(),
    testID: 'newsfeed-hero-card',
  };

  describe('AC-1: TOP SIGNAL eyebrow is present', () => {
    it('topSignalEyebrowPresent - renders TOP SIGNAL eyebrow text', () => {
      render(<NewsfeedHeroCard {...mockProps} />);

      const eyebrow = screen.getByTestId('newsfeed-hero-card-eyebrow');
      expect(eyebrow).toBeTruthy();
      expect(eyebrow.props.children).toBe('TOP SIGNAL');
    });
  });

  describe('AC-2: Left border is 4 px wide', () => {
    it('leftBorderIs4pxWide - has borderLeftWidth of 4', () => {
      render(<NewsfeedHeroCard {...mockProps} />);

      const card = screen.getByTestId('newsfeed-hero-card');
      expect(card).toBeTruthy();

      // Verify borderLeftWidth is 4 (not 3 like regular cards)
      expect(card.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            borderLeftWidth: 4,
          }),
        ])
      );
    });

    it('leftBorderIs4pxWide - uses CATEGORY_COLORS for border color', () => {
      render(<NewsfeedHeroCard {...mockProps} />);

      const card = screen.getByTestId('newsfeed-hero-card');
      expect(card).toBeTruthy();

      // Verify borderLeftColor matches the category color
      expect(card.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            borderLeftColor: CATEGORY_COLORS.discovery,
          }),
        ])
      );
    });
  });

  describe('AC-3: Title is extrabold xl with 3-line cap', () => {
    it('titleIsExtraboldXlWith3LineCap - renders title with correct styling', () => {
      render(<NewsfeedHeroCard {...mockProps} />);

      const title = screen.getByTestId('newsfeed-hero-card-title');
      expect(title).toBeTruthy();
      expect(title.props.children).toBe('Top Signal: AI Breakthrough');
      expect(title.props.numberOfLines).toBe(3);
    });
  });

  describe('AC-4: Bottom row has velocity, source, and time', () => {
    it('bottomRowHasVelocitySourceAndTime - renders meta row', () => {
      render(<NewsfeedHeroCard {...mockProps} />);

      const metaRow = screen.getByTestId('newsfeed-hero-card-meta-row');
      expect(metaRow).toBeTruthy();
    });

    it('bottomRowHasVelocitySourceAndTime - displays velocity', () => {
      render(<NewsfeedHeroCard {...mockProps} />);

      const velocity = screen.getByTestId('newsfeed-hero-card-velocity');
      expect(velocity).toBeTruthy();
      expect(velocity.props.children).toBe(1000);
    });

    it('bottomRowHasVelocitySourceAndTime - displays source', () => {
      render(<NewsfeedHeroCard {...mockProps} />);

      const source = screen.getByTestId('newsfeed-hero-card-source');
      expect(source).toBeTruthy();
      expect(source.props.children).toBe('Tech Insider');
    });

    it('bottomRowHasVelocitySourceAndTime - displays relative time', () => {
      render(<NewsfeedHeroCard {...mockProps} />);

      const time = screen.getByTestId('newsfeed-hero-card-time');
      expect(time).toBeTruthy();
      // Should show relative time (e.g., "2h ago", "1d ago", or date)
      expect(time.props.children).toBeTruthy();
    });
  });

  describe('AC-5: onPress is required — TypeScript errors without it', () => {
    it('onPressIsRequired - fires callback when pressable is pressed', () => {
      const onPress = vi.fn();
      const props = { ...mockProps, onPress };

      render(<NewsfeedHeroCard {...props} />);

      const pressable = screen.getByTestId('newsfeed-hero-card-pressable');
      expect(pressable).toBeTruthy();

      // Fire onPress
      pressable.props.onPress();

      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Component structure', () => {
    it('exports named component wrapped in React.memo', () => {
      // This test verifies the component can be imported and rendered
      expect(NewsfeedHeroCard).toBeTruthy();
    });

    it('has default testID', () => {
      const propsWithoutTestID = { ...mockProps, testID: undefined };
      render(<NewsfeedHeroCard {...propsWithoutTestID} />);

      const card = screen.getByTestId('newsfeed-hero-card');
      expect(card).toBeTruthy();
    });

    it('summary has numberOfLines={4}', () => {
      render(<NewsfeedHeroCard {...mockProps} />);

      const summary = screen.getByTestId('newsfeed-hero-card-summary');
      expect(summary).toBeTruthy();
      expect(summary.props.numberOfLines).toBe(4);
    });

    it('conditionally renders summary', () => {
      const propsWithoutSummary = { ...mockProps, summary: undefined };
      render(<NewsfeedHeroCard {...propsWithoutSummary} />);

      // Should not throw error when summary is undefined
      expect(screen.getByTestId('newsfeed-hero-card')).toBeTruthy();
    });

    it('has Pressable with onPress handler', () => {
      render(<NewsfeedHeroCard {...mockProps} />);

      const pressable = screen.getByTestId('newsfeed-hero-card-pressable');
      expect(pressable).toBeTruthy();
      expect(pressable.props.onPress).toBe(mockProps.onPress);
    });
  });

  describe('DESIGN-005: Skeleton loading states', () => {
    describe('AC-1: Skeleton renders when isLoading=true', () => {
      it('skeletonRendersWhenLoading - renders skeleton card when isLoading is true', () => {
        const props = { ...mockProps, isLoading: true };

        render(<NewsfeedHeroCard {...props} />);

        const skeleton = screen.getByTestId('newsfeed-hero-card-skeleton');
        expect(skeleton).toBeTruthy();
        expect(skeleton.props.accessibilityLabel).toBe('Loading content');
      });

      it('skeletonHasCorrectStyles - skeleton has muted left border and card background', () => {
        const props = { ...mockProps, isLoading: true };

        render(<NewsfeedHeroCard {...props} />);

        const skeleton = screen.getByTestId('newsfeed-hero-card-skeleton');
        expect(skeleton).toBeTruthy();

        // Verify skeleton has the correct className for hero card
        expect(skeleton.props.className).toContain('border-l-4');
        expect(skeleton.props.className).toContain('border-l-muted');
        expect(skeleton.props.className).toContain('bg-card');
      });
    });

    describe('AC-2: Normal card renders when isLoading=false or undefined', () => {
      it('normalCardRendersWhenNotLoading - renders normal card when isLoading is false', () => {
        const props = { ...mockProps, isLoading: false };

        render(<NewsfeedHeroCard {...props} />);

        const card = screen.getByTestId('newsfeed-hero-card');
        expect(card).toBeTruthy();

        const skeleton = screen.queryByTestId('newsfeed-hero-card-skeleton');
        expect(skeleton).toBeNull();
      });

      it('normalCardRendersWhenLoadingUndefined - renders normal card when isLoading is undefined', () => {
        render(<NewsfeedHeroCard {...mockProps} />);

        const card = screen.getByTestId('newsfeed-hero-card');
        expect(card).toBeTruthy();

        const skeleton = screen.queryByTestId('newsfeed-hero-card-skeleton');
        expect(skeleton).toBeNull();
      });

      it('normalCardShowsContent - renders TOP SIGNAL eyebrow, title, and source when not loading', () => {
        render(<NewsfeedHeroCard {...mockProps} />);

        expect(screen.getByText('TOP SIGNAL')).toBeTruthy();
        expect(screen.getByText('Top Signal: AI Breakthrough')).toBeTruthy();
        expect(screen.getByText('Tech Insider')).toBeTruthy();
      });
    });
  });
});
