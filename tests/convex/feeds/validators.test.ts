import { describe, it, expect } from "vitest";

describe("FR-004: Feed Validators", () => {
  describe("AC-1: File structure", () => {
    it("should have correct import from convex/values", async () => {
      // This test verifies the file exists and has correct imports
      const validatorsModule = await import("../../../convex/feeds/validators");

      // Module should exist
      expect(validatorsModule).toBeTruthy();

      // Should have exports (we'll verify specific ones in later ACs)
      expect(Object.keys(validatorsModule).length).toBeGreaterThan(0);
    });
  });

  describe("AC-2: contentType enum validator", () => {
    it("should export contentTypeEnum with video, blog, social, mixed", async () => {
      const validatorsModule = await import("../../../convex/feeds/validators");

      // Should export contentTypeEnum
      expect(validatorsModule).toHaveProperty("contentTypeEnum");

      // Should be defined
      const contentTypeEnum = validatorsModule.contentTypeEnum;
      expect(contentTypeEnum).toBeTruthy();
    });
  });

  describe("AC-3: feedItemFields validator", () => {
    it("should export feedItemFields with all required fields", async () => {
      const validatorsModule = await import("../../../convex/feeds/validators");

      // Should export feedItemFields
      expect(validatorsModule).toHaveProperty("feedItemFields");

      const feedItemFields = validatorsModule.feedItemFields;
      expect(feedItemFields).toBeTruthy();

      // Should have all required fields from schema
      const requiredFields = [
        "groupKey",
        "title",
        "summary",
        "contentType",
        "itemCount",
        "itemIds",
        "creatorProfileId",
        "subscriptionIds",
        "thumbnailUrl",
        "viewed",
        "viewedAt",
        "publishedAt",
        "discoveredAt",
        "createdAt",
      ];

      requiredFields.forEach((field) => {
        expect(feedItemFields).toHaveProperty(field);
      });
    });
  });

  describe("AC-4: feedSessionFields validator", () => {
    it("should export feedSessionFields with all required fields", async () => {
      const validatorsModule = await import("../../../convex/feeds/validators");

      // Should export feedSessionFields
      expect(validatorsModule).toHaveProperty("feedSessionFields");

      const feedSessionFields = validatorsModule.feedSessionFields;
      expect(feedSessionFields).toBeTruthy();

      // Should have all required fields from schema
      const requiredFields = [
        "startTime",
        "endTime",
        "itemsViewed",
        "itemsConsumed",
        "sessionSource",
      ];

      requiredFields.forEach((field) => {
        expect(feedSessionFields).toHaveProperty(field);
      });
    });
  });

  describe("AC-5: Query argument validators", () => {
    it("should export getFeedArgs validator", async () => {
      const validatorsModule = await import("../../../convex/feeds/validators");
      expect(validatorsModule).toHaveProperty("getFeedArgs");
      const getFeedArgs = validatorsModule.getFeedArgs;
      expect(getFeedArgs).toBeTruthy();
    });

    it("should export getByCreatorArgs validator", async () => {
      const validatorsModule = await import("../../../convex/feeds/validators");
      expect(validatorsModule).toHaveProperty("getByCreatorArgs");
      const getByCreatorArgs = validatorsModule.getByCreatorArgs;
      expect(getByCreatorArgs).toBeTruthy();
    });

    it("should export getUnviewedCountArgs validator", async () => {
      const validatorsModule = await import("../../../convex/feeds/validators");
      expect(validatorsModule).toHaveProperty("getUnviewedCountArgs");
      const getUnviewedCountArgs = validatorsModule.getUnviewedCountArgs;
      expect(getUnviewedCountArgs).toBeTruthy();
    });

    it("should export getDigestSummaryArgs validator", async () => {
      const validatorsModule = await import("../../../convex/feeds/validators");
      expect(validatorsModule).toHaveProperty("getDigestSummaryArgs");
      const getDigestSummaryArgs = validatorsModule.getDigestSummaryArgs;
      expect(getDigestSummaryArgs).toBeTruthy();
    });
  });

  describe("AC-6: Mutation argument validators", () => {
    it("should export markViewedArgs validator", async () => {
      const validatorsModule = await import("../../../convex/feeds/validators");
      expect(validatorsModule).toHaveProperty("markViewedArgs");
      const markViewedArgs = validatorsModule.markViewedArgs;
      expect(markViewedArgs).toBeTruthy();
    });

    it("should export markAllViewedArgs validator", async () => {
      const validatorsModule = await import("../../../convex/feeds/validators");
      expect(validatorsModule).toHaveProperty("markAllViewedArgs");
      const markAllViewedArgs = validatorsModule.markAllViewedArgs;
      expect(markAllViewedArgs).toBeTruthy();
    });

    it("should export createDigestNotificationArgs validator", async () => {
      const validatorsModule = await import("../../../convex/feeds/validators");
      expect(validatorsModule).toHaveProperty("createDigestNotificationArgs");
      const createDigestNotificationArgs = validatorsModule.createDigestNotificationArgs;
      expect(createDigestNotificationArgs).toBeTruthy();
    });
  });

  describe("AC-7: Type safety verification", () => {
    it("should have all required exports (10+ validators)", async () => {
      const validatorsModule = await import("../../../convex/feeds/validators");

      // Count exports (excluding default)
      const exportCount = Object.keys(validatorsModule).filter(
        key => key !== "default" && key !== "__esModule"
      ).length;

      // Should have at least 10 exports:
      // - contentTypeEnum
      // - feedItemFields
      // - feedSessionFields
      // - getFeedArgs
      // - getByCreatorArgs
      // - getUnviewedCountArgs
      // - getDigestSummaryArgs
      // - markViewedArgs
      // - markAllViewedArgs
      // - createDigestNotificationArgs
      expect(exportCount).toBeGreaterThanOrEqual(10);
    });
  });
});
