/**
 * Tests for shop report formatter (convex/shop/output.ts)
 *
 * Verifies that formatShopReport produces correctly structured markdown
 * matching the /shop skill OUTPUT FORMAT specification.
 *
 * Reference: ~/.claude/skills/shop/SKILL.md § OUTPUT FORMAT
 */

import { describe, it, expect } from "vitest";

type ShopListing = {
  title: string;
  price: number;
  originalPrice?: number;
  retailer: string;
  seller?: string;
  url: string;
  condition?: string;
  dealScore?: number;
  trustTier?: number;
  isVerifiedSeller?: boolean;
};

type ShopSession = {
  query: string;
  budget?: number;
  condition?: string;
  sessionId?: string;
  bestDealId?: string;
};

// ---------------------------------------------------------------------------
// AC-1: Report header — # Shop Results: {query} with metadata fields
// ---------------------------------------------------------------------------

describe("formatShopReport — AC-1: report header", () => {
  it("produces '# Shop Results: {query}' heading with Search Date, Budget, Condition, Session", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = {
      query: "Sony WH-1000XM5 headphones",
      budget: 35000,
      condition: "new",
      sessionId: "sess-abc123",
    };
    const listings: ShopListing[] = [
      {
        title: "Sony WH-1000XM5 Wireless Headphones",
        price: 27900,
        retailer: "Amazon",
        url: "https://amazon.com/product/1",
        dealScore: 92,
        trustTier: 1,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("# Shop Results: Sony WH-1000XM5 headphones");
    expect(report).toMatch(/\*\*Search Date\*\*: \d{4}-\d{2}-\d{2}/);
    expect(report).toContain("**Budget**: $350.00");
    expect(report).toContain("**Condition**: new");
    expect(report).toContain("**Session**: sess-abc123");
  });

  it("shows 'No limit' for budget when budget is not provided", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "headphones" };
    const listings: ShopListing[] = [
      {
        title: "Some Headphone",
        price: 10000,
        retailer: "Amazon",
        url: "https://amazon.com/x",
        dealScore: 80,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("**Budget**: No limit");
  });

  it("shows '—' for session when sessionId is not provided", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "headphones" };
    const listings: ShopListing[] = [
      {
        title: "Some Headphone",
        price: 10000,
        retailer: "Amazon",
        url: "https://amazon.com/x",
        dealScore: 80,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("**Session**: \u2014");
  });
});

// ---------------------------------------------------------------------------
// AC-2: Price formatting — cents to dollars
// ---------------------------------------------------------------------------

describe("formatShopReport — AC-2: price formatting", () => {
  it("formats prices from cents to dollars", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "test headphones" };
    const listings: ShopListing[] = [
      {
        title: "Test Product",
        price: 27999,
        retailer: "Amazon",
        url: "https://amazon.com/product/1",
        dealScore: 85,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("$279.99");
    expect(report).not.toContain("27999");
  });
});

// ---------------------------------------------------------------------------
// AC-3: Trust tier labels
// ---------------------------------------------------------------------------

describe("formatShopReport — AC-3: trust tier labels", () => {
  it("maps trustTier 1 to Authorized, 2-3 to Verified Seller, 4-5 to Unverified", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "headphones" };
    const listings: ShopListing[] = [
      {
        title: "Product A",
        price: 10000,
        retailer: "Amazon",
        url: "https://amazon.com/a",
        dealScore: 92,
        trustTier: 1,
      },
      {
        title: "Product B",
        price: 9000,
        retailer: "B&H",
        url: "https://bhphotovideo.com/b",
        dealScore: 87,
        trustTier: 2,
      },
      {
        title: "Product C",
        price: 7500,
        retailer: "eBay",
        url: "https://ebay.com/c",
        dealScore: 78,
        trustTier: 5,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("Authorized");
    expect(report).toContain("Verified Seller");
    expect(report).toContain("Unverified");
  });
});

// ---------------------------------------------------------------------------
// AC-4: Comparison tables — New Products and Used/Refurbished separated
// ---------------------------------------------------------------------------

describe("formatShopReport — AC-4: comparison tables split by condition", () => {
  it("places new listings under 'New Products' and used listings under 'Used/Refurbished'", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "wireless headphones" };
    const listings: ShopListing[] = [
      {
        title: "Brand New Headphones",
        price: 29900,
        retailer: "Amazon",
        url: "https://amazon.com/new",
        condition: "new",
        dealScore: 90,
        trustTier: 1,
      },
      {
        title: "Refurbished Headphones",
        price: 15000,
        retailer: "Back Market",
        url: "https://backmarket.com/ref",
        condition: "refurbished",
        dealScore: 75,
        trustTier: 2,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("### New Products");
    expect(report).toContain("### Used/Refurbished");

    // New table should not have Condition column
    const newSection = report.slice(
      report.indexOf("### New Products"),
      report.indexOf("### Used/Refurbished"),
    );
    expect(newSection).not.toContain("Condition");

    // Used table should have Condition column
    const usedSection = report.slice(report.indexOf("### Used/Refurbished"));
    expect(usedSection).toContain("Condition");
  });

  it("omits Used/Refurbished section when there are no used listings", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "headphones" };
    const listings: ShopListing[] = [
      {
        title: "New Headphones",
        price: 25000,
        retailer: "Best Buy",
        url: "https://bestbuy.com/new",
        condition: "new",
        dealScore: 88,
        trustTier: 1,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("### New Products");
    expect(report).not.toContain("### Used/Refurbished");
  });

  it("includes Deal Score column in comparison tables", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "headphones" };
    const listings: ShopListing[] = [
      {
        title: "Test Headphones",
        price: 20000,
        retailer: "Amazon",
        url: "https://amazon.com/test",
        dealScore: 83,
        trustTier: 1,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("Deal Score");
    expect(report).toContain("83/100");
  });

  it("includes link column with arrow notation [→](url)", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "headphones" };
    const listings: ShopListing[] = [
      {
        title: "Test Product",
        price: 15000,
        retailer: "Amazon",
        url: "https://amazon.com/linktest",
        dealScore: 70,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("[→](https://amazon.com/linktest)");
  });

  it("truncates product titles beyond 30 chars in comparison tables", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "headphones" };
    const listings: ShopListing[] = [
      {
        title: "This Is A Very Long Product Title That Exceeds Thirty Characters",
        price: 10000,
        retailer: "Amazon",
        url: "https://amazon.com/long",
        dealScore: 88,
      },
    ];

    const report = formatShopReport(session, listings);

    // The full 63-char title should not appear verbatim in tables
    expect(report).not.toContain(
      "This Is A Very Long Product Title That Exceeds Thirty Characters",
    );
  });
});

