/**
 * Test for ReleaseCard component
 *
 * Tests verify component structure, theme usage, and React Native patterns
 * without importing the component directly (vitest environment limitation).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('ReleaseCard - Component Structure', () => {
  const componentPath = join(process.cwd(), 'components', 'subscriptions', 'ReleaseCard.tsx')

  const readComponent = (): string => {
    return readFileSync(componentPath, 'utf-8')
  }

  describe('AC-1: ReleaseCard with version "v2.1.0" renders version badge prominently as pill', () => {
    it('should have version badge with testID', () => {
      const source = readComponent()
      expect(source).toContain('version-badge')
    })

    it('should use primary color for version badge background', () => {
      const source = readComponent()
      expect(source).toContain('backgroundColor: colors.primary')
    })

    it('should use full radius for pill shape', () => {
      const source = readComponent()
      expect(source).toContain('borderRadius: radius.full')
    })

    it('should display version text', () => {
      const source = readComponent()
      expect(source).toContain('{version}')
    })

    it('should use primaryForeground for version text color', () => {
      const source = readComponent()
      expect(source).toContain('colors.primaryForeground')
    })
  })

  describe('AC-2: ReleaseCard with summary truncates to 2-3 lines', () => {
    it('should have summary testID', () => {
      const source = readComponent()
      expect(source).toContain('summary')
    })

    it('should use SummaryText component', () => {
      const source = readComponent()
      expect(source).toContain('SummaryText')
      expect(source).toContain("from './SummaryText'")
    })

    it('should pass summary prop to SummaryText', () => {
      const source = readComponent()
      expect(source).toContain('summary={summary}')
    })
  })

  describe('AC-3: ReleaseCard with changelogUrl displays "View changelog" button', () => {
    it('should have changelog button testID', () => {
      const source = readComponent()
      expect(source).toContain('changelog-btn')
    })

    it('should use Button component from ui/button', () => {
      const source = readComponent()
      expect(source).toMatch(/from ['"]@\/components\/ui\/button['"]/)
      expect(source).toContain('<Button')
    })

    it('should display "View changelog" text', () => {
      const source = readComponent()
      expect(source).toContain('View changelog')
    })

    it('should conditionally render changelog button', () => {
      const source = readComponent()
      expect(source).toMatch(/changelogUrl\s*&&/)
    })

    it('should use ghost variant for button', () => {
      const source = readComponent()
      expect(source).toContain('variant="ghost"')
    })
  })

  describe('AC-4: User tap on ReleaseCard fires onPress callback', () => {
    it('should use Pressable component', () => {
      const source = readComponent()
      expect(source).toContain('Pressable')
    })

    it('should have onPress prop handler', () => {
      const source = readComponent()
      expect(source).toContain('onPress={onPress}')
    })

    it('should apply opacity change on press', () => {
      const source = readComponent()
      expect(source).toMatch(/pressed.*\?.*0\.7.*:.*1/)
    })
  })

  describe('AC-5: ReleaseCard without repositoryName falls back to source name', () => {
    it('should have source testID', () => {
      const source = readComponent()
      expect(source).toContain('-source')
    })

    it('should use repositoryName or source fallback', () => {
      const source = readComponent()
      expect(source).toMatch(/displayName\s*=\s*repositoryName\s*\|\|\s*source/)
    })

    it('should display source/repository name', () => {
      const source = readComponent()
      expect(source).toContain('{displayName}')
    })
  })

  describe('Theme Compliance', () => {
    it('should use useTheme hook', () => {
      const source = readComponent()
      expect(source).toContain('useTheme')
      expect(source).toMatch(/from ['"]@\/hooks\/use-theme['"]/)
    })

    it('should use theme colors for styling', () => {
      const source = readComponent()
      expect(source).toContain('colors.card')
      expect(source).toContain('colors.border')
      expect(source).toContain('colors.foreground')
      expect(source).toContain('colors.mutedForeground')
      expect(source).toContain('colors.primary')
      expect(source).toContain('colors.primaryForeground')
    })

    it('should use theme spacing', () => {
      const source = readComponent()
      expect(source).toContain('spacing.md')
      expect(source).toContain('spacing.sm')
      expect(source).toContain('spacing.xs')
    })

    it('should use theme radius', () => {
      const source = readComponent()
      expect(source).toContain('radius.xl')
      expect(source).toContain('radius.full')
    })

    it('should NOT contain hardcoded hex colors in inline styles', () => {
      const source = readComponent()
      const inlineHexRegex = /color:\s*['"]#[0-9a-fA-F]{6}['"]/g
      const matches = source.match(inlineHexRegex) || []
      expect(matches.length).toBe(0)
    })

    it('should NOT contain hardcoded spacing values in StyleSheet', () => {
      const source = readComponent()
      const hardcodedSpacingInStylesheet = /(?:padding|margin):\s*\d+[^,}]/g
      const matches = source.match(hardcodedSpacingInStylesheet) || []
      // StyleSheet should not have hardcoded spacing
      const disallowedSpacing = matches.filter(
        (match) => !match.includes('marginTop:')
      )
      expect(disallowedSpacing.length).toBe(0)
    })

    it('should NOT contain hardcoded fontSize', () => {
      const source = readComponent()
      const hardcodedFontSizeRegex = /fontSize:\s*\d+/
      const matches = source.match(hardcodedFontSizeRegex)
      expect(matches?.length ?? 0).toBe(0)
    })
  })

  describe('Component Structure', () => {
    it('should export ReleaseCard as a named export', () => {
      const source = readComponent()
      expect(source).toContain('export')
      expect(source).toContain('ReleaseCard')
    })

    it('should have ReleaseCardProps interface', () => {
      const source = readComponent()
      expect(source).toMatch(/interface\s+ReleaseCardProps/)
    })

    it('should have required props', () => {
      const source = readComponent()
      expect(source).toContain('version: string')
      expect(source).toContain('title: string')
      expect(source).toContain('source: string')
    })

    it('should have optional props', () => {
      const source = readComponent()
      expect(source).toContain('summary?:')
      expect(source).toContain('repositoryName?:')
      expect(source).toContain('publishedAt?:')
      expect(source).toContain('changelogUrl?:')
      expect(source).toContain('onPress?:')
      expect(source).toContain('testID?:')
    })

    it('should have default testID value', () => {
      const source = readComponent()
      expect(source).toContain("testID = 'release-card'")
    })
  })

  describe('React Native Patterns', () => {
    it('should use StyleSheet.create for static styles', () => {
      const source = readComponent()
      expect(source).toContain('StyleSheet.create')
    })

    it('should import Pressable from react-native', () => {
      const source = readComponent()
      expect(source).toMatch(/from ['"]react-native['"]/)
      expect(source).toContain('Pressable')
    })

    it('should use Text from ui/text component', () => {
      const source = readComponent()
      expect(source).toMatch(/from ['"]@\/components\/ui\/text['"]/)
    })
  })

  describe('Content Section', () => {
    it('should have title testID', () => {
      const source = readComponent()
      expect(source).toContain('-title')
    })

    it('should truncate title to 2 lines', () => {
      const source = readComponent()
      // Check for numberOfLines={2} in the component
      expect(source).toContain('numberOfLines={2}')
    })

    it('should have content testID', () => {
      const source = readComponent()
      expect(source).toContain('-content')
    })

    it('should have header testID', () => {
      const source = readComponent()
      expect(source).toContain('-header')
    })

    it('should have publishedAt testID', () => {
      const source = readComponent()
      expect(source).toContain('-published-at')
    })

    it('should conditionally render publishedAt', () => {
      const source = readComponent()
      expect(source).toMatch(/publishedAt\s*&&/)
    })
  })

  describe('Styling', () => {
    it('should use border for card container', () => {
      const source = readComponent()
      expect(source).toContain('borderWidth: 1')
    })

    it('should set overflow to hidden', () => {
      const source = readComponent()
      expect(source).toContain('overflow: \'hidden\'')
    })

    it('should use flexbox for layout', () => {
      const source = readComponent()
      expect(source).toContain('flexDirection: \'row\'')
    })
  })
})
