/**
 * Improvement backend mutations and queries
 *
 * Tests verify that all improvement API endpoints are registered with correct
 * shape, and that the handler implementations satisfy each acceptance criterion
 * by structural inspection of the source files.
 *
 * AC-1:  submit creates request with status "open" and correct fields
 * AC-2:  submit with storageId creates associated improvementImages row
 * AC-3:  submit without storageId creates no image row
 * AC-4:  update patches title and description, updates updatedAt
 * AC-5:  setStatus transitions between open/closed and records closure metadata
 * AC-6:  list returns non-merged requests ordered by createdAt desc
 * AC-7:  list filters by status when provided
 * AC-8:  list excludes merged requests (mergedIntoId is set)
 * AC-9:  get returns request with images array
 * AC-10: getImages returns images with resolved URLs
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
// AC-1: submit creates request with status "open" and correct fields
// ---------------------------------------------------------------------------
describe("AC-1: submit creates request with status open and correct fields", () => {
  it("should insert into improvementRequests with status open, description, title, sourceScreen, createdAt, updatedAt", () => {
    const src = readMutations();
    expect(fs.existsSync(mutationsPath)).toBe(true);
    expect(src).toContain('export const submit');

    const body = extractHandlerBody(src, "submit");
    // Status must be hardcoded as "open" on insert
    expect(body).toContain('"open"');
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
    expect(body).toContain("description.slice(0, 80)");
  });
});

// ---------------------------------------------------------------------------
// AC-2: submit with storageId creates associated improvementImages row
// ---------------------------------------------------------------------------
describe("AC-2: submit with storageId creates an improvementImages row", () => {
  it("should insert into improvementImages when storageId is provided", () => {
    const body = extractHandlerBody(readMutations(), "submit");
    expect(body).toContain("storageId");
    expect(body).toContain('db.insert("improvementImages"');
    expect(body).toContain("requestId");
  });
});

// ---------------------------------------------------------------------------
// AC-3: submit without storageId creates no image row
// ---------------------------------------------------------------------------
describe("AC-3: submit without storageId creates no image row", () => {
  it("should guard improvementImages insert behind a storageId check", () => {
    const body = extractHandlerBody(readMutations(), "submit");
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
// AC-5: setStatus transitions between open/closed and records closure metadata
// ---------------------------------------------------------------------------
describe("AC-5: setStatus transitions between open/closed", () => {
  it("should be defined as a mutation in mutations.ts", () => {
    const src = readMutations();
    expect(src).toContain("export const setStatus");
    expect(src).toContain("mutation");
  });

  it("should accept both open and closed statuses", () => {
    const src = readMutations();
    // STATUS_VALUES union is defined at module scope and used by setStatus
    expect(src).toContain('"open"');
    expect(src).toContain('"closed"');
    const body = extractHandlerBody(src, "setStatus");
    // Body branches on closed to set closure fields
    expect(body).toContain('"closed"');
  });

  it("should set closedAt when closing", () => {
    const body = extractHandlerBody(readMutations(), "setStatus");
    expect(body).toContain("closedAt");
  });

  it("should record closure reason and evidence when provided", () => {
    const body = extractHandlerBody(readMutations(), "setStatus");
    expect(body).toContain("closureReason");
    expect(body).toContain("closureEvidence");
  });

  it("should throw if the request is not found", () => {
    const body = extractHandlerBody(readMutations(), "setStatus");
    expect(body).toContain("throw new Error");
  });
});

// ---------------------------------------------------------------------------
// AC-6: list returns non-merged requests ordered by createdAt desc
// ---------------------------------------------------------------------------
describe("AC-6: list returns non-merged requests ordered by createdAt desc", () => {
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
    const hasUndefinedFilter =
      body.includes("mergedIntoId === undefined") ||
      body.includes("mergedIntoId == undefined") ||
      body.includes("!r.mergedIntoId") ||
      body.includes("!result.mergedIntoId");
    expect(hasUndefinedFilter).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-7: list filters by status when provided
// ---------------------------------------------------------------------------
describe("AC-7: list filters by status when provided", () => {
  it("should use by_status index when status arg is present", () => {
    const body = extractHandlerBody(readQueries(), "list");
    expect(body).toContain('"by_status"');
    expect(body).toContain("status");
  });

  it("should accept optional status arg with open|closed literals only", () => {
    const src = readQueries();
    expect(src).toContain('"open"');
    expect(src).toContain('"closed"');
    // Legacy literals must be gone
    expect(src).not.toContain('"submitted"');
    expect(src).not.toContain('"pending_review"');
    expect(src).not.toContain('"approved"');
    expect(src).not.toContain('"merged"');
  });
});

// ---------------------------------------------------------------------------
// AC-8: list excludes merged requests (mergedIntoId is set)
// ---------------------------------------------------------------------------
describe("AC-8: list excludes merged requests", () => {
  it("should post-filter results to exclude entries where mergedIntoId is defined", () => {
    const body = extractHandlerBody(readQueries(), "list");
    expect(body).toContain(".filter(");
    expect(body).toContain("mergedIntoId");
  });
});

// ---------------------------------------------------------------------------
// AC-9: get returns request with images array
// ---------------------------------------------------------------------------
describe("AC-9: get returns request with images array", () => {
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
    expect(body).toContain("...request");
    expect(body).toContain("images");
  });

  it("should return null when the request does not exist", () => {
    const body = extractHandlerBody(readQueries(), "get");
    expect(body).toContain("return null");
  });
});

// ---------------------------------------------------------------------------
// AC-10: getImages returns images with resolved URLs
// ---------------------------------------------------------------------------
describe("AC-10: getImages returns images with resolved URLs", () => {
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
    expect(body).toContain("url");
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
    expect(improvements).toBeTruthy();
    const m = improvements as Record<string, unknown>;
    expect(m.submit).toBeTruthy();
    expect(m.update).toBeTruthy();
    expect(m.setStatus).toBeTruthy();
    expect(m.remove).toBeTruthy();
    expect(m.generateUploadUrl).toBeTruthy();
  });

  it("should have public queries registered in the generated API", async () => {
    const { api } = await import("../../convex/_generated/api");
    const improvements = (api as Record<string, unknown>)["improvements/queries"];
    expect(improvements).toBeTruthy();
    const q = improvements as Record<string, unknown>;
    expect(q.list).toBeTruthy();
    expect(q.get).toBeTruthy();
    expect(q.getImages).toBeTruthy();
  });
});
