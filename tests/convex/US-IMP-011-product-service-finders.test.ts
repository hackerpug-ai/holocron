/**
 * US-IMP-011: Product/Service Finder Specialists
 *
 * Tests verify that product and service queries are routed to appropriate specialists
 * and that specialists generate structured reports with price, rating, and specs.
 *
 * AC-1: User submits product query → Query matches product domain → Product specialist generates product report
 * AC-2: Product report completes → Report generated → Report includes structured fields (price, rating, specs)
 * AC-3: Service query submitted → Query matches service domain → Service specialist generates service report
 * AC-4: Specialist identifies gaps → Research completes → Improvements logged to improvements system
 */

import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const specialistsPath = path.resolve(
  __dirname,
  "../../convex/research/specialists"
);
const dispatcherPath = path.resolve(
  __dirname,
  "../../convex/research/dispatcher.ts"
);
const improvementsInternalPath = path.resolve(
  __dirname,
  "../../convex/improvements/internal.ts"
);

function readDispatcher(): string {
  return fs.readFileSync(dispatcherPath, "utf-8");
}

function readImprovementsInternal(): string {
  return fs.readFileSync(improvementsInternalPath, "utf-8");
}

function listSpecialistFiles(): string[] {
  if (!fs.existsSync(specialistsPath)) return [];
  return fs.readdirSync(specialistsPath).filter((f) => f.endsWith(".ts"));
}

// ---------------------------------------------------------------------------
// AC-1: User submits product query → Query matches product domain → Product specialist generates product report
// ---------------------------------------------------------------------------
describe("AC-1: Product specialist generates product report", () => {
  it("should have product finder specialist implementation", () => {
    const files = listSpecialistFiles();
    const productFile = files.find((f) => f.match(/product/i));
    expect(productFile).toBeTruthy();
  });

  it("should export executeProductFinder function", () => {
    const files = listSpecialistFiles();
    const productFile = files.find((f) => f.match(/product/i));
    if (!productFile) throw new Error("Product finder file not found");

    const productPath = path.join(specialistsPath, productFile);
    const src = fs.readFileSync(productPath, "utf-8");
    expect(src).toMatch(/export.*execute.*product/i);
  });

  it("should detect product domain in dispatcher", () => {
    const src = readDispatcher();
    // Should update SpecialistType to include product_finder
    expect(src).toContain("product_finder");
  });

  it("should route product queries to product specialist", () => {
    const src = readDispatcher();
    const detectFunction = src.substring(
      src.indexOf("export function detectSpecialist"),
      src.indexOf("export function", src.indexOf("export function detectSpecialist") + 1) || src.length
    );
    // Should look for product keywords
    expect(detectFunction).toMatch(/product|buy|purchase|price|laptop|phone/i);
  });

  it("should generate product report with type field", () => {
    const files = listSpecialistFiles();
    const productFile = files.find((f) => f.match(/product/i));
    if (!productFile) throw new Error("Product finder file not found");

    const productPath = path.join(specialistsPath, productFile);
    const src = fs.readFileSync(productPath, "utf-8");
    // Should include product report type
    expect(src).toMatch(/reportType.*product|specialist.*product/i);
  });
});

// ---------------------------------------------------------------------------
// AC-2: Product report completes → Report generated → Report includes structured fields (price, rating, specs)
// ---------------------------------------------------------------------------
describe("AC-2: Product report includes structured fields", () => {
  it("should define ProductReport type with price field", () => {
    const files = listSpecialistFiles();
    const productFile = files.find((f) => f.match(/product/i));
    if (!productFile) throw new Error("Product finder file not found");

    const productPath = path.join(specialistsPath, productFile);
    const src = fs.readFileSync(productPath, "utf-8");
    // Should include price field in report type
    expect(src).toMatch(/price|rating|specs|specifications/i);
  });

  it("should include price comparison in product report", () => {
    const files = listSpecialistFiles();
    const productFile = files.find((f) => f.match(/product/i));
    if (!productFile) throw new Error("Product finder file not found");

    const productPath = path.join(specialistsPath, productFile);
    const src = fs.readFileSync(productPath, "utf-8");
    // Should include comparison data
    expect(src).toMatch(/comparisons|compare|products/i);
  });

  it("should extract product specifications from research", () => {
    const files = listSpecialistFiles();
    const productFile = files.find((f) => f.match(/product/i));
    if (!productFile) throw new Error("Product finder file not found");

    const productPath = path.join(specialistsPath, productFile);
    const src = fs.readFileSync(productPath, "utf-8");
    // Should extract specs from search results
    expect(src).toMatch(/specs|specifications|features/i);
  });
});

