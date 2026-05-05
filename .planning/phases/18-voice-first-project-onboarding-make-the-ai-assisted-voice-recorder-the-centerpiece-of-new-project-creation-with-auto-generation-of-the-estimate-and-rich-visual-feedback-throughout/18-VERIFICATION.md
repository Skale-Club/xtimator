---
phase: 18-voice-first-project-onboarding
verified: 2026-05-05T00:00:00Z
status: passed
score: 9/9 must-haves verified
---

# Phase 18: Voice-First Project Onboarding — Verification Report

**Phase Goal:** A user can create a project, immediately land on a full-screen voice recorder, describe the job by voice, and arrive at the estimate editor with a populated AI-generated draft — without manually navigating through tabs or pressing a "Generate" button.
**Verified:** 2026-05-05
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | P18-01: Wizard reduced to 1 step — client only; name/type/budget fields removed | VERIFIED | `lib/schemas/project.ts` has only `clientId`+`clientName`; `STEP_FIELDS: {1: ['clientId']}`; `NewProjectWizard` renders single `StepClientSelect` with "Continue to recorder" button; no multi-step imports |
| 2 | P18-02: `/projects/[id]/capture` renders full-screen without sidebar/topbar | VERIFIED | `app/(capture)/layout.tsx` has `fixed inset-0 z-50`; no `Sidebar`, `Topbar`, `BottomNav`, `MobileHeader` imports; `CaptureRecorder` renders `data-testid="capture-screen"` |
| 3 | P18-03: 10-min hard cap + auto-stop via wall-clock baseline | VERIFIED | `HARD_CAP_MS = 10 * 60 * 1000`; `performance.now()` baseline in `tick()`; auto-stop at `elapsed >= HARD_CAP_MS`; `visibilitychange` fires tick on tab return |
| 4 | P18-04: 60s warning toast + color escalation (neutral → amber → red) | VERIFIED | `WARN_AT_MS = 9*60*1000`; `AMBER_AT_MS = 8*60*1000`; `RED_AT_MS = 9.5*60*1000`; `toast.warning('60 seconds remaining')` fires once via `warnedRef` latch; `stroke-primary`/`stroke-amber-500`/`stroke-red-500` on ring; `text-primary`/`text-amber-500`/`text-red-500` on timer |
| 5 | P18-05: 4-stage stepper with labels "Saving recording", "Transcribing", "Analyzing", "Generating estimate" | VERIFIED | `STAGE_LABELS` in `capture-stepper.tsx` has all 4 exact labels; `data-testid="capture-stepper"`; `Check`/`Loader2`/`AlertCircle`/dot icons per state |
| 6 | P18-06: Transcript revealed in stepper when transcription completes | VERIFIED | `transcript` prop drives `data-testid="capture-transcript"` block in `CaptureStepper`; `setTranscript(transcribed.data.transcript)` wired in pipeline before `setStage('analyzing')` |
| 7 | P18-07: Auto-fire generation + AI-suggested name + workspace redirect to estimate tab | VERIFIED | Pipeline: `runPipeline` fires from `MediaRecorder.onstop`; `router.push('/projects/${projectId}?tab=estimate&estimate=${data.estimateId}')`; `suggested_project_name` in `create_estimate` tool `required`; name-patcher uses `startsWith(PLACEHOLDER_PREFIX)` guard; `ProjectWorkspace` uses controlled `<Tabs value={activeTab}>` driven by `useSearchParams().get('tab')`; `app/(app)/projects/[id]/page.tsx` forwards `defaultTab` from `searchParams.tab` |
| 8 | P18-08: "Skip recording" escape hatch routes to `/projects/[id]` | VERIFIED | `data-testid="skip-recording"` button visible at `stage === 'idle' && !isRecording && !audioBlob`; `<Link href={/projects/${projectId}}>` |
| 9 | P18-09: Mobile layout with mic in bottom third; timer readable at small viewports | VERIFIED | `flex-1 flex flex-col items-center justify-end pb-[20vh] sm:pb-[15vh]` positions mic in bottom portion; `text-6xl sm:text-7xl` on timer; `data-testid="capture-timer"` for e2e assertion |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Status | Evidence |
|----------|--------|----------|
| `lib/schemas/project.ts` | VERIFIED | Only `clientId` + `clientName`; no name/projectType/targetBudget keys |
| `lib/actions/project.ts` | VERIFIED | `PLACEHOLDER_PREFIX = 'Untitled project — '` exported; `createProjectAction` uses placeholder name + `status='draft'` |
| `components/projects/new-project-wizard.tsx` | VERIFIED | Single step; `router.push('/projects/${result.data.id}/capture')`; no multi-step component imports |
| `app/(capture)/layout.tsx` | VERIFIED | `fixed inset-0 z-50 bg-background flex flex-col`; no shell imports |
| `app/(capture)/projects/[id]/capture/page.tsx` | VERIFIED | Server page; `getProjectById` + `notFound()` guard; passes project + companyId to `<CaptureClient />` |
| `app/(capture)/projects/[id]/capture/capture-client.tsx` | VERIFIED | Thin wrapper; renders `<CaptureRecorder project={project} companyId={companyId} projectId={project.id} />`; no placeholder text |
| `components/capture/circular-progress-ring.tsx` | VERIFIED | SVG ring with `stroke-dasharray={circumference}` + `strokeDashoffset`; `colorClass` prop; children slot |
| `components/capture/capture-timer.tsx` | VERIFIED | `AMBER_AT_MS = 8*60*1000`; `RED_AT_MS = 9.5*60*1000`; `formatDuration`; `data-testid="capture-timer"` |
| `components/capture/capture-stepper.tsx` | VERIFIED | All 4 stage labels; `data-testid="capture-transcript"` block; `STAGES`/`STAGE_LABELS` exported |
| `components/capture/capture-failure.tsx` | VERIFIED | `retriesUsed < 2` guard; Retry + Edit manually buttons; `data-testid` attributes |
| `components/capture/capture-recorder.tsx` | VERIFIED | All constants; wall-clock tick; `visibilitychange` + `beforeunload` guards; pipeline with D-13 ordering; D-15 empty-transcript message verbatim; AbortController; `data-testid="capture-mic"` + `data-testid="skip-recording"` |
| `components/workspace/audio/waveform-visualizer.tsx` | VERIFIED | `ResizeObserver` present; dynamic `width`; `barCount = Math.max(48, Math.floor(width / 6))` |
| `components/workspace/project-workspace.tsx` | VERIFIED | Controlled `<Tabs value={activeTab} onValueChange={handleValueChange}>`; `useSearchParams`; `router.replace`; `ALLOWED_TABS` whitelist |
| `app/(app)/projects/[id]/page.tsx` | VERIFIED | `searchParams` accepted; `defaultTab` derived from `rawTab` with whitelist; forwarded to `<ProjectWorkspace />` |
| `app/api/generate-estimate/route.ts` | VERIFIED | `suggested_project_name` in `required` array + `properties`; system prompt includes instruction; name-patcher with `startsWith(PLACEHOLDER_PREFIX)` guard; `revalidatePath('/projects/${projectId}')` + `revalidatePath('/', 'layout')` |
| `supabase/migrations/20260505000001_phase18_cleanup_cron.sql` | VERIFIED | `CREATE EXTENSION IF NOT EXISTS pg_cron`; `cleanup_orphan_draft_projects()` function; `INTERVAL '24 hours'`; `0 3 * * *` schedule; `DO $do$` idempotency guard |
| `app/api/cron/cleanup-orphan-projects/route.ts` | VERIFIED | `CRON_SECRET` bearer gate; 503 on missing secret, 401 on invalid; delegates to `cleanup_orphan_draft_projects` RPC |
| `vercel.json` | VERIFIED | `"crons": [{ "path": "/api/cron/cleanup-orphan-projects", "schedule": "0 3 * * *" }]` |
| `components/app-shell/sidebar.tsx` | VERIFIED | `data-testid="app-sidebar"` on root `<aside>` |
| `components/app-shell/topbar.tsx` | VERIFIED | `data-testid="app-topbar"` on root `<header>` |
| `components/app-shell/bottom-nav.tsx` | VERIFIED | `data-testid="bottom-nav"` on root `<nav>` |
| `components/app-shell/mobile-header.tsx` | VERIFIED | `data-testid="mobile-header"` on root `<header>` |

