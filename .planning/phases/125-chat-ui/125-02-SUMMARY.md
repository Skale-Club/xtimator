---
phase: 125-chat-ui
plan: 02
subsystem: ui
tags: [chat, multimodal, mediarecorder, normalize, useChat, job-poll, estimate-card, vitest, shadcn, i18n]

# Dependency graph
requires:
  - phase: 125-01
    provides: "useChat thread + chat-message/chat-tool-part + CHAT_COMPOSER_SEAM + ESTIMATE_CARD_SEAM (the two seams this plan fills)"
  - phase: 125-00
    provides: "normalizeChatInput server action (audio/photo → text) + the chat-composer/estimate-card RED scaffolds"
  - phase: 91-pipeline-reliability
    provides: "useJobStatus / pollJob discriminated job-poll over GET /api/jobs/[jobId]"
provides:
  - "components/chat/chat-composer.tsx — multimodal input (text + audio + photo) → normalizeChatInput → onSend(text) (CHATUI-03)"
  - "components/chat/estimate-card.tsx — inline card polling useJobStatus + resolve-then-Open-in-editor (CHATUI-04)"
  - "lib/actions/chat.ts resolveCurrentEstimateId — owner+tenant-scoped current-estimate-id resolver for the editor link"
  - "chat-thread CHAT_COMPOSER_SEAM filled (multimodal ChatComposer) + chat-tool-part ESTIMATE_CARD_SEAM filled (EstimateCard)"
affects: [chat-ui, multimodal-composer, estimate-card, v4.9-feature-complete]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multimodal-to-text composer: MediaRecorder started INSIDE the click handler (iOS gesture — Pitfall 7); blob/photo → base64 → normalizeChatInput → onSend(text). NEVER sendMessage({files}) (Pitfall 4)"
    - "Inline async-job result card: useJobStatus(jobId) discriminated render (processing→spinner, terminal-error→friendly card, completed→resolve estimate id then Open-in-editor Link)"
    - "createEstimate returns {jobId} only; the produced estimate id is resolved post-completion via a server action (getCurrentEstimate by project_id+is_current) with an active-company tenant guard"

key-files:
  created:
    - components/chat/chat-composer.tsx
    - components/chat/estimate-card.tsx
  modified:
    - components/chat/chat-thread.tsx
    - components/chat/chat-tool-part.tsx
    - lib/actions/chat.ts
    - tests/unit/chat/chat-composer.test.tsx
    - tests/unit/chat/estimate-card.test.tsx

key-decisions:
  - "resolveCurrentEstimateId added an active-company tenant guard (est.company_id === activeCompanyId) beyond the plan's auth-only sketch — Rule 2 authorization, never leak an estimate across tenants"
  - "ChatComposer owns its own text useState (lifted out of chat-thread); chat-thread's submit() became submit(text) and the inline textarea/Send was removed entirely so the seam is fully replaced (acceptance: no inline CHAT_COMPOSER_SEAM composer remains)"
  - "Photo path hard-codes mimeType 'image/jpeg' because compressImage always emits JPEG; the current composer text rides along as the caption (folded into the analysis by normalizeInput) and is cleared on success"

patterns-established:
  - "Both Plan-01 seams are now live wirings, not placeholders: chat-thread renders <ChatComposer/>, chat-tool-part renders <EstimateCard/> for tool-createEstimate output-available"

requirements-completed: [CHATUI-03, CHATUI-04]

# Metrics
duration: 8min
completed: 2026-06-25
---

# Phase 125 Plan 02: Chat UI — Multimodal Composer + Inline Estimate Card Summary

**Brought the in-app chat to v1 parity by filling the two seams Plan 01 left: a multimodal `ChatComposer` (text + gesture-bound audio + photo, each normalized to text via the `normalizeChatInput` server action and sent as a normal `sendMessage({text})`) and an inline `EstimateCard` that polls the async generation job via `useJobStatus` and, on completion, resolves the produced estimate id (new `resolveCurrentEstimateId` action, tenant-guarded) to surface an "Open in editor" link to the existing editor — UI-only, with the Phase-124 backend route and tools left frozen (scope fence green).**

## Performance
- **Duration:** 8 min
- **Started:** 2026-06-25T09:11:32Z
- **Completed:** 2026-06-25T09:19:02Z
- **Tasks:** 2
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments
- **CHATUI-03** — the chat input now accepts text + audio + photo. Audio records via MediaRecorder started inside the click handler (iOS Safari gesture), photo runs through `compressImage`; both are base64'd and sent to `normalizeChatInput`, whose returned transcript/analysis text becomes a normal `onSend(text)`. No raw files ever reach the model (Pitfall 4). A busy flag disables every input while normalizing OR while the thread is streaming.
- **CHATUI-04** — when the assistant calls `createEstimate`, the `tool-createEstimate` `output-available` part now renders an inline `EstimateCard` that polls the generation job (`useJobStatus`): a spinner while processing, a friendly i18n error card on `failed`/`config_unavailable`/`not_found` (surfacing `reason`, never a raw status code), and on completion an "Open in editor" Button linking to `/projects/<id>?tab=estimate&estimate=<id>`.
- Both Plan-01 seams are filled: `chat-thread` mounts `<ChatComposer/>` at `CHAT_COMPOSER_SEAM` (inline composer removed), `chat-tool-part` mounts `<EstimateCard/>` at `ESTIMATE_CARD_SEAM`.
- The last two RED scaffolds (`chat-composer.test.tsx`, `estimate-card.test.tsx`) are GREEN. Full chat suite 14 files / 84 passed; full unit suite **333 files / 2321 passed / 0 failures**; the Phase-124 scope fence stays green.

