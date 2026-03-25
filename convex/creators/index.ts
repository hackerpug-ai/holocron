/**
 * Creators API
 * Multi-platform creator profile management for subscription system
 */

// Queries
export const search = require("./queries").search;
export const get = require("./queries").get;
export const getByHandle = require("./queries").getByHandle;
export const getSubscriptions = require("./queries").getSubscriptions;

// Mutations
export const create = require("./mutations").create;
export const update = require("./mutations").update;
export const remove = require("./mutations").remove;

// Actions
export const discover = require("./actions").discover;
export const verifyPlatforms = require("./actions").verifyPlatforms;

// Internal (platform lookups)
export const normalizeHandle = require("./internal").normalizeHandle;
export const lookupYouTubeChannel = require("./internal").lookupYouTubeChannel;
export const lookupTwitterUser = require("./internal").lookupTwitterUser;
export const lookupBlueskyUser = require("./internal").lookupBlueskyUser;
export const lookupGitHubUser = require("./internal").lookupGitHubUser;
export const validateWebsiteUrl = require("./internal").validateWebsiteUrl;
