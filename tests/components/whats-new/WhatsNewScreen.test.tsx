/**
 * Test for WhatsNewScreen component
 *
 * Tests verify component structure, theme usage, and React Native patterns
 * following TDD methodology: RED → GREEN → REFACTOR
 *
 * AC-1: User navigates to What's New → Section renders → Content displays as card-based stream
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('WhatsNewScreen - AC-1: Card-based stream layout', () => {
  const componentPath = join(
    process.cwd(),
    'app',
    '(drawer)',
    'whats-new',
    'index.tsx'
  )

  const readComponent = (): string => {
    return readFileSync(componentPath, 'utf-8')
  }

  describe('RED Phase: Test fails before implementation', () => {
    it('should have index.tsx file in whats-new directory', () => {
      // This test will FAIL until we create the file
      const source = readComponent()
      expect(source).toBeDefined()
    })

    it('should export a default component for Expo Router', () => {
      const source = readComponent()
      // Expo Router requires default export for route components
      expect(source).toContain('export default function')
    })

    it('should use NewsStream component for card layout', () => {
      const source = readComponent()
      // Should use NewsStream which uses FlatList internally
      expect(source).toContain('NewsStream')
      expect(source).toContain('@/components/whats-new/NewsStream')
    })

    it('should render NewsStream components', () => {
      const source = readComponent()
      // Should import and use the stream component
      expect(source).toContain('NewsStream')
      expect(source).toContain('items')
    })

    it('should have testID for screen identification', () => {
      const source = readComponent()
      // Should have testID for E2E testing
      expect(source).toMatch(/testID=["']whats-new-screen/)
    })

    it('should use useQuery to fetch whatsNew reports', () => {
      const source = readComponent()
      // Should fetch data from Convex
      expect(source).toContain('useQuery')
      expect(source).toContain('api.whatsNew')
    })

    it('should have testID for Whats New screen', () => {
      const source = readComponent()
      // Should have testID for E2E testing
      expect(source).toMatch(/testID=["']whats-new-screen/)
    })
  })
})