---

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `new-project-wizard.tsx` | `lib/actions/project.ts` | `createProjectAction({clientId, clientName}) → router.push('/projects/${id}/capture')` | WIRED — `router.push` at line 53; action imported and called |
| `capture-client.tsx` | `capture-recorder.tsx` | `<CaptureRecorder project={...} companyId={...} projectId={...} />` | WIRED |
| `capture-recorder.tsx` | `lib/actions/recording.ts` | `createRecording(projectId, storagePath, duration)` then `transcribeRecording(id)` | WIRED — lines 165, 170 |
| `capture-recorder.tsx` | Supabase Storage 'audio' bucket | `supabase.storage.from('audio').upload(storagePath, blob, {...})` | WIRED — line 160 |
| `capture-recorder.tsx` | `/api/generate-estimate` | `fetch('/api/generate-estimate', { method: 'POST', body: JSON.stringify({ projectId }), signal })` | WIRED — line 181 |
| `capture-recorder.tsx` | `next/navigation router.push` | `router.push('/projects/${projectId}?tab=estimate&estimate=${data.estimateId}')` | WIRED — line 195 |
| `app/api/generate-estimate/route.ts` | `lib/actions/project.ts` | `import { PLACEHOLDER_PREFIX } from '@/lib/actions/project'` | WIRED — line 8 |
| `app/api/generate-estimate/route.ts` | projects table | `supabase.from('projects').update({ name: aiEstimate.suggested_project_name.trim() }).eq('id', projectId)` | WIRED — lines 266–269 |
| `project-workspace.tsx` | `useSearchParams` | `useSearchParams().get('tab')` drives `activeTab` state + `useEffect` syncs | WIRED |
| `app/(app)/projects/[id]/page.tsx` | `project-workspace.tsx` | `searchParams.tab → defaultTab → <ProjectWorkspace defaultTab={defaultTab}>` | WIRED |
| `app/api/cron/cleanup-orphan-projects/route.ts` | `CRON_SECRET` env | Bearer header check — 503 if missing, 401 if wrong | WIRED |
| `supabase/migrations/20260505000001_phase18_cleanup_cron.sql` | projects + recordings + estimates tables | DELETE WHERE status='draft' AND created_at < NOW()-24h AND NOT EXISTS recordings AND NOT EXISTS estimates | WIRED |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `capture-recorder.tsx` | `stage`, `transcript` | `runPipeline(blob)` → real server actions (`createRecording`, `transcribeRecording`) → real fetch to `/api/generate-estimate` | Yes — calls real DB-backed actions | FLOWING |
| `capture-stepper.tsx` | `transcript`, `currentStage`, `failedAt` | Props from `CaptureRecorder` state | Yes — driven by real pipeline state | FLOWING |
| `project-workspace.tsx` | `activeTab` | `useSearchParams().get('tab')` from router.push in capture-recorder | Yes — set by real navigation event | FLOWING |
| `app/api/generate-estimate/route.ts` | `aiEstimate.suggested_project_name` | Anthropic `messages.create` tool_use response | Yes — required in schema; patcher checks DB before updating | FLOWING |
| `app/api/cron/cleanup-orphan-projects/route.ts` | `deleted_count` | `supabase.rpc('cleanup_orphan_draft_projects')` | Yes — SQL function queries real projects/recordings/estimates tables | FLOWING |

