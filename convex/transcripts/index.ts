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

// Internal Actions
export const fetchYouTubeTranscript = require("./internal").fetchYouTubeTranscript;
