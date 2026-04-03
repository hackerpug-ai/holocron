/**
 * Tests for convex/creators/output.ts
 *
 * Verifies that formatCreatorReport produces a curriculum-style crash course
 * report from creator profile + video transcript data.
 */

import { describe, it, expect } from 'vitest';
import { formatCreatorReport } from '../../../convex/creators/output';

const baseProfile = {
  name: 'Alice Example',
  platform: 'YouTube',
  channelUrl: 'https://youtube.com/@alice',
  subscriberCount: 1200000,
  videoCount: 45,
  description: 'Alice teaches advanced TypeScript patterns for production apps.',
};

const baseVideos = [
  {
    title: 'TypeScript Generics Deep Dive',
    videoId: 'abc1',
    publishedAt: '2024-01-01',
    topic: 'Generics',
    keyTakeaway: 'Use constraints to narrow generic types effectively',
    summary: 'A deep dive into TypeScript generics.',
  },
  {
    title: 'Mapped Types Explained',
    videoId: 'abc2',
    publishedAt: '2024-02-01',
    topic: 'Type System',
    keyTakeaway: 'Mapped types transform every key in a type',
    summary: 'Exploring mapped types.',
  },
  {
    title: 'Conditional Types Mastery',
    videoId: 'abc3',
    topic: 'Type System',
    keyTakeaway: 'Conditional types enable powerful type inference',
    summary: 'Mastering conditional types.',
  },
];

/**
 * AC-1: formatCreatorReport is exported from convex/creators/output.ts
 */
describe('AC-1: formatCreatorReport export', () => {
  it('should export formatCreatorReport as a named export', () => {
    expect(typeof formatCreatorReport).toBe('function');
  });
});

/**
 * AC-2: Returns a string with the report header containing the creator name and video count
 */
describe('AC-2: report header contains creator name', () => {
  it('should include creator name in the report header', () => {
    const result = formatCreatorReport({ profile: baseProfile, videos: baseVideos });
    expect(typeof result).toBe('string');
    // Title is "Crash Course: {Domain} by {Creator}"
    expect(result).toContain('Alice Example');
    expect(result).toContain('creator-analysis');
    // Header metadata includes "Videos: 3 analyzed"
    expect(result).toContain(`**Videos**: 3 analyzed`);
  });
});

/**
 * AC-3: Formats subscriber count with K/M suffixes
 */
describe('AC-3: subscriber count formatting', () => {
  it('should format 1200000 subscribers as 1.2M', () => {
    const result = formatCreatorReport({ profile: baseProfile, videos: baseVideos });
    expect(result).toContain('1.2M');
  });

  it('should format 45000 subscribers as 45K', () => {
    const profile = { ...baseProfile, subscriberCount: 45000 };
    const result = formatCreatorReport({ profile, videos: baseVideos });
    expect(result).toContain('45K');
  });

  it('should format sub-1000 subscribers as plain number', () => {
    const profile = { ...baseProfile, subscriberCount: 500 };
    const result = formatCreatorReport({ profile, videos: baseVideos });
    expect(result).toContain('500');
  });
});

/**
 * AC-4: Falls back to profile description if no coreThesis provided
 */
describe('AC-4: coreThesis fallback to description', () => {
  it('should use profile description as fallback when coreThesis is not provided', () => {
    const result = formatCreatorReport({ profile: baseProfile, videos: baseVideos });
    // The description should appear in the Core Thesis section
    expect(result).toContain('## Core Thesis');
    expect(result).toContain(baseProfile.description);
  });

  it('should use coreThesis when provided instead of description', () => {
    const result = formatCreatorReport({
      profile: baseProfile,
      videos: baseVideos,
      coreThesis: 'TypeScript is the future of scalable software.',
    });
    expect(result).toContain('TypeScript is the future of scalable software.');
  });
});

/**
 * AC-5: Creates single "All Content" module when no modules provided
 */
describe('AC-5: default "All Content" module', () => {
  it('should create an "All Content" module containing all videos when no modules are provided', () => {
    const result = formatCreatorReport({ profile: baseProfile, videos: baseVideos });
    expect(result).toContain('All Content');
    // All three video titles should appear in the module list
    baseVideos.forEach((v) => {
      // Titles may be truncated in catalog but full titles appear in module body
      expect(result).toContain(v.title.slice(0, 20));
    });
  });

  it('should use provided modules when supplied', () => {
    const result = formatCreatorReport({
      profile: baseProfile,
      videos: baseVideos,
      modules: [
        {
          name: 'Module Alpha',
          keyIdea: 'Foundation concepts',
          videoIds: ['abc1'],
        },
      ],
    });
    expect(result).toContain('Module Alpha');
    expect(result).not.toContain('All Content');
  });
});