## Task Commits
1. **Task 1: chat-composer (text + audio + photo via normalize) + thread wiring (CHATUI-03)** — `a13b15a4` (feat)
2. **Task 2: estimate-card (poll job + Open-in-editor) + tool-part wiring + resolveCurrentEstimateId (CHATUI-04)** — `50df976a` (feat)

## Files Created/Modified
- `components/chat/chat-composer.tsx` — multimodal composer: Textarea (Enter-submit) + Mic (MediaRecorder gesture-bound, `getSupportedAudioMimeType`/`getFileExtension`) + Paperclip (`compressImage`), all → `normalizeChatInput` → `onSend(text)`; sonner toasts on failure; i18n labels; busy/recording disabling
- `components/chat/estimate-card.tsx` — `useJobStatus(jobId)` discriminated render; on `completed` a `useEffect` calls `resolveCurrentEstimateId(projectId)` then renders the `Open in editor` Link
- `components/chat/chat-thread.tsx` — `submit()` → `submit(text)`, inline text-only composer removed, `<ChatComposer onSend={…} busy={busy} />` mounted at the seam
- `components/chat/chat-tool-part.tsx` — `tool-createEstimate` `output-available` reads `jobId = output.jobId` + `projectId = input.projectId` → `<EstimateCard/>` (fallback box kept for an unexpected shape)
- `lib/actions/chat.ts` — `resolveCurrentEstimateId(projectId)`: auth + active-company resolve + `getCurrentEstimate` (service client) + tenant guard → estimate id or null
- `tests/unit/chat/{chat-composer,estimate-card}.test.tsx` — RED scaffolds turned GREEN

## Decisions Made
- **Tenant-guarded `resolveCurrentEstimateId`** — the plan sketched an auth-only resolver; I added `est.company_id === activeCompanyId` so the editor-link resolver can never surface an estimate from another tenant (Rule 2 — authorization). Returns null on any auth/tenant/lookup miss; never throws.
- **Composer owns the text state** — lifting `text`/`setText` into `ChatComposer` (out of `chat-thread`) lets the photo caption read the live text and lets the composer fully replace the seam; `chat-thread.submit` became `submit(text)`, satisfying the acceptance criterion that the inline `CHAT_COMPOSER_SEAM` composer no longer exists.
- **Photo mimeType is `image/jpeg`** — `compressImage` always emits JPEG, so the photo branch sends a fixed `mimeType: 'image/jpeg'`; the current composer text is passed as the `caption` and cleared on success.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing authorization] Added an active-company tenant guard to resolveCurrentEstimateId**
- **Found during:** Task 2
- **Issue:** The plan's action sketch authenticated the user but did not verify the resolved estimate belongs to the caller's active company — a cross-tenant id could be returned for a guessed projectId.
- **Fix:** Resolve `getActiveCompanyId()` and return the estimate id only when `est.company_id === companyId`; otherwise null.
- **Files modified:** lib/actions/chat.ts
- **Commit:** `50df976a`

**Total deviations:** 1 auto-fixed (authorization). **Impact:** strictly tightens tenant isolation; no behavior change for the happy path; backend route/tools stay frozen, no scope creep.

## Deferred Issues
Out-of-scope pre-existing `tsc --noEmit` errors (4 test files, last touched in phases 97/100/101) remain logged in `.planning/phases/125-chat-ui/deferred-items.md` — they predate this phase, are in files NOT touched here, and do not affect the chat suite (fully green). Not fixed per the scope boundary.

## Issues Encountered
None — the interfaces matched the codebase (`getCurrentEstimate(supabase, projectId)` signature as the plan stated; `useJobStatus` discriminated states; the capture primitives import cleanly).

## Known Stubs
None — both seams are now real wirings. The composer routes real audio/photo through `normalizeChatInput`; the estimate card polls the real job and links to the real editor. No placeholder data paths remain in the chat surface.

## User Setup Required
None — no migration, no new dependency, no new secret.

## Next Phase Readiness
- v1 in-app chat (v4.9) is feature-complete and UI-only: the owner can type/speak/photograph a job and get a real estimate they open in the existing editor. CHATUI-01..04 all shipped across Plans 01–02.
- The Phase-124 backend (`app/api/chat/route.ts` + `lib/chat/tools.ts`) stayed untouched (scope-fence test green). The forced channel-neutral `lib/agent-tools` extraction is now consumed by WhatsApp + chat, ready for the later MCP channel.

---
*Phase: 125-chat-ui*
*Completed: 2026-06-25*

## Self-Check: PASSED
- Created files verified on disk: `components/chat/chat-composer.tsx`, `components/chat/estimate-card.tsx`.
- Both task commits verified in git history: `a13b15a4`, `50df976a`.
- Static gates verified: `resolveCurrentEstimateId` present in `lib/actions/chat.ts`; `tab=estimate&estimate=` href present in estimate-card; `EstimateCard` wired in chat-tool-part; `ChatComposer` wired in chat-thread; zero `sendMessage({files})` (no raw-file send — Pitfall 4).
