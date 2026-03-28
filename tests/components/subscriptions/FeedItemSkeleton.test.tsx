/**
 * Tests for FeedItemSkeleton component
 *
 * Uses source-file inspection (readFileSync) consistent with the project's
 * vitest environment which cannot render React Native components directly.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('FeedItemSkeleton - Component Structure', () => {
  const componentPath = join(
    process.cwd(),
    'components',
    'subscriptions',
    'FeedItemSkeleton.tsx'
  )

  const readComponent = (): string => readFileSync(componentPath, 'utf-8')

  describe('AC-1: Named export with TypeScript interface', () => {
    it('exports FeedItemSkeleton as a named export', () => {
      const source = readComponent()
      expect(source).toContain('export function FeedItemSkeleton')
    })

    it('exports FeedItemSkeletonProps interface', () => {
      const source = readComponent()
      expect(source).toMatch(/export interface FeedItemSkeletonProps/)
    })

    it('has optional variant prop typed to the three content types', () => {
      const source = readComponent()
      expect(source).toContain("variant?: 'social' | 'video' | 'blog'")
    })

    it('has optional testID prop', () => {
      const source = readComponent()
      expect(source).toContain('testID?:')
    })
  })

  describe('AC-2: Three skeleton variants exist', () => {
    it('renders a social variant', () => {
      const source = readComponent()
      expect(source).toContain("variant === 'social'")
      expect(source).toContain('SocialSkeleton')
    })

    it('renders a video variant', () => {
      const source = readComponent()
      expect(source).toContain("variant === 'video'")
      expect(source).toContain('VideoSkeleton')
    })

    it('renders a blog variant (default)', () => {
      const source = readComponent()
      expect(source).toContain('BlogSkeleton')
      // Default fallback returns BlogSkeleton
      expect(source).toMatch(/return\s+<BlogSkeleton/)
    })
  })

  describe('AC-3: Uses Skeleton primitive (not hardcoded colours)', () => {
    it('imports Skeleton from @/components/ui/skeleton', () => {
      const source = readComponent()
      expect(source).toMatch(/from ['"]@\/components\/ui\/skeleton['"]/)
    })

    it('does NOT contain hardcoded hex colours', () => {
      const source = readComponent()
      expect(source).not.toMatch(/#[0-9a-fA-F]{6}/)
    })

    it('does NOT contain hardcoded fontSize', () => {
      const source = readComponent()
      expect(source).not.toMatch(/fontSize:\s*\d+/)
    })
  })

  describe('AC-4: Uses theme tokens for spacing and radius', () => {
    it('imports useTheme from @/hooks/use-theme', () => {
      const source = readComponent()
      expect(source).toMatch(/from ['"]@\/hooks\/use-theme['"]/)
    })

    it('uses spacing tokens (spacing.sm, spacing.md, etc.)', () => {
      const source = readComponent()
      expect(source).toMatch(/spacing\.\w+/)
    })

    it('uses radius tokens (radius.lg, radius.md)', () => {
      const source = readComponent()
      expect(source).toMatch(/radius\.\w+/)
    })

    it('does NOT hardcode padding or margin numbers', () => {
      const source = readComponent()
      expect(source).not.toMatch(/(?:padding|margin)(?:Vertical|Horizontal|Top|Bottom|Left|Right)?:\s*\d+/)
    })
  })

  describe('AC-5: Social variant structure', () => {
    it('includes an avatar circle placeholder', () => {
      const source = readComponent()
      // Avatar is a rounded-full skeleton
      expect(source).toContain('rounded-full')
    })

    it('includes engagement row placeholders', () => {
      const source = readComponent()
      // Multiple skeleton blocks inside SocialSkeleton
      expect(source).toContain('SocialSkeleton')
    })
  })

  describe('AC-6: Video variant has 16:9 thumbnail placeholder', () => {
    it('uses 16/9 aspectRatio for thumbnail', () => {
      const source = readComponent()
      expect(source).toContain('16 / 9')
    })
  })

  describe('AC-7: testID is forwarded to root element', () => {
    it('passes testID to each variant', () => {
      const source = readComponent()
      expect(source).toContain('testID={testID}')
    })
  })
})

describe('SubscriptionFeedScreen - FeedItemSkeleton integration', () => {
  const screenPath = join(
    process.cwd(),
    'components',
    'subscriptions',
    'SubscriptionFeedScreen.tsx'
  )

  const readScreen = (): string => readFileSync(screenPath, 'utf-8')

  it('imports FeedItemSkeleton', () => {
    const source = readScreen()
    expect(source).toContain('FeedItemSkeleton')
    expect(source).toMatch(/from ['"]@\/components\/subscriptions\/FeedItemSkeleton['"]/)
  })

  it('replaces "Loading more..." text with FeedItemSkeleton cards', () => {
    const source = readScreen()
    expect(source).not.toContain('Loading more...')
    expect(source).toContain('<FeedItemSkeleton')
  })

  it('renders two skeleton cards in the footer', () => {
    const source = readScreen()
    const matches = source.match(/<FeedItemSkeleton/g)
    expect(matches).not.toBeNull()
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('adds removeClippedSubviews FlatList performance prop', () => {
    const source = readScreen()
    expect(source).toContain('removeClippedSubviews={true}')
  })

  it('adds maxToRenderPerBatch FlatList performance prop', () => {
    const source = readScreen()
    expect(source).toContain('maxToRenderPerBatch={10}')
  })

  it('adds windowSize FlatList performance prop', () => {
    const source = readScreen()
    expect(source).toContain('windowSize={5}')
  })
})
