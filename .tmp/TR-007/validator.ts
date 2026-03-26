
export const verifyPlatformsValidator = v.object({
  profileId: v.id("creatorProfiles"),
});

// Assimilation validators
export const assimilateCreatorValidator = v.object({
  profileId: v.id("creatorProfiles"),
  forceRegenerate: v.optional(v.boolean()),
});