---

### D-13 Stage-Transition Split-Panel Timing

**awk ordering check result:**
```
analyzing@179  fetch@181  generating@192  router.push@317
```
Order: `setStage('analyzing')` < `fetch(...)` < `setStage('generating')` < `router.push` — PASS

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — requires running server + real browser mic permission + Anthropic/Whisper API keys. All behavioral paths verified statically (code reads, grep). Manual UAT items documented in 18-VALIDATION.md.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| P18-01 | 18-01 | Wizard reduced to 1 step; name/type/budget removed | SATISFIED | `lib/schemas/project.ts`: only clientId+clientName; wizard renders single StepClientSelect |
| P18-02 | 18-01, 18-02 | Full-screen capture route with no sidebar/topbar | SATISFIED | `(capture)/layout.tsx` has `fixed inset-0 z-50`; no shell component imports |
| P18-03 | 18-02 | 10-min hard cap with wall-clock baseline, auto-stop toast | SATISFIED | `HARD_CAP_MS = 600000`; `performance.now()` baseline; auto-stop logic in `tick()` |
| P18-04 | 18-02 | 60s warning + color escalation neutral→amber→red | SATISFIED | `WARN_AT_MS`, `AMBER_AT_MS`, `RED_AT_MS` constants; `warnedRef` latch for once-only toast; ring + timer color classes |
| P18-05 | 18-02 | 4-stage stepper with animated states and named stages | SATISFIED | `STAGE_LABELS` with all 4 labels; Check/Loader2/AlertCircle icons; `data-testid` attributes |
| P18-06 | 18-02 | Transcript revealed in stepper after transcription | SATISFIED | `setTranscript()` in pipeline; `transcript` prop drives `data-testid="capture-transcript"` block |
| P18-07 | 18-02, 18-03 | Auto-fire generation + AI name + redirect to estimate tab | SATISFIED | Pipeline auto-fires from `onstop`; `suggested_project_name` required in tool schema; name patcher with placeholder guard; redirect to `?tab=estimate`; workspace Tabs controlled by `useSearchParams` |
| P18-08 | 18-01, 18-02 | Skip recording escape hatch | SATISFIED | `data-testid="skip-recording"` button; idle-only visibility guard (`stage === 'idle' && !isRecording && !audioBlob`) |
| P18-09 | 18-02 | Mobile-first layout: mic in bottom third, readable at all breakpoints | SATISFIED | `pb-[20vh] sm:pb-[15vh]`; `text-6xl sm:text-7xl`; e2e mobile tests assert `capture-mic` bounding box |
| D-03 | 18-03 | Orphan-draft cleanup cron | SATISFIED | pg_cron migration with `DO $do$` idempotency guard; Vercel fallback route with CRON_SECRET bearer auth; `vercel.json` registers cron |

