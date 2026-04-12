import { describe, it, expect } from 'vitest';
import {
  RECOMMENDATION_SYNTHESIS_PROMPT,
  RecommendationSynthesisSchema,
} from '../../convex/chat/specialistPrompts';

describe('REC-002: RECOMMENDATION_SYNTHESIS_PROMPT', () => {
  describe('AC-1: Prompt and Zod schema exported', () => {
    it('should export RECOMMENDATION_SYNTHESIS_PROMPT', () => {
      expect(RECOMMENDATION_SYNTHESIS_PROMPT).toBeDefined();
      expect(typeof RECOMMENDATION_SYNTHESIS_PROMPT).toBe('string');
      expect(RECOMMENDATION_SYNTHESIS_PROMPT.length).toBeGreaterThan(0);
    });

    it('should export RecommendationSynthesisSchema', () => {
      expect(RecommendationSynthesisSchema).toBeDefined();
    });
  });

  describe('AC-2: Prompt contains OMIT don\'t GUESS rule', () => {
    it('should contain OMIT literal', () => {
      expect(RECOMMENDATION_SYNTHESIS_PROMPT).toContain('OMIT');
    });

    it('should contain GUESS literal', () => {
      expect(RECOMMENDATION_SYNTHESIS_PROMPT).toContain('GUESS');
    });

    it('should contain the fabrication guardrule', () => {
      // Check for the critical rule about omitting vs guessing
      expect(RECOMMENDATION_SYNTHESIS_PROMPT).toMatch(/OMIT.*GUESS|GUESS.*OMIT/s);
    });
  });

  describe('AC-3: Zod schema validates happy-path output', () => {
    const validSynthesis = {
      items: [
        {
          name: 'Example Provider 1',
          description: 'A great service provider',
          whyRecommended: 'Matches your budget and location',
          rating: 4.5,
          location: 'San Francisco, CA',
          pricing: '$$',
          contact: {
            phone: '555-1234',
            url: 'https://example.com',
            email: 'contact@example.com',
          },
        },
        {
          name: 'Example Provider 2',
          description: 'Another quality option',
          whyRecommended: 'Highly rated in your area',
          rating: 4.8,
          location: 'Oakland, CA',
          pricing: '$$$',
          contact: {
            url: 'https://example2.com',
          },
        },
      ],
      sources: [
        {
          title: 'Example Source 1',
          url: 'https://source1.com',
          snippet: 'Information about provider 1',
        },
        {
          title: 'Example Source 2',
          url: 'https://source2.com',
          snippet: 'Information about provider 2',
        },
      ],
      query: 'plumbers in San Francisco',
      durationMs: 1500,
    };

    it('should parse valid synthesis with 5 items and 3 sources', () => {
      const fullSynthesis = {
        ...validSynthesis,
        items: [
          ...validSynthesis.items,
          {
            name: 'Provider 3',
            description: 'Third option',
            whyRecommended: 'Good reviews',
          },
          {
            name: 'Provider 4',
            description: 'Fourth option',
            whyRecommended: 'Affordable',
          },
          {
            name: 'Provider 5',
            description: 'Fifth option',
            whyRecommended: 'Local expert',
          },
        ],
        sources: [
          ...validSynthesis.sources,
          {
            title: 'Example Source 3',
            url: 'https://source3.com',
            snippet: 'Information about provider 3',
          },
        ],
      };

      const result = RecommendationSynthesisSchema.parse(fullSynthesis);
      expect(result.items).toHaveLength(5);
      expect(result.sources).toHaveLength(3);
      expect(result.query).toBe(fullSynthesis.query);
      expect(result.durationMs).toBe(fullSynthesis.durationMs);
    });

    it('should parse valid synthesis with minimal required fields', () => {
      const minimalSynthesis = {
        items: [
          {
            name: 'Minimal Provider',
            description: 'Basic description',
            whyRecommended: 'Meets criteria',
          },
        ],
        sources: [
          {
            title: 'Source',
            url: 'https://source.com',
            snippet: 'Snippet',
          },
        ],
        query: 'test query',
        durationMs: 1000,
      };

      const result = RecommendationSynthesisSchema.parse(minimalSynthesis);
      expect(result.items).toHaveLength(1);
      expect(result.sources).toHaveLength(1);
    });
  });

  describe('AC-4: Zod schema rejects missing items', () => {
    it('should throw when items field is missing', () => {
      const invalidSynthesis = {
        sources: [
          {
            title: 'Source',
            url: 'https://source.com',
            snippet: 'Snippet',
          },
        ],
        query: 'test query',
        durationMs: 1000,
      };

      expect(() => RecommendationSynthesisSchema.parse(invalidSynthesis)).toThrow();
    });

    it('should throw when items is not an array', () => {
      const invalidSynthesis = {
        items: 'not an array',
        sources: [],
        query: 'test',
        durationMs: 1000,
      };

      expect(() => RecommendationSynthesisSchema.parse(invalidSynthesis)).toThrow();
    });

    it('should throw when sources field is missing', () => {
      const invalidSynthesis = {
        items: [
          {
            name: 'Provider',
            description: 'Desc',
            whyRecommended: 'Why',
          },
        ],
        query: 'test',
        durationMs: 1000,
      };

      expect(() => RecommendationSynthesisSchema.parse(invalidSynthesis)).toThrow();
    });

    it('should throw when query field is missing', () => {
      const invalidSynthesis = {
        items: [],
        sources: [],
        durationMs: 1000,
      };

      expect(() => RecommendationSynthesisSchema.parse(invalidSynthesis)).toThrow();
    });

    it('should throw when durationMs field is missing', () => {
      const invalidSynthesis = {
        items: [],
        sources: [],
        query: 'test',
      };

      expect(() => RecommendationSynthesisSchema.parse(invalidSynthesis)).toThrow();
    });
  });

  describe('Prompt content requirements', () => {
    it('should forbid Conclusion sections', () => {
      expect(RECOMMENDATION_SYNTHESIS_PROMPT).toMatch(/no conclusion|No conclusion|NO CONCLUSION/s);
    });

    it('should forbid More information sections', () => {
      expect(RECOMMENDATION_SYNTHESIS_PROMPT).toMatch(/no more information|No "More information"|NO "MORE INFORMATION"/s);
    });

    it('should forbid Further reading sections', () => {
      expect(RECOMMENDATION_SYNTHESIS_PROMPT).toMatch(/no further reading|No "Further reading"|NO "FURTHER READING"/s);
    });

    it('should include fallback response rule', () => {
      // Check for the fallback when sources don't yield 3+ providers
      expect(RECOMMENDATION_SYNTHESIS_PROMPT).toMatch(/fallback|3\+|three or more/i);
    });

    it('should include output format template', () => {
      expect(RECOMMENDATION_SYNTHESIS_PROMPT).toMatch(/output format|template|markdown/i);
    });
  });
});