/**
 * AC-6: Skips Cross-Cutting Themes section when no themes provided
 */
describe('AC-6: omit themes section when not provided', () => {
  it('should not include Cross-Cutting Themes section when themes is not provided', () => {
    const result = formatCreatorReport({ profile: baseProfile, videos: baseVideos });
    expect(result).not.toContain('Cross-Cutting Themes');
  });

  it('should include Cross-Cutting Themes section when themes are provided', () => {
    const result = formatCreatorReport({
      profile: baseProfile,
      videos: baseVideos,
      themes: [
        { theme: 'Type Safety', videoCount: 3, explanation: 'Emphasized in every video' },
      ],
    });
    expect(result).toContain('Cross-Cutting Themes');
    expect(result).toContain('Type Safety');
  });
});

/**
 * AC-7: Truncates video titles to 25 chars and takeaways to 30 chars in catalog table
 */
describe('AC-7: catalog table truncation', () => {
  it('should truncate long video titles to 25 chars in the Video Catalog table', () => {
    const longTitleVideo = {
      title: 'This Is A Very Long Video Title That Exceeds Limit',
      videoId: 'long1',
      topic: 'Topic',
      keyTakeaway: 'Short takeaway',
    };
    const result = formatCreatorReport({
      profile: baseProfile,
      videos: [longTitleVideo],
    });
    expect(result).toContain('## Video Catalog');
    // Extract just the catalog section to check truncation there
    const catalogIdx = result.indexOf('## Video Catalog');
    const catalogSection = result.slice(catalogIdx);
    // Full 50-char title should not appear in the catalog table rows
    expect(catalogSection).not.toContain('This Is A Very Long Video Title That Exceeds Limit');
    // Truncated prefix should appear
    expect(catalogSection).toContain('This Is A Very Long Vide…');
  });

  it('should truncate long key takeaways to 30 chars in the Video Catalog table', () => {
    const longTakeawayVideo = {
      title: 'Short Title',
      videoId: 'long2',
      topic: 'Topic',
      keyTakeaway: 'This is a very long takeaway that certainly exceeds thirty characters',
    };
    const result = formatCreatorReport({
      profile: baseProfile,
      videos: [longTakeawayVideo],
    });
    expect(result).toContain('## Video Catalog');
    // Extract just the catalog section to check truncation there
    const catalogIdx = result.indexOf('## Video Catalog');
    const catalogSection = result.slice(catalogIdx);
    expect(catalogSection).not.toContain('This is a very long takeaway that certainly exceeds thirty characters');
    // Truncated prefix (30 chars) should appear
    expect(catalogSection).toContain('This is a very long takeaway …');
  });
});

/**
 * AC-8: Skips Learning Paths section when fewer than 3 modules
 */
describe('AC-8: omit Learning Paths when fewer than 3 modules', () => {
  it('should not include Learning Paths when only 1 module (default All Content)', () => {
    const result = formatCreatorReport({ profile: baseProfile, videos: baseVideos });
    expect(result).not.toContain('## Learning Paths');
  });

  it('should not include Learning Paths when only 2 modules provided', () => {
    const result = formatCreatorReport({
      profile: baseProfile,
      videos: baseVideos,
      modules: [
        { name: 'Module 1', keyIdea: 'Idea 1', videoIds: ['abc1'] },
        { name: 'Module 2', keyIdea: 'Idea 2', videoIds: ['abc2'] },
      ],
    });
    expect(result).not.toContain('## Learning Paths');
  });

  it('should include Learning Paths when 3 or more modules are provided', () => {
    const result = formatCreatorReport({
      profile: baseProfile,
      videos: baseVideos,
      modules: [
        { name: 'Module 1', keyIdea: 'Idea 1', videoIds: ['abc1'] },
        { name: 'Module 2', keyIdea: 'Idea 2', videoIds: ['abc2'] },
        { name: 'Module 3', keyIdea: 'Idea 3', videoIds: ['abc3'] },
      ],
    });
    expect(result).toContain('## Learning Paths');
  });
});
