---
status: partial
phase: 182-shared-document-engine-send-path-fix
source: [182-VERIFICATION.md]
started: 2026-07-28T05:10:00Z
updated: 2026-07-28T05:10:00Z
---

## Current Test

[awaiting human testing — staging sends need live providers]

## Tests

### 1. Email PDF renders tenant template + frozen signed content
expected: In staging, from the Send hub choose PDF → Email for a company with `estimate_template_style = 'modern'` on a SIGNED estimate that was edited after signing. The received email carries a PDF attachment (attachPdf now true), the PDF uses the Modern template, and shows the FROZEN signed content (not the post-signature edit), with Prepared by + attached photos present.
result: [pending]

### 2. WhatsApp PDF renders tenant template + frozen signed content
expected: Same estimate delivered via the WhatsApp pdf_attachment preference: document message arrives, Modern template, frozen signed content, photos/preparedBy present. (Path is in-process — no HTTP call to the PDF route from the webhook context.)
result: [pending]

### 3. Download PDF unchanged (zero visible change)
expected: Download PDF for a pre-existing unsigned classic-template estimate is visually identical to before Phase 182 (labels, dates, addresses, geometry).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