**Note on REQUIREMENTS.md:** Phase 18 requirements (P18-01 through P18-09) are defined in ROADMAP.md's "Success Criteria" section, not in a separate REQUIREMENTS.md table. No orphaned requirements found — REQUIREMENTS.md does not reference Phase 18.

---

### Anti-Patterns Found

No blockers or warnings detected.

| File | Pattern | Severity | Assessment |
|------|---------|----------|-----------|
| `capture-recorder.tsx` line 274 | `const isIdle = stage === 'idle'` — declared but `showRecorderUI` used instead | Info | Dead variable (`isIdle` unused); harmless; not a stub |
| `lib/actions/project.ts` | `getAuthContext()` uses `.from('companies').select('id')` directly rather than `getCachedCompany` | Info | Pre-existing pattern from earlier phase; works correctly; no security issue |
| `capture-client.tsx` | Thin wrapper passing `projectId={project.id}` as separate prop while `project` already contains `id` | Info | Minor redundancy; intentional for explicit prop passing; not a stub |

---

### Human Verification Required

The following items require manual testing and cannot be verified programmatically:

**1. Tab-Background 10-Minute Duration Cap**
- **Test:** Start a recording on `/projects/[id]/capture`. Background the tab for 30–60 seconds. Return to it.
- **Expected:** Timer resumes correctly from actual wall-clock elapsed time (not frozen at background-time value). Auto-stop fires at 10:00 total elapsed.
- **Why human:** Requires real browser environment; background tab throttling behavior varies by browser/OS.

**2. iOS Safari AudioContext + Permission Revoke**
- **Test:** On a real iPhone, tap the mic button. When the browser asks for permission, grant it, then start recording. Then go to iOS Settings and revoke microphone permission for the browser while recording.
- **Expected:** Toast "Microphone permission was revoked" appears and recording stops gracefully.
- **Why human:** Requires physical iOS device; `mute`/`inactive` track events are iOS-specific behavior.

**3. Full Voice-First Pipeline End-to-End**
- **Test:** Create a new project, record a ~30s description of a real job, let auto-fire pipeline complete.
- **Expected:** Redirected to `/projects/[id]?tab=estimate`; Estimate tab is active; populated sections/items visible; project name updated from "Untitled project — [date]" to AI-suggested name.
- **Why human:** Requires real Anthropic API key + real Whisper API key; cannot stub in CI without dedicated environment.

**4. Android Chrome Full-Screen Escape Verification**
- **Test:** Visit `/projects/[id]/capture` on an Android Chrome browser (real device or emulated).
- **Expected:** No app shell elements (sidebar, bottom nav, mobile header) visible; mic button in lower half of screen; timer readable.
- **Why human:** Playwright mobile emulation covers viewport sizing but not all Android WebView rendering quirks.

---

### Gaps Summary

No gaps. All 9 ROADMAP success criteria (P18-01 through P18-09) and the orphan-cleanup requirement (D-03) are fully implemented, wired, and substantive. The codebase matches the plans exactly, with no stubs, orphaned artifacts, or broken wiring detected. The 4 human verification items above are expected manual UAT tasks documented in 18-VALIDATION.md — they are not gaps, as the underlying code is correctly implemented.

---

_Verified: 2026-05-05_
_Verifier: Claude (gsd-verifier)_
