---
service: holocron-web
feature: J-COLD-FORWARD
covers_ucs: ["UC-READ-03", "UC-READ-02", "UC-READ-01", "UC-READ-04", "UC-READ-06", "UC-READ-05"]
priority: P0
type: happy_path
tier: visible
test_tier: e2e
persona: stranger
---

# A forwarded link meets the reader before the document does, and dies calmly two hops later

The entire outward-facing surface as one arc, with ZERO fixtures anywhere - the public page is a pure function of database state. A link minted before the rewrite is pasted into a client: the unfurl metadata is scraped from the raw HTML and its hero image really resolves. The stranger opens that same legacy URL on a WebKit iPhone viewport with the OS in light mode, gets a light page with provenance in the first screen and no gate of any kind, reads with every figure decoded, taps a dense chart to enlarge past the measure, copies a heading anchor and hands that section link onward. A second-hop reader opens the anchor link cold and lands at that section. Then the operator withdraws the document through the real Library toggle, and the saved anchor link answers 404 with the calm withdrawn page and intact cache headers - so the dead link never reaches the device. This journey extends the reference flow rather than repeating it: the reference flow proves one document renders and revocation removes it; this proves the link's whole social life - preview, cold landing, section handoff, second hop, withdrawal.

## Steps and assertions

1. **Fetch the LEGACY seeded /d/<token> URL through the request fixture with no JavaScript**
   - asserts: status 200; raw HTML body contains the documents.title read from Postgres for that token; path matches ^/d/[A-Za-z0-9_-]+$ with no redirect (redirectedFrom() is null)

2. **Parse the unfurl metadata out of that same raw HTML**
   - asserts: og:title equals documents.title from Postgres; og:description non-empty and a prefix-match of the first body paragraph; twitter:card present; og:image an absolute URL

3. **Fetch the og:image URL directly**
   - asserts: status 200, content-type starts with image/, content-length > 0

4. **Open the same URL in WebKit at iPhone viewport, colorScheme 'light', empty storageState**
   - asserts: Computed body background relative luminance > 0.5 (followed the OS scheme rather than forcing dark); document.scrollWidth <= clientWidth (no horizontal scroll); no Set-Cookie on the navigation response

5. **Look for provenance and for any gate, without scrolling**
   - asserts: provenance title, publisher and date each have a bounding box with y+height <= viewport height; date text equals the seeded published_at formatted; zero elements matching /sign ?in/i, cookie-banner, app-interstitial, or role=dialog

6. **Scroll through the body on the phone viewport**
   - asserts: Every img naturalWidth > 0 including the document-local one; the document-local img's resolved src path matches ^/d/<token>/assets/; the progress rail's data-progress <= 0.02 at top and >= 0.98 at bottom

7. **Tap the dense chart to enlarge**
   - asserts: Lightbox img naturalWidth > 0 and its rendered width strictly greater than the reading column's width; after dismiss, lightbox element count is 0

8. **Follow a citation from a claim to its source**
   - asserts: The citation anchor's href equals the source_url stored on the seeded citation row in Postgres

9. **Copy a heading anchor (Chromium context) and open it in a fresh empty-storageState context**
   - asserts: Clipboard text equals https://{canonical_share_host}/d/{token}#{slug} where slug equals the server-rendered heading id; on the fresh load location.hash equals that slug and the heading's bounding box top is within the viewport

10. **Operator unshares through the real Library toggle, then the stranger reopens the saved ANCHOR URL**
   - asserts: status 404; withdrawn element present; zero sign-in affordances; both cache headers present with the same exact strings asserted on the 200

## Lifecycle

**Turns green when.** UC-READ-03 and UC-READ-04 land - unfurl metadata and heading anchors are the last two pieces; UC-READ-01/02/05/06 land earlier in the same READ sprint.

**Expected red until.** The end of the READ sprint. This is the FIRST journey that can go green, because the public reader depends on no auth, no tRPC and no agent loop - red only for the duration of sprint 1, plus the blocking INFRA prerequisite that seeds real document_assets, file_objects and a real blob.
