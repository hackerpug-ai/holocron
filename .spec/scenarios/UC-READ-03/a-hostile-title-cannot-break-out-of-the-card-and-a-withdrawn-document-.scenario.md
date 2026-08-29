---
service: public-reader
feature: UC-READ-03
priority: P0
type: security
tier: holdout
---

# A hostile title cannot break out of the card, and a withdrawn document cannot leak through it

Publish a document titled: Pricing " onload=alert(1) <script>x</script> & the 'edge' case. Fetch the head and confirm the title is present in full but fully escaped, with no executable markup and no attribute break-out. Then unshare a document and fetch it again with a crawler user agent: the response must not contain that document's title, description, or hero image in any meta tag. A revoked link that still unfurls with the document's real title has leaked the content it was revoked to protect.
