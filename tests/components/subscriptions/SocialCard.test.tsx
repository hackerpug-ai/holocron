/**
 * Tests for SocialCard component
 *
 * Uses source-file inspection (readFileSync) consistent with the project's
 * vitest environment which cannot render React Native components directly.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('SocialCard - Component Structure', () => {
  const componentPath = join(
    process.cwd(),
    'components',
    'subscriptions',
    'SocialCard.tsx'
  )

  const readComponent = (): string => readFileSync(componentPath, 'utf-8')

  describe('AC-1: Named export with TypeScript interface', () => {
    it('exports SocialCard as a named export', () => {
      const source = readComponent()
      expect(source).toContain('export function SocialCard')
    })

    it('exports SocialCardProps interface', () => {
      const source = readComponent()
      expect(source).toMatch(/export interface SocialCardProps/)
    })

    it('has authorAvatarUrl optional prop', () => {
      const source = readComponent()
      expect(source).toContain('authorAvatarUrl?:')
    })

    it('has authorName required prop', () => {
      const source = readComponent()
      expect(source).toContain('authorName:')
    })

    it('has authorHandle required prop', () => {
      const source = readComponent()
      expect(source).toContain('authorHandle:')
    })

    it('has contentPreview required prop', () => {
      const source = readComponent()
      expect(source).toContain('contentPreview:')
    })

    it('has likes optional prop', () => {
      const source = readComponent()
      expect(source).toContain('likes?:')
    })

    it('has comments optional prop', () => {
      const source = readComponent()
      expect(source).toContain('comments?:')
    })

    it('has source required prop', () => {
      const source = readComponent()
      expect(source).toContain('source:')
    })

    it('has optional testID prop', () => {
      const source = readComponent()
      expect(source).toContain('testID?:')
    })
  })

  describe('AC-2: SocialCard with valid authorAvatarUrl renders circular avatar', () => {
    it('renders avatar container with circular styling', () => {
      const source = readComponent()
      expect(source).toContain('rounded-full')
    })

    it('renders avatar element when authorAvatarUrl is provided', () => {
      const source = readComponent()
      expect(source).toContain('authorAvatarUrl')
    })

    it('has testID for avatar element', () => {
      const source = readComponent()
      expect(source).toMatch(/testID=\{[`']\$\{testID\}-avatar[`']\}/)
    })
  })

  describe('AC-3: SocialCard without authorAvatarUrl shows initials fallback', () => {
    it('has getInitials helper function', () => {
      const source = readComponent()
      expect(source).toContain('function getInitials')
      expect(source).toContain('.split(')
      expect(source).toContain('.join(')
      expect(source).toContain('.toUpperCase()')
      expect(source).toContain('.slice(0, 2)')
    })

    it('renders initials fallback when authorAvatarUrl is not provided', () => {
      const source = readComponent()
      expect(source).toMatch(/authorAvatarUrl\s*\?/)
      expect(source).toContain('initials')
    })

    it('has testID for initials element', () => {
      const source = readComponent()
      expect(source).toMatch(/testID=\{[`']\$\{testID\}-initials[`']\}/)
    })
  })

  describe('AC-4: SocialCard with engagement metrics displays likes and comments', () => {
    it('renders likes metric when likes prop is provided', () => {
      const source = readComponent()
      expect(source).toContain('likes !== undefined')
      expect(source).toContain('{likes}')
    })

    it('renders comments metric when comments prop is provided', () => {
      const source = readComponent()
      expect(source).toContain('comments !== undefined')
      expect(source).toContain('{comments}')
    })

    it('renders metrics section when either likes or comments is provided', () => {
      const source = readComponent()
      expect(source).toMatch(
        /likes\s*!==\s*undefined\s*\|\|\s*comments\s*!==\s*undefined/
      )
    })

    it('has testID for metrics element', () => {
      const source = readComponent()
      expect(source).toMatch(/testID=\{[`']\$\{testID\}-metrics[`']\}/)
    })

    it('has testID for likes element', () => {
      const source = readComponent()
      expect(source).toMatch(/testID=\{[`']\$\{testID\}-likes[`']\}/)
    })

    it('has testID for comments element', () => {
      const source = readComponent()
      expect(source).toMatch(/testID=\{[`']\$\{testID\}-comments[`']\}/)
    })
  })

  describe('AC-5: User tap on SocialCard fires onPress callback', () => {
    it('wraps card in Pressable component', () => {
      const source = readComponent()
      expect(source).toContain('<Pressable')
      expect(source).toContain('onPress={onPress}')
    })

    it('forwards testID to Pressable', () => {
      const source = readComponent()
      expect(source).toMatch(/testID=\{testID\}/)
    })

    it('has visual feedback on press (opacity change)', () => {
      const source = readComponent()
      expect(source).toMatch(/active:opacity-70|pressable-opacity/)
    })
  })

  describe('AC-6: SocialCard with long contentPreview truncates to 2-3 lines', () => {
    it('uses numberOfLines prop to truncate content', () => {
      const source = readComponent()
      expect(source).toContain('numberOfLines={3}')
    })

    it('renders content preview with proper styling', () => {
      const source = readComponent()
      expect(source).toContain('contentPreview')
    })

    it('has testID for content preview element', () => {
      const source = readComponent()
      expect(source).toMatch(/testID=\{[`']\$\{testID\}-content-preview[`']\}/)
    })
  })

  describe('Theme Compliance', () => {
    it('uses theme tokens via Tailwind classes', () => {
      const source = readComponent()
      expect(source).toContain('text-foreground')
      expect(source).toContain('text-muted-foreground')
      expect(source).toContain('bg-card')
      expect(source).toContain('border-border')
    })

    it('does NOT contain hardcoded hex colours', () => {
      const source = readComponent()
      expect(source).not.toMatch(/#[0-9a-fA-F]{6}/)
    })

    it('does NOT contain hardcoded fontSize', () => {
      const source = readComponent()
      // Should use Tailwind classes like text-base, text-sm, etc.
      const linesWithHardcodedFontSize = source
        .split('\n')
        .filter((line) => line.match(/fontSize:\s*\d+/))
      expect(linesWithHardcodedFontSize).toHaveLength(0)
    })

    it('uses Tailwind className for styling', () => {
      const source = readComponent()
      expect(source).toContain('className=')
    })
  })

  describe('Component Structure', () => {
    it('has header section with avatar and author info', () => {
      const source = readComponent()
      expect(source).toMatch(/\$\{testID\}-header/)
    })

    it('has author info section with name and handle', () => {
      const source = readComponent()
      expect(source).toMatch(/\$\{testID\}-author-info/)
      expect(source).toMatch(/\$\{testID\}-author-name/)
      expect(source).toMatch(/\$\{testID\}-author-handle/)
    })

    it('has source badge', () => {
      const source = readComponent()
      expect(source).toMatch(/\$\{testID\}-source-badge/)
    })

    it('has content section', () => {
      const source = readComponent()
      expect(source).toMatch(/\$\{testID\}-content/)
    })

    it('imports Card from @/components/ui/card', () => {
      const source = readComponent()
      expect(source).toMatch(/from ['"]@\/components\/ui\/card['"]/)
    })

    it('imports Text from @/components/ui/text', () => {
      const source = readComponent()
      expect(source).toMatch(/from ['"]@\/components\/ui\/text['"]/)
    })

    it('imports icons from @/components/ui/icons', () => {
      const source = readComponent()
      expect(source).toMatch(/from ['"]@\/components\/ui\/icons['"]/)
    })
  })
})