// ---------------------------------------------------------------------------
// AC-5: Recommendations section
// ---------------------------------------------------------------------------

describe("formatShopReport — AC-5: recommendations section", () => {
  it("includes Best Deal, Budget Pick, Best New, Best Used when applicable", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "headphones" };
    const listings: ShopListing[] = [
      {
        title: "Premium New Headphone",
        price: 30000,
        retailer: "Amazon",
        url: "https://amazon.com/premium",
        condition: "new",
        dealScore: 95,
        trustTier: 1,
      },
      {
        title: "Budget New Headphone",
        price: 8000,
        retailer: "Walmart",
        url: "https://walmart.com/budget",
        condition: "new",
        dealScore: 70,
        trustTier: 1,
      },
      {
        title: "Used Headphone",
        price: 12000,
        retailer: "eBay",
        url: "https://ebay.com/used",
        condition: "used",
        dealScore: 80,
        trustTier: 2,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("## Recommendations");
    expect(report).toContain("**Best Deal**:");
    expect(report).toContain("**Budget Pick**:");
    expect(report).toContain("**Best New**:");
    expect(report).toContain("**Best Used**:");
  });

  it("omits Best Used when there are no used listings", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "headphones" };
    const listings: ShopListing[] = [
      {
        title: "New Option A",
        price: 25000,
        retailer: "Amazon",
        url: "https://amazon.com/a",
        condition: "new",
        dealScore: 90,
        trustTier: 1,
      },
      {
        title: "New Option B",
        price: 10000,
        retailer: "Best Buy",
        url: "https://bestbuy.com/b",
        condition: "new",
        dealScore: 75,
        trustTier: 1,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("**Best Deal**:");
    expect(report).toContain("**Best New**:");
    expect(report).not.toContain("**Best Used**:");
  });

  it("recommendation lines include price, retailer, and score for Best Deal", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "noise cancelling headphones" };
    const listings: ShopListing[] = [
      {
        title: "Sony WH-1000XM5",
        price: 27900,
        retailer: "Amazon",
        url: "https://amazon.com/sony",
        condition: "new",
        dealScore: 95,
        trustTier: 1,
      },
    ];

    const report = formatShopReport(session, listings);

    const recSection = report.slice(report.indexOf("## Recommendations"));
    expect(recSection).toContain("$279.00");
    expect(recSection).toContain("Amazon");
    expect(recSection).toContain("Score: 95");
  });
});

// ---------------------------------------------------------------------------
// AC-6: Notes section and Trust Legend
// ---------------------------------------------------------------------------

describe("formatShopReport — AC-6: notes and trust legend", () => {
  it("includes a Notes section", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "headphones" };
    const listings: ShopListing[] = [
      {
        title: "Test Headphone",
        price: 20000,
        retailer: "Amazon",
        url: "https://amazon.com/test",
        dealScore: 80,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("## Notes");
  });

  it("includes Trust Legend with Authorized, Verified Seller, Unverified definitions", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "headphones" };
    const listings: ShopListing[] = [
      {
        title: "Test Headphone",
        price: 20000,
        retailer: "Amazon",
        url: "https://amazon.com/test",
        dealScore: 80,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("**Trust Legend:**");
    expect(report).toContain("**Authorized**:");
    expect(report).toContain("**Verified Seller**:");
    expect(report).toContain("**Unverified**:");
  });

  it("includes ephemeral footer note", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "headphones" };
    const listings: ShopListing[] = [
      {
        title: "Test Headphone",
        price: 20000,
        retailer: "Amazon",
        url: "https://amazon.com/test",
        dealScore: 80,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("Generated by /shop via holocron MCP");
    expect(report).toContain("ephemeral");
  });
});

// ---------------------------------------------------------------------------
// AC-7: Empty listings
// ---------------------------------------------------------------------------

describe("formatShopReport — AC-7: empty listings", () => {
  it("returns a header and no-results message when listings is empty", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = {
      query: "unobtainium headphones",
      sessionId: "sess-empty",
    };
    const listings: ShopListing[] = [];

    const report = formatShopReport(session, listings);

    expect(report).toContain("# Shop Results: unobtainium headphones");
    expect(report).toContain("**Session**: sess-empty");
    expect(report).toMatch(/[Nn]o listings/);
    expect(report).not.toContain("## Comparison Table");
    expect(report).not.toContain("## Recommendations");
  });
});
