/**
 * Transcripts API
 * Video transcript fetching and storage via YouTube API
 */

// Queries
export const getTranscript = require("./queries").getTranscript;

// Mutations
export const createTranscriptJob = require("./mutations").createTranscriptJob;
export const updateJobStatus = require("./mutations").updateJobStatus;
export const markFailed = require("./mutations").markFailed;

// Re-export internal module for internal references
export * as internal from "./internal";

// Service orchestration
export const fetchTranscriptWithFallback = require("./service").fetchTranscriptWithFallback;
