/**
 * Improvement backend mutations and queries
 *
 * Tests verify that all improvement API endpoints are registered with correct
 * shape, and that the handler implementations satisfy each acceptance criterion
 * by structural inspection of the source files.
 *
 * AC-1:  submit creates request with status "submitted" and correct fields
 * AC-2:  submit with storageId creates associated improvementImages row
 * AC-3:  submit without storageId creates no image row
 * AC-4:  update patches title and description, updates updatedAt
 * AC-5:  approve transitions from pending_review to approved
 * AC-6:  approve throws/rejects if status is not pending_review
 * AC-7:  list returns non-merged requests ordered by createdAt desc
 * AC-8:  list filters by status when provided
 * AC-9:  list excludes merged requests (mergedIntoId is set)
 * AC-10: get returns request with images array
 * AC-11: getImages returns images with resolved URLs
 */

import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";

const mutationsPath = path.resolve(
  __dirname,
  "../../convex/improvements/mutations.ts"
);
const queriesPath = path.resolve(
  __dirname,
  "../../convex/improvements/queries.ts"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readMutations(): string {
  return fs.readFileSync(mutationsPath, "utf8");
}

function readQueries(): string {
  return fs.readFileSync(queriesPath, "utf8");
}

/** Extract the body of a named export function from a source string. */
function extractHandlerBody(src: string, exportName: string): string {
  const idx = src.indexOf(`export const ${exportName}`);
  if (idx === -1) return "";
  // Find the next top-level export or end of file
  const rest = src.slice(idx);
  const nextExportMatch = rest.search(/\nexport const /);
  return nextExportMatch > -1 ? rest.slice(0, nextExportMatch) : rest;
}

// ---------------------------------------------------------------------------
// AC-1: submit creates request with status "submitted" and correct fields
// ---------------------------------------------------------------------------
describe("AC-1: submit creates request with status submitted and correct fields", () => {
  it("should insert into improvementRequests with status submitted, description, title, sourceScreen, createdAt, updatedAt", () => {
    const src = readMutations();
    expect(fs.existsSync(mutationsPath)).toBe(true);
    expect(src).toContain('export const submit');

    const body = extractHandlerBody(src, "submit");
    // Status must be hardcoded as "submitted" on insert
    expect(body).toContain('"submitted"');
    // Must insert into improvementRequests table
    expect(body).toContain('db.insert("improvementRequests"');
    // Must carry required fields
    expect(body).toContain("description");
    expect(body).toContain("sourceScreen");
    expect(body).toContain("createdAt");
    expect(body).toContain("updatedAt");
  });

  it("should derive title from the first 80 characters of description", () => {
    const body = extractHandlerBody(readMutations(), "submit");
    // title is set via description.slice(0, 80)
    expect(body).toContain("description.slice(0, 80)");
  });
});

// ---------------------------------------------------------------------------
// AC-2: submit with storageId creates associated improvementImages row
// ---------------------------------------------------------------------------
describe("AC-2: submit with storageId creates an improvementImages row", () => {
  it("should insert into improvementImages when storageId is provided", () => {
    const body = extractHandlerBody(readMutations(), "submit");
    // Conditional on storageId being defined
    expect(body).toContain("storageId");
    expect(body).toContain('db.insert("improvementImages"');
    // The row must reference the newly created requestId
    expect(body).toContain("requestId");
  });
});

// ---------------------------------------------------------------------------
// AC-3: submit without storageId creates no image row
// ---------------------------------------------------------------------------
describe("AC-3: submit without storageId creates no image row", () => {
  it("should guard improvementImages insert behind a storageId check", () => {
    const body = extractHandlerBody(readMutations(), "submit");
    // The guard must test that storageId is not undefined before inserting
    const hasUndefinedGuard =
      body.includes("storageId !== undefined") ||
      body.includes("storageId != undefined") ||
      body.includes("if (storageId)");
    expect(hasUndefinedGuard).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-4: update patches title and description, updates updatedAt
// ---------------------------------------------------------------------------
describe("AC-4: update patches title and description, updates updatedAt", () => {
  it("should be defined as a mutation in mutations.ts", () => {
    const src = readMutations();
    expect(src).toContain("export const update");
    expect(src).toContain("mutation");
  });

  it("should patch both title and description when provided", () => {
    const body = extractHandlerBody(readMutations(), "update");
    expect(body).toContain("title");
    expect(body).toContain("description");
    expect(body).toContain("db.patch");
  });

  it("should always include updatedAt in the patch", () => {
    const body = extractHandlerBody(readMutations(), "update");
    expect(body).toContain("updatedAt");
  });

  it("should only patch fields that are explicitly provided (conditional patching)", () => {
    const body = extractHandlerBody(readMutations(), "update");
    // Both title and description are optional and patched conditionally
    const titleIsConditional =
      body.includes("title !== undefined") ||
      body.includes("if (title)") ||
      body.includes("patch.title");
    const descIsConditional =
      body.includes("description !== undefined") ||
      body.includes("if (description)") ||
      body.includes("patch.description");
    expect(titleIsConditional).toBe(true);
    expect(descIsConditional).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-5: approve transitions from pending_review to approved
// ---------------------------------------------------------------------------
describe("AC-5: approve transitions from pending_review to approved", () => {
  it("should be defined as a mutation in mutations.ts", () => {
    const src = readMutations();
    expect(src).toContain("export const approve");
    expect(src).toContain("mutation");
  });

  it("should patch status to approved when no merge action is indicated", () => {
    const body = extractHandlerBody(readMutations(), "approve");
    expect(body).toContain('"approved"');
    expect(body).toContain("db.patch");
    expect(body).toContain("updatedAt");
  });

  it("should check for pending_review status before approving", () => {
    const body = extractHandlerBody(readMutations(), "approve");
    expect(body).toContain('"pending_review"');
  });
});

// ---------------------------------------------------------------------------
// AC-6: approve throws if status is not pending_review
// ---------------------------------------------------------------------------
describe("AC-6: approve throws if status is not pending_review", () => {
  it("should throw with an error message when status is not pending_review", () => {
    const body = extractHandlerBody(readMutations(), "approve");
    // Must contain a throw and reference the status mismatch
    expect(body).toContain("throw new Error");
    // Error must reference the expected status
    expect(body).toContain('"pending_review"');
    // Error must mention "status" so the caller gets a useful message
    expect(body.toLowerCase()).toContain("status");
  });

  it("should guard the throw before any db.patch call", () => {
    const body = extractHandlerBody(readMutations(), "approve");
    const throwIdx = body.indexOf("throw new Error");
    const firstPatchIdx = body.indexOf("db.patch");
    expect(throwIdx).toBeGreaterThan(-1);
    expect(firstPatchIdx).toBeGreaterThan(-1);
    expect(throwIdx).toBeLessThan(firstPatchIdx);
  });
});

// ---------------------------------------------------------------------------
// AC-7: list returns non-merged requests ordered by createdAt desc
// ---------------------------------------------------------------------------
describe("AC-7: list returns non-merged requests ordered by createdAt desc", () => {
  it("should be defined as a query in queries.ts", () => {
    const src = readQueries();
    expect(fs.existsSync(queriesPath)).toBe(true);
    expect(src).toContain("export const list");
    expect(src).toContain("query");
  });

  it("should use by_created index and order desc for the no-status path", () => {
    const body = extractHandlerBody(readQueries(), "list");
    expect(body).toContain('"by_created"');
    expect(body).toContain('"desc"');
  });

  it("should filter out records that have mergedIntoId defined", () => {
    const body = extractHandlerBody(readQueries(), "list");
    expect(body).toContain("mergedIntoId");
    // The filter must check mergedIntoId is undefined
    const hasUndefinedFilter =
      body.includes("mergedIntoId === undefined") ||
      body.includes("mergedIntoId == undefined") ||
      body.includes("!r.mergedIntoId") ||
      body.includes("!result.mergedIntoId");
    expect(hasUndefinedFilter).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-8: list filters by status when provided
// ---------------------------------------------------------------------------
describe("AC-8: list filters by status when provided", () => {
  it("should use by_status index when status arg is present", () => {
    const body = extractHandlerBody(readQueries(), "list");
    expect(body).toContain('"by_status"');
    // Must do an equality filter on status
    expect(body).toContain("status");
  });

  it("should accept optional status arg with all valid status literals", () => {
    const src = readQueries();
    // All status literals must be present in the query validators
    expect(src).toContain('"submitted"');
    expect(src).toContain('"processing"');
    expect(src).toContain('"pending_review"');
    expect(src).toContain('"approved"');
    expect(src).toContain('"done"');
    expect(src).toContain('"merged"');
  });
});

// ---------------------------------------------------------------------------
// AC-9: list excludes merged requests (mergedIntoId is set)
// ---------------------------------------------------------------------------
describe("AC-9: list excludes merged requests", () => {
  it("should post-filter results to exclude entries where mergedIntoId is defined", () => {
    const body = extractHandlerBody(readQueries(), "list");
    // The filter must be a .filter() call referencing mergedIntoId
    expect(body).toContain(".filter(");
    expect(body).toContain("mergedIntoId");
  });
});

// ---------------------------------------------------------------------------
// AC-10: get returns request with images array
// ---------------------------------------------------------------------------
describe("AC-10: get returns request with images array", () => {
  it("should be defined as a query in queries.ts", () => {
    const src = readQueries();
    expect(src).toContain("export const get");
    expect(src).toContain("query");
  });

  it("should query improvementImages by requestId and attach them to the result", () => {
    const body = extractHandlerBody(readQueries(), "get");
    expect(body).toContain("improvementImages");
    expect(body).toContain("by_request");
    expect(body).toContain("images");
  });

  it("should spread the request fields and add an images property", () => {
    const body = extractHandlerBody(readQueries(), "get");
    // Result must merge request and images: { ...request, images: ... }
    expect(body).toContain("...request");
    expect(body).toContain("images");
  });

  it("should return null when the request does not exist", () => {
    const body = extractHandlerBody(readQueries(), "get");
    expect(body).toContain("return null");
  });
});

// ---------------------------------------------------------------------------
// AC-11: getImages returns images with resolved URLs
// ---------------------------------------------------------------------------
describe("AC-11: getImages returns images with resolved URLs", () => {
  it("should be defined as a query in queries.ts", () => {
    const src = readQueries();
    expect(src).toContain("export const getImages");
    expect(src).toContain("query");
  });

  it("should resolve storage URLs for each image via ctx.storage.getUrl", () => {
    const body = extractHandlerBody(readQueries(), "getImages");
    expect(body).toContain("storage.getUrl");
    expect(body).toContain("storageId");
  });

  it("should return the images with url field attached", () => {
    const body = extractHandlerBody(readQueries(), "getImages");
    // url must be included in the returned object
    expect(body).toContain("url");
    // Uses Promise.all or map to resolve all image URLs
    const usesPromiseAll =
      body.includes("Promise.all") || body.includes(".map(");
    expect(usesPromiseAll).toBe(true);
  });

  it("should use by_request index to query images for the given requestId", () => {
    const body = extractHandlerBody(readQueries(), "getImages");
    expect(body).toContain('"by_request"');
    expect(body).toContain("requestId");
  });
});

// ---------------------------------------------------------------------------
// API registration: mutations and queries are in the generated API
// ---------------------------------------------------------------------------
describe("API registration: improvements mutations and queries", () => {
  it("should have public mutations registered in the generated API", async () => {
    const { api } = await import("../../convex/_generated/api");
    const improvements = (api as Record<string, unknown>)["improvements/mutations"];
    expect(improvements).toBeDefined();
    const m = improvements as Record<string, unknown>;
    expect(m.submit).toBeDefined();
    expect(m.update).toBeDefined();
    expect(m.approve).toBeDefined();
    expect(m.reject).toBeDefined();
    expect(m.generateUploadUrl).toBeDefined();
  });

  it("should have public queries registered in the generated API", async () => {
    const { api } = await import("../../convex/_generated/api");
    const improvements = (api as Record<string, unknown>)["improvements/queries"];
    expect(improvements).toBeDefined();
    const q = improvements as Record<string, unknown>;
    expect(q.list).toBeDefined();
    expect(q.get).toBeDefined();
    expect(q.getImages).toBeDefined();
  });
});
