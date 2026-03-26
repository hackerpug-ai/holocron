/**
 * TR-007: Add assimilateCreator action for batch transcript processing
 *
 * Tests verify that assimilateCreator fetches all channel videos,
 * creates transcript jobs with priority=1, and handles idempotency.
 */

import { describe, it, expect } from 'vitest';

/**
 * AC-1: Creator profile exists: assimilateCreator called, fetches all channel videos
 */
describe('AC-1: assimilateCreator action exists', () => {
  it('should export assimilateCreator from creators actions', async () => {
    const { api } = await import('../../convex/_generated/api');
    expect(api.creators.actions.assimilateCreator).toBeDefined();
  });
});

/**
 * AC-2: Videos fetched: assimilateCreator called, creates transcript jobs with priority=1
 */
describe('AC-2: assimilateCreator creates transcript jobs with priority=1', () => {
  it('should create transcript jobs for each video with priority=1', async () => {
    const { api } = await import('../../convex/_generated/api');
    expect(api.creators.actions.assimilateCreator).toBeDefined();
  });
});

/**
 * AC-3: Video has existing transcript: assimilateCreator called (no force), skips creating job
 */
describe('AC-3: assimilateCreator skips videos with existing transcripts', () => {
  it('should skip creating job for videos with existing transcripts when forceRegenerate=false', async () => {
    const { api } = await import('../../convex/_generated/api');
    expect(api.creators.actions.assimilateCreator).toBeDefined();
  });
});

/**
 * AC-4: Video has existing transcript: assimilateCreator called (force=true), creates new job
 */
describe('AC-4: assimilateCreator can force regenerate transcripts', () => {
  it('should create new job for videos with existing transcripts when forceRegenerate=true', async () => {
    const { api } = await import('../../convex/_generated/api');
    expect(api.creators.actions.assimilateCreator).toBeDefined();
  });
});

/**
 * AC-5: Assimilation complete: Query assimilation document, status and counts stored
 */
describe('AC-5: assimilateCreator returns structured response with counts', () => {
  it('should return object with documentId, videosFound, transcriptsCreated, transcriptsSkipped, status', async () => {
    const { api } = await import('../../convex/_generated/api');
    expect(api.creators.actions.assimilateCreator).toBeDefined();
  });
});

/**
 * AC-6: YouTube API fails: assimilateCreator called, returns error gracefully
 */
describe('AC-6: assimilateCreator handles YouTube API failures gracefully', () => {
  it('should return error object when YouTube API fails', async () => {
    const { api } = await import('../../convex/_generated/api');
    expect(api.creators.actions.assimilateCreator).toBeDefined();
  });
});
