---
phase: 90-v4-1-mcp-settings-page-connect-to-claude-ux-and-human-uat
plan: 01
subsystem: ui
tags: [mcp, oauth, settings, ux, docs, claude, chatgpt]

requires:
  - phase: 86-v4-1-oauth-2-0-server-for-mcp
    provides: lib/oauth/issuer.ts canonical URL resolver, /api/oauth/* + /.well-known/oauth-authorization-server endpoints, consent UI
  - phase: 87-v4-1-mcp-route-streamable-http-transport-with-bearer-auth
    provides: /api/mcp Streamable HTTP route with Bearer auth + CORS
  - phase: 88-v4-1-read-only-mcp-tools-list-estimates-clients-projects
    provides: 4 read tools (list_estimates, get_estimate, list_clients, list_projects) with readOnlyHint=true
  - phase: 89-v4-1-write-mcp-tools-create-estimate-check-job-status-async
    provides: 2 write tools (create_estimate async, check_job_status) + shared tool registry
provides:
  - /settings/integrations/mcp page with copyable connect URL + per-client instructions
  - /settings/integrations entry card linking to MCP sub-page
  - HUMAN-UAT spec (5 tests) for end-to-end connect-and-call flows in Claude Code, Claude.ai, ChatGPT
affects: future revoke/manage-tokens UI, marketing/landing references to MCP

tech-stack:
  added: []
  patterns:
    - "Static-contract test pattern reused (existence + import + snake_case literal checks) from mcp-route-contract.test.ts (Phase 87)"
    - "Settings entry card grid pattern (Link-wrapped Card with Plug icon + Beta badge + ChevronRight) as the canonical shape for future /settings/integrations entries"

key-files:
  created:
    - app/(app)/settings/integrations/mcp/page.tsx
    - app/(app)/settings/integrations/mcp/copy-button.tsx
    - tests/unit/mcp-settings-page.test.ts
    - .planning/phases/90-v4-1-mcp-settings-page-connect-to-claude-ux-and-human-uat/90-HUMAN-UAT.md
    - .planning/phases/90-v4-1-mcp-settings-page-connect-to-claude-ux-and-human-uat/90-SUMMARY.md
  modified:
    - app/(app)/settings/integrations/page.tsx

key-decisions:
  - "Pure server component for the MCP page (parallel Promise.all over getActiveCompany + resolveIssuer); only the copy buttons are a client sub-component"
  - "Connect URL built from resolveIssuer() + '/api/mcp' — re-uses Phase 86's canonical URL resolver, no duplication"
  - "Snake_case tool names embedded directly in JSX so the static-contract test catches stale doc copy if a tool is ever renamed"
  - "Revoke UI deferred to a follow-up phase — the page links to a placeholder /settings/integrations/mcp/revoke path and labels it 'coming soon'"
  - "Replaced the parent /settings/integrations 'coming soon' placeholder with a card grid; future integrations (Zapier, Make, native webhooks) get added as siblings"
  - "Per-client instructions ship for Claude Code (CLI), Claude.ai/Claude Desktop (Add custom connector dialog), and ChatGPT (Connectors) — same 3 clients the spec calls out"

patterns-established:
  - "Settings sub-page entry card: Link-wrapped Card with lucide icon + Beta badge + ChevronRight; hover lifts border to primary/40 and translates chevron 0.5"
  - "CopyButton: thin client wrapper around navigator.clipboard.writeText with 1.5s check-mark feedback and silent fallback"

requirements-completed: []

duration: 25min
completed: 2026-05-26
---

# Phase 90: v4.1 MCP Settings Page — Connect-to-Claude UX and HUMAN-UAT Summary

**Ships /settings/integrations/mcp with copyable connect URL + per-client instructions (Claude Code, Claude.ai, ChatGPT) and the HUMAN-UAT spec for the end-to-end MCP connect-and-call flow.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-26T12:34:47Z
- **Completed:** 2026-05-26
- **Tasks:** 5
- **Files created:** 5
- **Files modified:** 1

## Accomplishments

- `/settings/integrations/mcp` server-rendered page: connect URL, per-client instructions for Claude Code (CLI), Claude.ai/Claude Desktop, and ChatGPT, full tool catalogue (6 tools), and active-company-aware permissions copy.
- Copy-to-clipboard buttons on both the connect URL and the `claude mcp add ...` command via a small client sub-component.
- Parent `/settings/integrations` page replaced its "coming soon" placeholder with an entry-card grid pointing at the new MCP sub-page (Plug icon + Beta badge).
- 14-test static-contract suite (`tests/unit/mcp-settings-page.test.ts`) — guarantees the page imports the canonical resolvers and references every tool by its snake_case name so doc copy can't silently drift.
- HUMAN-UAT spec (`90-HUMAN-UAT.md`) with 5 end-to-end tests: Claude Code connect + OAuth, read-tool roundtrip, Claude.ai custom connector, async write + poll, token rotation.

## Task Commits

1. **Task 1: CopyButton client component** — `2254f16` (feat)
2. **Task 2: /settings/integrations/mcp page** — `0af3c73` (feat)
3. **Task 3: MCP entry card on parent integrations page** — `627fa96` (feat)
4. **Task 4: Static-contract test (14 tests)** — `885a402` (test)

**Plan metadata commit:** (final docs commit follows this SUMMARY)

## Tools recapped (advertised by /api/mcp tools/list)

Read-only (4) — all carry `readOnlyHint: true`:
- `list_estimates` — paginated list, optional filters
- `get_estimate` — full estimate with sections + items
- `list_clients` — name/email substring search
- `list_projects` — paginated list, optional filters

Write (2):
- `create_estimate` — async; returns `job_id` (dispatches Inngest EVENT_ESTIMATE_GENERATE)
- `check_job_status` — polls Inngest run status by job_id

## Verification

- `npx vitest run tests/unit/mcp-settings-page.test.ts` — 14/14 passing
- `npx tsc --noEmit` — clean
- Page renders against the existing /settings layout (sticky settings sidebar on desktop, horizontal mobile nav)
- Screenshots: skipped per spec (no preview infra)

## HUMAN-UAT outstanding

`90-HUMAN-UAT.md` defines 5 end-to-end tests, all `pending`. These require a live deployment (or `npm run dev` on :9633) and an actual Claude Code / Claude.ai session. Phase 90 ships the artifact + the spec; the actual run is the milestone close-out follow-up.

## v4.1 milestone status

**v4.1 MCP Server is now feature-complete.** All five phases (86 → 90) are live in `main`:

- **Phase 86:** OAuth 2.0 server (authorization, token, registration, well-known metadata + consent UI + 4 DB tables)
- **Phase 87:** `/api/mcp` Streamable HTTP route with Bearer auth + CORS
- **Phase 88:** 4 read tools with `readOnlyHint: true`
- **Phase 89:** 2 write tools + shared `lib/mcp/tools/registry.ts`; 104/104 MCP tests passing
- **Phase 90:** Settings UI + HUMAN-UAT spec (this phase)

The autonomous-mode orchestrator can now call `phase complete 90`, archive the v4.1 milestone, tag `v4.1`, and push. **Those steps are intentionally left for the orchestrator — do not run them from this executor.**

## Self-Check: PASSED

- All 6 expected files exist on disk
- All 4 task commits present in git log (2254f16, 0af3c73, 627fa96, 885a402)
- `npx vitest run tests/unit/mcp-settings-page.test.ts` → 14/14 passing
- `npx tsc --noEmit` → clean
