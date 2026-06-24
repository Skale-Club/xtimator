# Phase 114 — Deferred Items

## Out-of-scope discoveries (do NOT fix in this plan)

### 1. Flaky `tests/unit/mcp-route-contract.test.ts` under full parallel run
- **Found during:** 114-01 full-suite verification.
- **Symptom:** `GET returns 405 Method Not Allowed with Allow: POST header` fails ONLY in the full `npx vitest run` (1 failed / 2065 passed). Run in isolation the file passes 8/8.
- **Out of scope:** Touches no file modified by Phase 114 (no MCP/route/shared module). Pre-existing test-isolation/ordering flake, unrelated to the estimate fee work.
- **Action:** Not fixed. Logged for a future MCP/test-infra pass.