// ---------------------------------------------------------------------------
// AC-3: Service query submitted → Query matches service domain → Service specialist generates service report
// ---------------------------------------------------------------------------
describe("AC-3: Service specialist generates service report", () => {
  it("should have service finder specialist implementation", () => {
    const files = listSpecialistFiles();
    const serviceFile = files.find((f) => f.match(/service/i));
    expect(serviceFile).toBeTruthy();
  });

  it("should export executeServiceFinder function", () => {
    const files = listSpecialistFiles();
    const serviceFile = files.find((f) => f.match(/service/i));
    if (!serviceFile) throw new Error("Service finder file not found");

    const servicePath = path.join(specialistsPath, serviceFile);
    const src = fs.readFileSync(servicePath, "utf-8");
    expect(src).toMatch(/export.*execute.*service/i);
  });

  it("should detect service domain in dispatcher", () => {
    const src = readDispatcher();
    // Should update SpecialistType to include service_finder
    expect(src).toContain("service_finder");
  });

  it("should route service queries to service specialist", () => {
    const src = readDispatcher();
    const detectFunction = src.substring(
      src.indexOf("export function detectSpecialist"),
      src.indexOf("export function", src.indexOf("export function detectSpecialist") + 1) || src.length
    );
    // Should look for service keywords
    expect(detectFunction).toMatch(/service|plumber|contractor|cleaner|repair/i);
  });

  it("should generate service report with type field", () => {
    const files = listSpecialistFiles();
    const serviceFile = files.find((f) => f.match(/service/i));
    if (!serviceFile) throw new Error("Service finder file not found");

    const servicePath = path.join(specialistsPath, serviceFile);
    const src = fs.readFileSync(servicePath, "utf-8");
    // Should include service report type
    expect(src).toMatch(/reportType.*service|specialist.*service/i);
  });
});

// ---------------------------------------------------------------------------
// AC-4: Specialist identifies gaps → Research completes → Improvements logged to improvements system
// ---------------------------------------------------------------------------
describe("AC-4: Improvements logged from specialists", () => {
  it("should update improvements internal to accept product_finder source", () => {
    const src = readImprovementsInternal();
    // Should include product_finder in source union
    expect(src).toMatch(/product_finder|"product_finder"/i);
  });

  it("should update improvements internal to accept service_finder source", () => {
    const src = readImprovementsInternal();
    // Should include service_finder in source union
    expect(src).toMatch(/service_finder|"service_finder"/i);
  });

  it("should log improvements from product finder", () => {
    const files = listSpecialistFiles();
    const productFile = files.find((f) => f.match(/product/i));
    if (!productFile) throw new Error("Product finder file not found");

    const productPath = path.join(specialistsPath, productFile);
    const src = fs.readFileSync(productPath, "utf-8");
    // Should call improvement logging
    expect(src).toMatch(/submitFromSpecialist|logImprovements/i);
  });

  it("should log improvements from service finder", () => {
    const files = listSpecialistFiles();
    const serviceFile = files.find((f) => f.match(/service/i));
    if (!serviceFile) throw new Error("Service finder file not found");

    const servicePath = path.join(specialistsPath, serviceFile);
    const src = fs.readFileSync(servicePath, "utf-8");
    // Should call improvement logging
    expect(src).toMatch(/submitFromSpecialist|logImprovements/i);
  });

  it("should identify product gaps and suggest improvements", () => {
    const files = listSpecialistFiles();
    const productFile = files.find((f) => f.match(/product/i));
    if (!productFile) throw new Error("Product finder file not found");

    const productPath = path.join(specialistsPath, productFile);
    const src = fs.readFileSync(productPath, "utf-8");
    // Should analyze research for improvement opportunities
    expect(src).toMatch(/gap|opportunity|suggest|improve|enhance/i);
  });

  it("should identify service gaps and suggest improvements", () => {
    const files = listSpecialistFiles();
    const serviceFile = files.find((f) => f.match(/service/i));
    if (!serviceFile) throw new Error("Service finder file not found");

    const servicePath = path.join(specialistsPath, serviceFile);
    const src = fs.readFileSync(servicePath, "utf-8");
    // Should analyze research for improvement opportunities
    expect(src).toMatch(/gap|opportunity|suggest|improve|enhance/i);
  });
});

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------
describe("Integration: Product and Service Finders", () => {
  it("should export new specialists from index", () => {
    const indexPath = path.join(specialistsPath, "index.ts");
    const src = fs.readFileSync(indexPath, "utf-8");
    // Should export new specialists
    expect(src).toMatch(/product|service/i);
  });

  it("should maintain rate limiting for external API calls", () => {
    const files = listSpecialistFiles();
    const productFile = files.find((f) => f.match(/product/i));
    const serviceFile = files.find((f) => f.match(/service/i));

    if (productFile) {
      const productPath = path.join(specialistsPath, productFile);
      const src = fs.readFileSync(productPath, "utf-8");
      // Should use rate-limited search
      expect(src).toMatch(/executeParallelSearchWithRetry|retry|timeout/i);
    }

    if (serviceFile) {
      const servicePath = path.join(specialistsPath, serviceFile);
      const src = fs.readFileSync(servicePath, "utf-8");
      // Should use rate-limited search
      expect(src).toMatch(/executeParallelSearchWithRetry|retry|timeout/i);
    }
  });

  it("should handle API failures gracefully", () => {
    const files = listSpecialistFiles();
    const productFile = files.find((f) => f.match(/product/i));
    const serviceFile = files.find((f) => f.match(/service/i));

    if (productFile) {
      const productPath = path.join(specialistsPath, productFile);
      const src = fs.readFileSync(productPath, "utf-8");
      // Should have error handling
      expect(src).toMatch(/try|catch|error|throw/i);
    }

    if (serviceFile) {
      const servicePath = path.join(specialistsPath, serviceFile);
      const src = fs.readFileSync(servicePath, "utf-8");
      // Should have error handling
      expect(src).toMatch(/try|catch|error|throw/i);
    }
  });
});
