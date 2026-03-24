/**
 * Tests for section-aware document injection in buildConversationContext
 *
 * AC-1: Message with cardData.card_type === 'document_context' and scope === 'excerpt'
 *       → system message includes light header reference (document ID, title, block info)
 *       → does NOT inject full document content
 *
 * AC-2: Message with cardData.card_type === 'document_context' and scope === 'full'
 *       → system message includes truncated full document content with document ID reference
 *
 * AC-3: Message without cardData (legacy) with documentId
 *       → falls back to current behavior: truncated full document content
 *
 * AC-4: Message with cardData.card_type === 'document_context' scope === 'excerpt'
 *       → does NOT trigger duplicate DB fetch for the same documentId
 *       (the excerpt text is already in the message content field)
 */

import { describe, it, expect, vi } from 'vitest';

// DocumentContextCardData shape used by the system
type DocumentContextCardData = {
  card_type: 'document_context';
  document_id: string;
  title: string;
  category?: string;
  scope: 'full' | 'excerpt';
  excerpt?: string;
  blockIndex?: number;
  snippet?: string;
};

// We test buildConversationContext by mocking the db dependency
// since it takes a GenericDatabaseReader which we can stub

describe('buildConversationContext: section-aware document injection', () => {
  /**
   * AC-1: excerpt scope → light header only, no full document fetch
   */
  describe('AC-1: excerpt scope produces light header reference', () => {
    it('should include a light header with document ID when cardData scope is excerpt', async () => {
      const { buildConversationContext } = await import('../../convex/chat/context');

      const cardData: DocumentContextCardData = {
        card_type: 'document_context',
        document_id: 'doc123',
        title: 'My Research Doc',
        scope: 'excerpt',
        blockIndex: 3,
      };

      const conversationId = 'conv1' as any;

      // Stub db: messages include one user message with document_context cardData (excerpt scope)
      const mockMessage = {
        _id: 'msg1',
        conversationId,
        role: 'user',
        content: 'Here is the excerpt text from the document.',
        messageType: 'text',
        cardData,
        documentId: 'doc123' as any,
        deleted: false,
        createdAt: Date.now(),
      };

      const db = {
        query: vi.fn().mockImplementation((table: string) => {
          if (table === 'chatMessages') {
            return {
              withIndex: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              take: vi.fn().mockResolvedValue([mockMessage]),
            };
          }
          if (table === 'toolCalls') {
            return {
              withIndex: vi.fn().mockReturnThis(),
              collect: vi.fn().mockResolvedValue([]),
            };
          }
          return {
            withIndex: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            take: vi.fn().mockResolvedValue([]),
            collect: vi.fn().mockResolvedValue([]),
          };
        }),
        get: vi.fn().mockResolvedValue(null), // Should NOT be called for excerpt scope
      };

      const result = await buildConversationContext(db as any, conversationId);

      // Should have a system message with a light header reference
      const systemMessages = result.filter((m) => m.role === 'system');
      expect(systemMessages.length).toBeGreaterThan(0);

      const systemContent = systemMessages[0].content;
      // Light header should mention the document ID
      expect(systemContent).toContain('doc123');
      // Light header should mention the title
      expect(systemContent).toContain('My Research Doc');
      // Light header should mention "excerpt"
      expect(systemContent).toContain('excerpt');
      // Should NOT contain huge document content (db.get was not called)
      expect(db.get).not.toHaveBeenCalled();
    });
  });

  /**
   * AC-2: full scope → truncated full document injection with document ID reference
   */
  describe('AC-2: full scope injects truncated document content', () => {
    it('should fetch and inject truncated document content when scope is full', async () => {
      const { buildConversationContext } = await import('../../convex/chat/context');

      const cardData: DocumentContextCardData = {
        card_type: 'document_context',
        document_id: 'doc456',
        title: 'Full Document Title',
        scope: 'full',
      };

      const conversationId = 'conv2' as any;

      const mockMessage = {
        _id: 'msg2',
        conversationId,
        role: 'user',
        content: 'Please read the full document.',
        messageType: 'text',
        cardData,
        documentId: 'doc456' as any,
        deleted: false,
        createdAt: Date.now(),
      };

      const longContent = 'A'.repeat(5000);
      const mockDocument = {
        _id: 'doc456',
        title: 'Full Document Title',
        content: longContent,
      };

      const db = {
        query: vi.fn().mockImplementation((table: string) => {
          if (table === 'chatMessages') {
            return {
              withIndex: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              take: vi.fn().mockResolvedValue([mockMessage]),
            };
          }
          if (table === 'toolCalls') {
            return {
              withIndex: vi.fn().mockReturnThis(),
              collect: vi.fn().mockResolvedValue([]),
            };
          }
          return {
            withIndex: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            take: vi.fn().mockResolvedValue([]),
            collect: vi.fn().mockResolvedValue([]),
          };
        }),
        get: vi.fn().mockResolvedValue(mockDocument),
      };

      const result = await buildConversationContext(db as any, conversationId);

      // Should have fetched the document
      expect(db.get).toHaveBeenCalledWith('doc456');

      const systemMessages = result.filter((m) => m.role === 'system');
      expect(systemMessages.length).toBeGreaterThan(0);

      const systemContent = systemMessages[0].content;
      // Should contain the document title
      expect(systemContent).toContain('Full Document Title');
      // Should contain truncated content (not full 5000 chars of repeated 'A')
      expect(systemContent).toContain('AAAA');
      // Should contain document ID reference
      expect(systemContent).toContain('doc456');
      // Content should be truncated (2000 char max)
      expect(systemContent.length).toBeLessThan(longContent.length);
    });
  });

  /**
   * AC-3: Legacy message (no cardData) with documentId → falls back to current behavior
   */
  describe('AC-3: legacy messages fall back to current behavior', () => {
    it('should fetch and inject full document content for legacy messages without cardData', async () => {
      const { buildConversationContext } = await import('../../convex/chat/context');

      const conversationId = 'conv3' as any;

      // Legacy message: has documentId but no cardData
      const mockMessage = {
        _id: 'msg3',
        conversationId,
        role: 'user',
        content: 'Look at this document.',
        messageType: 'text',
        cardData: undefined,
        documentId: 'doc789' as any,
        deleted: false,
        createdAt: Date.now(),
      };

      const mockDocument = {
        _id: 'doc789',
        title: 'Legacy Document',
        content: 'Legacy content here.',
      };

      const db = {
        query: vi.fn().mockImplementation((table: string) => {
          if (table === 'chatMessages') {
            return {
              withIndex: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              take: vi.fn().mockResolvedValue([mockMessage]),
            };
          }
          if (table === 'toolCalls') {
            return {
              withIndex: vi.fn().mockReturnThis(),
              collect: vi.fn().mockResolvedValue([]),
            };
          }
          return {
            withIndex: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            take: vi.fn().mockResolvedValue([]),
            collect: vi.fn().mockResolvedValue([]),
          };
        }),
        get: vi.fn().mockResolvedValue(mockDocument),
      };

      const result = await buildConversationContext(db as any, conversationId);

      // Should have fetched the document (legacy behavior)
      expect(db.get).toHaveBeenCalledWith('doc789');

      const systemMessages = result.filter((m) => m.role === 'system');
      expect(systemMessages.length).toBeGreaterThan(0);

      const systemContent = systemMessages[0].content;
      expect(systemContent).toContain('Legacy Document');
      expect(systemContent).toContain('Legacy content here.');
    });
  });

  /**
   * AC-4: Multiple excerpt messages for the same document → only one light header, no DB fetch
   */
  describe('AC-4: deduplicated excerpt references, no redundant DB fetches', () => {
    it('should produce only one system reference per document even with multiple excerpt messages', async () => {
      const { buildConversationContext } = await import('../../convex/chat/context');

      const conversationId = 'conv4' as any;

      const cardData1: DocumentContextCardData = {
        card_type: 'document_context',
        document_id: 'docABC',
        title: 'Shared Doc',
        scope: 'excerpt',
        blockIndex: 1,
      };
      const cardData2: DocumentContextCardData = {
        card_type: 'document_context',
        document_id: 'docABC',
        title: 'Shared Doc',
        scope: 'excerpt',
        blockIndex: 2,
      };

      const messages = [
        {
          _id: 'msg4a',
          conversationId,
          role: 'user',
          content: 'First excerpt.',
          messageType: 'text',
          cardData: cardData1,
          documentId: 'docABC' as any,
          deleted: false,
          createdAt: Date.now() - 1000,
        },
        {
          _id: 'msg4b',
          conversationId,
          role: 'user',
          content: 'Second excerpt.',
          messageType: 'text',
          cardData: cardData2,
          documentId: 'docABC' as any,
          deleted: false,
          createdAt: Date.now(),
        },
      ];

      const db = {
        query: vi.fn().mockImplementation((table: string) => {
          if (table === 'chatMessages') {
            return {
              withIndex: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              take: vi.fn().mockResolvedValue([...messages].reverse()), // desc order
            };
          }
          if (table === 'toolCalls') {
            return {
              withIndex: vi.fn().mockReturnThis(),
              collect: vi.fn().mockResolvedValue([]),
            };
          }
          return {
            withIndex: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            take: vi.fn().mockResolvedValue([]),
            collect: vi.fn().mockResolvedValue([]),
          };
        }),
        get: vi.fn().mockResolvedValue(null),
      };

      const result = await buildConversationContext(db as any, conversationId);

      // db.get should NOT be called for excerpt-scope messages
      expect(db.get).not.toHaveBeenCalled();

      // The system message should mention docABC only once (deduplicated)
      const systemMessages = result.filter((m) => m.role === 'system');
      expect(systemMessages.length).toBeGreaterThanOrEqual(1);

      const systemContent = systemMessages[0].content;
      const docMentionCount = (systemContent.match(/docABC/g) || []).length;
      expect(docMentionCount).toBe(1);
    });
  });
});
