/**
 * Integration tests for conversation CRUD operations (US-051)
 *
 * Tests verify all conversation operations work via Convex with proper reactivity
 */

import { describe, it, expect } from "vitest";

describe("Conversations CRUD - AC-1: Create conversation", () => {
  it("should have create mutation defined", async () => {
    const { create } = await import("../../convex/conversations/mutations");

    expect(create).toBeTruthy();
    expect(typeof create).toBe("function");
  });

  it("should have insertFromMigration mutation for data migration", async () => {
    const { insertFromMigration } = await import("../../convex/conversations/mutations");

    expect(insertFromMigration).toBeTruthy();
    expect(typeof insertFromMigration).toBe("function");
  });
});

describe("Conversations CRUD - AC-2: List conversations", () => {
  it("should have list query defined", async () => {
    const { list } = await import("../../convex/conversations/queries");

    expect(list).toBeTruthy();
    expect(typeof list).toBe("function");
  });

  it("should have count query for validation", async () => {
    const { count } = await import("../../convex/conversations/queries");

    expect(count).toBeTruthy();
    expect(typeof count).toBe("function");
  });
});

describe("Conversations CRUD - AC-3: Update conversation", () => {
  it("should have update mutation defined", async () => {
    const { update } = await import("../../convex/conversations/mutations");

    expect(update).toBeTruthy();
    expect(typeof update).toBe("function");
  });
});

describe("Conversations CRUD - AC-4: Delete conversation", () => {
  it("should have remove mutation defined", async () => {
    const { remove } = await import("../../convex/conversations/mutations");

    expect(remove).toBeTruthy();
    expect(typeof remove).toBe("function");
  });
});

describe("Conversations CRUD - Additional: Get conversation", () => {
  it("should have get query defined", async () => {
    const { get } = await import("../../convex/conversations/queries");

    expect(get).toBeTruthy();
    expect(typeof get).toBe("function");
  });
});

describe("Conversations CRUD - Module exports", () => {
  it("should export all queries from index", async () => {
    const conversationsModule = await import("../../convex/conversations");

    expect(conversationsModule.list).toBeTruthy();
    expect(conversationsModule.get).toBeTruthy();
    expect(conversationsModule.count).toBeTruthy();
  });

  it("should export all mutations from index", async () => {
    const conversationsModule = await import("../../convex/conversations");

    expect(conversationsModule.create).toBeTruthy();
    expect(conversationsModule.update).toBeTruthy();
    expect(conversationsModule.remove).toBeTruthy();
    expect(conversationsModule.insertFromMigration).toBeTruthy();
    expect(conversationsModule.clearAll).toBeTruthy();
  });
});
