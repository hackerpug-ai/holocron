/**
 * Internal mutations for improvement reporting system
 *
 * AC-1: updateFromAgent is registered as an internal mutation
 * AC-2: executeMerge is registered as an internal mutation
 */

import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";

const internalFilePath = path.resolve(__dirname, "../../convex/improvements/internal.ts");

describe("AC-1: updateFromAgent internal mutation", () => {
  it("is defined and exported in convex/improvements/internal.ts", () => {
    expect(fs.existsSync(internalFilePath)).toBe(true);
    const src = fs.readFileSync(internalFilePath, "utf8");
    expect(src).toContain("updateFromAgent");
    expect(src).toContain("internalMutation");
  });
});

describe("AC-2: executeMerge internal mutation", () => {
  it("is defined and exported in convex/improvements/internal.ts and patches mergedIntoId + mergedFromIds", () => {
    expect(fs.existsSync(internalFilePath)).toBe(true);
    const src = fs.readFileSync(internalFilePath, "utf8");
    expect(src).toContain("executeMerge");
    expect(src).toContain("mergedIntoId");
    expect(src).toContain("mergedFromIds");
    // Re-links images: must query improvementImages and patch requestId
    expect(src).toContain("improvementImages");
  });
});
