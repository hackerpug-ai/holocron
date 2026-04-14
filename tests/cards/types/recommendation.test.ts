import { describe, it, expect } from 'vitest'
import type {
  RecommendationSource,
  RecommendationContact,
  RecommendationItemData,
  RecommendationListCardData,
  RecommendationListCardProps,
  RecommendationItemProps,
  RecommendationActionSheetProps,
} from '../../../components/cards/types/recommendation'

describe('REC-UI-001: Recommendation types contract', () => {
  describe('AC-1: Types file exists and compiles', () => {
    it('should have the types file exist on disk', async () => {
      const fs = await import('fs')
      const path = await import('path')

      const filePath = path.join(process.cwd(), 'components/cards/types/recommendation.ts')
      // @ts-ignore - fs.existsSync exists in Node environment
      expect(fs.existsSync(filePath)).toBe(true)
    })

    it('should export all 8 types (compile-time verified by import)', async () => {
      // Dynamic import to verify the module exists and compiles
      const mod = await import('../../../components/cards/types/recommendation')
      expect(mod).toBeDefined()
      expect(typeof mod).toBe('object')
    })
  })

  describe('AC-2: card_type literal matches backend', () => {
    it('should enforce card_type as the literal string recommendation_list', () => {
      const card: RecommendationListCardData = {
        card_type: 'recommendation_list',
        items: [],
        summary: 'test summary',
      }
      expect(card.card_type).toBe('recommendation_list')
      expect(typeof card.card_type).toBe('string')
    })
  })

  describe('AC-3: Item shape includes all required fields', () => {
    it('should have RecommendationItemData with all 9 required fields', () => {
      const item: RecommendationItemData = {
        id: 'rec-1',
        title: 'Test Recommendation',
        subtitle: 'A subtitle',
        description: 'A detailed description',
        confidence: 0.85,
        source: { name: 'Article', type: 'article', url: 'https://example.com' },
        contacts: [{ name: 'John', role: 'Author' }],
        tags: ['test', 'example'],
        url: 'https://example.com/rec',
      }

      expect(item.id).toBe('rec-1')
      expect(item.title).toBe('Test Recommendation')
      expect(item.subtitle).toBe('A subtitle')
      expect(item.description).toBe('A detailed description')
      expect(item.confidence).toBe(0.85)
      expect(item.source).toEqual({ name: 'Article', type: 'article', url: 'https://example.com' })
      expect(item.contacts).toHaveLength(1)
      expect(item.tags).toEqual(['test', 'example'])
      expect(item.url).toBe('https://example.com/rec')
    })

    it('should have RecommendationSource with required name and type', () => {
      const source: RecommendationSource = {
        name: 'Test Source',
        type: 'tool',
        url: 'https://example.com',
      }

      expect(source.name).toBe('Test Source')
      expect(source.type).toBe('tool')
      expect(source.url).toBe('https://example.com')
    })

    it('should have RecommendationContact with required fields', () => {
      const contact: RecommendationContact = {
        name: 'Jane',
        role: 'Expert',
        email: 'jane@example.com',
        avatarUrl: 'https://example.com/avatar.jpg',
      }

      expect(contact.name).toBe('Jane')
      expect(contact.role).toBe('Expert')
      expect(contact.email).toBe('jane@example.com')
      expect(contact.avatarUrl).toBe('https://example.com/avatar.jpg')
    })
  })

  describe('AC-4: No paper imports', () => {
    it('should not import from react-native-paper', async () => {
      const fs = await import('fs')
      const path = await import('path')

      const filePath = path.join(process.cwd(), 'components/cards/types/recommendation.ts')
      // @ts-ignore - fs.readFileSync exists in Node environment
      const content = fs.readFileSync(filePath, 'utf-8')

      expect(content).not.toContain('react-native-paper')
      expect(content).not.toContain("from 'react-native-paper'")
      expect(content).not.toContain('from "react-native-paper"')
    })

    it('should not contain any `any` type in exports', async () => {
      const fs = await import('fs')
      const path = await import('path')

      const filePath = path.join(process.cwd(), 'components/cards/types/recommendation.ts')
      // @ts-ignore - fs.readFileSync exists in Node environment
      const content = fs.readFileSync(filePath, 'utf-8')

      // Check exported type definitions don't use `any`
      const lines = content.split('\n')
      for (const line of lines) {
        if (line.includes('export ')) {
          expect(line).not.toMatch(/:\s*any\b/)
          expect(line).not.toMatch(/<\s*any\s*>/)
        }
      }
    })
  })

  describe('Component props types compile correctly', () => {
    it('should have RecommendationListCardProps with required fields', () => {
      const props: RecommendationListCardProps = {
        data: {
          card_type: 'recommendation_list',
          items: [],
          summary: 'test',
        },
        onItemPress: (_item: RecommendationItemData) => {},
      }
      expect(props.data.card_type).toBe('recommendation_list')
      expect(typeof props.onItemPress).toBe('function')
    })

    it('should have RecommendationItemProps with required fields', () => {
      const item: RecommendationItemData = {
        id: '1',
        title: 'Test',
        subtitle: 'sub',
        description: 'desc',
        confidence: 0.9,
        source: { name: 'S', type: 'document' },
        contacts: [],
        tags: [],
        url: 'https://example.com',
      }
      const props: RecommendationItemProps = {
        item,
        onPress: (_i: RecommendationItemData) => {},
      }
      expect(props.item.id).toBe('1')
    })

    it('should have RecommendationActionSheetProps with required fields', () => {
      const props: RecommendationActionSheetProps = {
        visible: true,
        onDismiss: () => {},
        item: null,
      }
      expect(props.visible).toBe(true)
      expect(props.item).toBeNull()
    })
  })
})
