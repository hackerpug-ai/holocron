# US-IMP-011: Product/Service Finder Specialists

> Task ID: US-IMP-011
> Type: FEATURE
> Priority: P3
> Estimate: 180 minutes
> Assignee: backend-implementer

## CRITICAL CONSTRAINTS

### MUST
- Build on specialist system from US-IMP-002
- Generate product/service-specific report formats
- Create distinct report types for product vs service vs general research

### NEVER
- Duplicate work from US-IMP-002 (build on that foundation)
- Remove or alter general research specialist

### STRICTLY
- Product/service reports MUST have different format than general knowledge
- Specialists MUST log improvements to app/product suggestions

## SPECIFICATION

**Objective:** Implement product finder and service finder specialist agents that generate domain-specific reports with structured data (price, ratings, specs) and automatically log improvements.

**Success looks like:** Users can request "Find me a laptop under $800" and receive a structured product comparison report, while the specialist automatically suggests app improvements based on product gaps.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User submits product query | Query matches product domain | Product specialist generates product report | `npx convex run research/actions:startProductResearch | jq '.reportType' | grep -q 'product'` |
| 2 | Product report completes | Report generated | Report includes structured fields (price, rating, specs) | `npx convex run research/queries:get | jq '.fields.price' | grep -q '[0-9]'` |
| 3 | Service query submitted | Query matches service domain | Service specialist generates service report | `npx convex run research/actions:startServiceResearch | jq '.reportType' | grep -q 'service'` |
| 4 | Specialist identifies gaps | Research completes | Improvements logged to improvements system | `npx convex run improvements/queries:list | jq '.[] | select(.source=="product_finder")' | wc -l | grep -q '[1-9]'` |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | Product research returns product report type when product query submitted | AC-1 | `npx convex run research/actions:startProductResearch '{"query":"laptop"}' | jq '.reportType' | grep -q 'product'` | [ ] TRUE [ ] FALSE |
| 2 | Product report contains price field when product research completes | AC-2 | `npx convex run research/queries:get | jq '.fields.price' | grep -q '[0-9]'` | [ ] TRUE [ ] FALSE |
| 3 | Service research returns service report type when service query submitted | AC-3 | `npx convex run research/actions:startServiceResearch '{"query":" plumber"}' | jq '.reportType' | grep -q 'service'` | [ ] TRUE [ ] FALSE |
| 4 | Improvements are logged with specialist source when specialist runs | AC-4 | `npx convex run improvements/queries:list | jq '.[] | select(.source=="product_finder" or .source=="service_finder") | length' | grep -q '[1-9]'` | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `convex/research/specialists/product_finder.ts` (NEW) - Product specialist
- `convex/research/specialists/service_finder.ts` (NEW) - Service specialist
- `convex/research/dispatcher.ts` (MODIFY) - Add product/service routing
- `convex/research/internal.ts` (MODIFY) - Add specialist report generation

### WRITE-PROHIBITED
- `convex/schema.ts` - Schema changes need separate approval
- General research logic - Don't break existing specialists

## DESIGN

### References
- Specialist system from US-IMP-002
- Product/service APIs for comparison data
- Report templates for structured data

### Interaction Notes
- Product queries: "laptop under 800", "best phone camera"
- Service queries: "plumber near me", "web design services"
- Reports should include comparison tables
- Improvements should be specific (e.g., "Add product comparison feature")

### Code Pattern
Specialist implementation:
```typescript
export const productFinder = action({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    // Extract product features from query
    const productFeatures = extractProductSpecs(args.query);

    // Research products
    const products = await searchProducts(productFeatures);

    // Generate structured report
    const report = {
      type: "product",
      fields: {
        price: products[0].price,
        rating: products[0].rating,
        specs: products[0].specs,
      },
      comparisons: products.map(p => ({
        name: p.name,
        price: p.price,
        rating: p.rating,
      })),
    };

    // Log improvements for product gaps
    await logImprovements(ctx, products, "product_finder");

    return report;
  },
});
```

### Anti-pattern (DO NOT)
```typescript
// DON'T: Return general research format
const report = {
  content: "Here are some laptops..."
};

// DO: Return structured product format
const report = {
  type: "product",
  fields: { price, rating, specs },
  comparisons: [...]
};
```

## CODING STANDARDS

- **brain/docs/backend-review**:
  - All external API calls must be rate-limited
  - Error handling for API failures

## DEPENDENCIES

**Depends On:**
- US-IMP-002 (Research Agent Specialists) - Builds on specialist system foundation

## REQUIRED READING

1. `convex/research/specialists/` (from US-IMP-002) - ALL
   Focus: Specialist system foundation

2. `convex/research/dispatcher.ts` - ALL
   Focus: How specialists are invoked

3. `convex/improvements/actions.ts` - Lines 1-50
   Focus: How improvements are created

4. `brain/docs/TDD-METHODOLOGY.md` - Sections: TDD Cycle
   Focus: RED → GREEN → REFACTOR workflow

## NOTES

- Product sources: Google Shopping, Amazon Product API, PriceGrabber
- Service sources: Yelp, Thumbtack, Angi (Angie's List)
- Structured fields: price, rating, availability, specs
- Comparison tables are key differentiator from general research
- Improvement examples: "Add price alerts", "Track product history"
