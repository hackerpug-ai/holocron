/**
 * Tests for shop report formatter (convex/shop/output.ts)
 *
 * Verifies that formatShopReport produces correctly structured
 * Wirecutter-style markdown from raw session/listing data.
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
  bestDealId?: string;
};

describe("formatShopReport — AC-1: report header", () => {
  it("includes the query title and date metadata in the header", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "Sony WH-1000XM5 headphones" };
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

    expect(report).toContain("Sony WH-1000XM5 headphones");
    expect(report).toContain("**Type**: shop");
    expect(report).toMatch(/\*\*Date\*\*: \d{4}-\d{2}-\d{2}/);
  });
});

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

describe("formatShopReport — AC-3: trust tier labels", () => {
  it("maps trustTier 1 to Authorized, 2-3 to Verified, 4-5 to Unverified", async () => {
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
    expect(report).toContain("Verified");
    expect(report).toContain("Unverified");
  });
});

describe("formatShopReport — AC-4: Top Picks section with role labels", () => {
  it("labels Best Overall, Runner Up, and Budget Pick when 3+ listings", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "wireless headphones" };
    const listings: ShopListing[] = [
      {
        title: "Premium Pick",
        price: 29900,
        retailer: "Amazon",
        url: "https://amazon.com/premium",
        dealScore: 95,
        trustTier: 1,
      },
      {
        title: "Mid Tier Pick",
        price: 19900,
        retailer: "B&H",
        url: "https://bhphotovideo.com/mid",
        dealScore: 88,
        trustTier: 2,
      },
      {
        title: "Budget Pick Option",
        price: 8999,
        retailer: "eBay",
        url: "https://ebay.com/budget",
        dealScore: 72,
        trustTier: 4,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("Best Overall");
    expect(report).toContain("Runner Up");
    expect(report).toContain("Budget Pick");
  });

  it("shows only available picks when fewer than 3 listings", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "headphones" };
    const listings: ShopListing[] = [
      {
        title: "Only Option",
        price: 19900,
        retailer: "Amazon",
        url: "https://amazon.com/only",
        dealScore: 88,
        trustTier: 1,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("Best Overall");
    expect(report).not.toContain("Runner Up");
    expect(report).not.toContain("Budget Pick");
  });
});

describe("formatShopReport — AC-5: Quick Compare and All Listings tables", () => {
  it("includes Quick Compare table and All Listings section", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "headphones" };
    const listings: ShopListing[] = [
      {
        title: "Product A",
        price: 27900,
        retailer: "Amazon",
        url: "https://amazon.com/a",
        dealScore: 92,
        trustTier: 1,
      },
      {
        title: "Product B",
        price: 19900,
        retailer: "B&H",
        url: "https://bhphotovideo.com/b",
        dealScore: 80,
        trustTier: 3,
      },
    ];

    const report = formatShopReport(session, listings);

    expect(report).toContain("## Quick Compare");
    expect(report).toContain("## All Listings");
    expect(report).toContain("2 total");
  });

  it("truncates product titles to 30 chars in tables", async () => {
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

describe("formatShopReport — AC-6: instant value (best deal summary)", () => {
  it("shows the best deal in the header instant value line", async () => {
    const { formatShopReport } = await import("../../convex/shop/output");

    const session: ShopSession = { query: "noise cancelling headphones" };
    const listings: ShopListing[] = [
      {
        title: "Sony WH-1000XM5",
        price: 27900,
        retailer: "Amazon",
        url: "https://amazon.com/sony",
        dealScore: 95,
        trustTier: 1,
      },
      {
        title: "Bose QC45",
        price: 24900,
        retailer: "Best Buy",
        url: "https://bestbuy.com/bose",
        dealScore: 80,
        trustTier: 2,
      },
    ];

    const report = formatShopReport(session, listings);

    // Should call out best value near top
    expect(report).toContain("BEST VALUE");
    expect(report).toContain("$279.00");
    expect(report).toContain("Amazon");
  });
});
