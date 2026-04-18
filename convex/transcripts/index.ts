/**
 * Transcripts API
 * Video transcript fetching and storage via YouTube API
 */

// Public exports
export const getTranscript = require('./queries').getTranscript;
export const createTranscriptJob = require('./mutations').createTranscriptJob;
export const updateJobStatus = require('./mutations').updateJobStatus;
export const markFailed = require('./mutations').markFailed;
export const fetchTranscriptWithFallback = require('./service').fetchTranscriptWithFallback;

// Re-export for internal references
export * as internal from './internal';
export * as mutations from './mutations';
export * as oauth from './oauth';
export * as queries from './queries';
export * as scheduled from './scheduled';
export * as service from './service';
