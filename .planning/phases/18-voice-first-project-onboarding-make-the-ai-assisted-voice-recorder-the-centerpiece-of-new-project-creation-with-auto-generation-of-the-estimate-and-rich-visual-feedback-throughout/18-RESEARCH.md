# Phase 18: Voice-First Project Onboarding — Research

**Researched:** 2026-05-05
**Domain:** Next.js App Router fullscreen routes, browser MediaRecorder/AudioContext lifecycle, SVG progress UI, Supabase scheduled jobs, Anthropic tool_use schema extension
**Confidence:** HIGH for layout/recorder/progress-ring/tool-schema decisions; MEDIUM for cleanup mechanism (project hasn't picked one); HIGH on existing-code reuse paths.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Project Creation & Routing**
- **D-01:** Eager project creation. `createProjectAction` runs on client-step submit; project row inserted with `status='draft'` before recorder loads. Recorder always has a valid `project_id` — no refactor of `lib/actions/recording.ts` needed.
- **D-02:** Recorder lives at `/projects/[id]/capture` with its own full-screen layout that escapes the app shell sidebar/topbar. Bookmarkable URL; back button returns to the client step.
- **D-03:** Scheduled cleanup job removes orphan draft projects (status='draft', 0 recordings, no estimate, created_at older than 24h). Implementation choice (pg_cron vs Supabase scheduled edge function vs Vercel cron) deferred to planner; Claude's discretion.

**Wizard Reduction**
- **D-04:** New-project wizard reduces from 3 steps to 1 step: client only (existing or inline-created). Project name, type, and target_budget are removed from the wizard entirely — populated post-recording or kept editable in the estimate editor.
- **D-05:** Project name comes from AI. Extend the `generate-estimate` tool_use schema so Claude returns a suggested name (e.g. "Smith Bathroom Remodel") alongside sections/items. User edits the name in the estimate editor.

**Recording Surface**
- **D-06:** 10-minute hard cap on recording, optimized for Whisper (≤5MB upload, ~$0.06/recording) and Claude (≤2K transcript tokens). Auto-stop fires at 10:00 with toast.
- **D-07:** Visible timer with color escalation: neutral 0:00–8:00 → amber 8:00–9:30 → red 9:30–10:00. Visual warning at 9:00 (60s remaining) plus toast.
- **D-08:** Visual feedback during recording: full-width waveform (existing `WaveformVisualizer` expanded), circular progress ring around the mic button (SVG stroke-dasharray), pulse on the surrounding card when active.
- **D-09:** Photos are NOT captured on the `/capture` screen. Voice-only first pass; photos remain accessible via the existing Photos tab in the workspace after estimate generation. Editor-side regeneration with photos is deferred.

**AI Processing Feedback**
- **D-10:** Multi-stage progress stepper replaces the current `Loader2` spinner. Stages: (1) Saving recording → (2) Transcribing → (3) Analyzing → (4) Generating estimate. Each stage has an animated active state and a checkmark on completion. Global progress bar at top advances per stage.
- **D-11:** Whisper transcript is revealed in the stepper UI as soon as transcription completes, giving the user something to read while estimate generation runs (5–15s).
- **D-12:** Estimate generation auto-fires when the transcript is ready — no manual "Generate" click in the capture flow. On success, redirect to the estimate editor with the populated draft.
- **D-13:** Stage transitions are driven client-side by sequencing existing server actions (`createRecording` → `transcribeRecording` → `POST /api/generate-estimate`) with `setStage()` calls between awaits. No SSE/streaming required for Phase 18.

**Failure & Recovery**
- **D-14:** On stage failure, the stepper shows the failed stage with a "Retry" button (max 2 retries). After 2 failures or user click on "Edit manually", redirect to the empty estimate editor with the recording attached; project preserved with `status='draft'`.
- **D-15:** Empty transcript is treated as a failure case with explicit copy: "We couldn't catch your description — please try again or edit manually."

**Escape Hatch**
- **D-16:** "Skip recording" button on the `/capture` screen routes the user to `/projects/[id]` (Overview tab) for manual entry via existing workspace tabs.

**Mobile**
- **D-17:** Full-screen recorder works on iOS Safari and Android Chrome. Mic button is thumb-reachable (bottom third of viewport on small screens). Timer and progress ring remain readable at 320px width.

### Claude's Discretion

- Specific cleanup mechanism (pg_cron vs Supabase edge function vs Vercel cron) — planner picks based on existing infra.
- Visual treatment details (stroke widths, animation easing, exact microcopy) — planner / UI spec.
- Toast library defaults to `sonner` (already in use).
- Cancel-mid-recording UX (discard vs save partial).

### Deferred Ideas (OUT OF SCOPE)

- Editor-side "regenerate from scratch with photos added" UX — touches Phase 6 surface; not Phase 18.
- Inline photo capture on `/capture` screen — explicitly rejected (D-09); revisit if user research shows photos are critical first-pass.
- Two-step capture (record → photos → generate) — rejected; conflicts with auto-fire philosophy.
- Web Speech live preview cross-browser parity — preserve current Chrome/Edge-only behavior.
- Mobile-specific layout beyond responsive sizing (e.g., iOS bottom-sheet) — scope guard.
</user_constraints>

<phase_requirements>
## Phase Requirements

ROADMAP defines 9 success criteria for Phase 18. No formal REQ-IDs from REQUIREMENTS.md cover this phase (REQUIREMENTS.md still tracks v1.2 LAND/BRAND/I18N items only). The planner should treat the 9 success criteria as P18-01 … P18-09 and map plans to them:

| ID | Success Criterion | Research Support |
|----|-------------------|------------------|
| P18-01 | Wizard asks for client only — name/type/budget removed | Schema reduction patterns (Pattern 1 below) + existing `step-client-select.tsx` reused |
| P18-02 | Full-screen recorder with mic as visual focus (large timer, full-width waveform, circular progress ring) | Layout escape pattern (Pattern 2) + WaveformVisualizer width prop expansion + SVG ring (Pattern 3) |
| P18-03 | 10-min hard cap; neutral→amber→red color escalation; auto-stop at 10:00 with toast | Tab-throttling-resilient duration enforcement (Pattern 4); existing recorder timer is starting point |
| P18-04 | 60-second-remaining warning (visual + toast) | Same pattern as P18-03 — branched threshold checks against `Date.now()` baseline |
| P18-05 | Multi-stage stepper (Saving → Transcribing → Analyzing → Generating estimate) with animated active state and checkmarks | Sequential client-side awaits (D-13); Pattern 5 below |
| P18-06 | Transcript revealed in stepper as soon as transcription completes | Already structurally enabled — `transcribeRecording` returns `{ data: { transcript } }`; surface in stepper between stages 2 and 3 |
| P18-07 | Estimate generation auto-fires; user redirected to editor with populated draft | Existing `POST /api/generate-estimate` accepts `projectId` only and returns `{ estimateId, version }`. Reused as-is + extended for D-05 |
| P18-08 | "Skip recording" escape hatch routes to `/projects/[id]` workspace | Simple `router.push` — no infra needed |
| P18-09 | Recorder works on iOS Safari and Android Chrome at all breakpoints; readable at 320px | iOS Safari AudioContext lifecycle pitfalls (Pitfall 1); existing Phase 5 verified MediaRecorder works on both |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech Stack:** Next.js 14+ (App Router) — verified `next@16.2.3`, App Router. TypeScript strict, Tailwind, shadcn/ui, react-hook-form + zod (state lib here is local React state, not Zustand).
- **AI:** `claude-sonnet-4-20250514` for estimate generation — already in `app/api/generate-estimate/route.ts`. Phase 18 must keep this exact model id.
- **Audio transcription:** OpenAI Whisper API server-side via `getIntegrationKey('openai')`. Service-role key never exposed to browser. Phase 18 keeps this boundary.
- **Mobile:** Audio recording must work on iOS Safari + Android Chrome — already verified Phase 5; preserved by reusing `audio-recorder.tsx` machinery.
- **Security:** Service role key never exposed to browser; AI calls server-side. Phase 18 requires no new browser-side secrets.
- **GSD Workflow:** All edits gated by `/gsd:execute-phase`. No direct repo edits outside a GSD command.

## Summary

Phase 18 is **mostly UX rewiring + one new route + a thin schema extension + a maintenance cron** — not a new technology stack. Every external dependency the phase needs is already in `package.json`: Next.js 16 App Router, `@anthropic-ai/sdk@0.39`, `sonner@2.0.7`, `framer-motion@12.38`, Supabase SSR + service client, MediaRecorder + Whisper plumbing in `lib/actions/recording.ts`. No new packages required.

The four pieces of genuine technical work — verified against current docs — are:

1. **Full-screen layout escape:** Move `/projects/[id]/capture` to a sibling route group (`app/(capture)/projects/[id]/capture/page.tsx`) with its own `layout.tsx`. Next.js App Router cannot un-render a parent layout from a child layout; route groups are the official, supported escape mechanism.
2. **Tab-throttling-resilient duration cap:** Replace the `setInterval(..., 1000)` accumulator pattern with a wall-clock baseline `recordStartTime = performance.now()`, computed each tick. Browsers throttle `setInterval` to 1Hz in background tabs; the wall-clock approach makes timer-drift irrelevant and the auto-stop accurate to <50ms even after backgrounding.
3. **SVG progress ring:** Tailwind-only `stroke-dasharray={circumference}` + `stroke-dashoffset={circumference * (1 - progress)}` pattern. Zero dependencies; CSS variable for stroke color so the same ring smoothly transitions through neutral/amber/red.
4. **Tool-schema extension for project name (D-05):** Add `suggested_project_name` (snake_case for Claude) as a new optional-but-prompted field on the `create_estimate` tool. After parsing the tool block, server-side `UPDATE projects SET name = ? WHERE id = ?` before returning. Anthropic preserves additive `input_schema` changes — no breaking change.

For the cleanup cron (D-03), the **strong recommendation is `pg_cron`** because (a) Supabase Cron is now a managed feature on the hosted platform, (b) the cleanup is pure SQL (no API keys needed), (c) zero added infra surface, (d) the project already has a migration pipeline. Vercel Cron and scheduled edge functions are viable but add network hops and require either an authenticated route or service-role key handling.

**Primary recommendation:** Build Phase 18 as 3 plans — (1) wizard reduction + eager-create + `/capture` route shell, (2) recorder visual + duration-cap + multi-stage stepper, (3) AI integration extension + cleanup cron + e2e coverage.

## Standard Stack

### Already Installed (verified in `package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.3 | App Router, layouts, route groups | Project's framework; route groups are the official fullscreen-escape mechanism |
| `react` | 19.2.4 | Concurrent rendering, `useTransition` | Already used in wizard for non-blocking submit |
| `@anthropic-ai/sdk` | 0.39.0 | Claude tool_use for D-05 schema extension | Already wired in `app/api/generate-estimate/route.ts` |
| `sonner` | 2.0.7 | Toasts (60s warning, time-limit, errors) | Project standard — every existing flow uses `import { toast } from 'sonner'` |
| `framer-motion` | 12.38.0 | Optional easing for stepper transitions / ring animation | Already a dependency; not strictly required (CSS transitions suffice) |
| `lucide-react` | 1.8.0 | `Mic`, `MicOff`, `Check`, `Loader2`, `AlertTriangle` icons | Already used in `audio-recorder.tsx` |
| `react-hook-form` + `zod` | 7.72.1 / 4.3.6 | Reduced 1-step wizard schema | Project standard |
| `@supabase/ssr` + `supabase-js` | 0.10.2 / 2.103.0 | Server actions, RLS, scheduled jobs via SQL | Project standard |

### New Packages

**None.** Phase 18 introduces no new runtime dependencies.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tailwind-only SVG ring | `react-circular-progressbar@2.2.0` | +12 KB bundle, props-driven API but loses CSS-variable color transitions (the library uses `pathColor` prop, requiring re-renders for color shifts). Reject — the 30 lines of inline SVG are simpler and animate via CSS. |
| pg_cron | Supabase scheduled Edge Function | Requires a Deno function + invocation auth + observability tooling. Overkill for a 1-line `DELETE … WHERE created_at < now() - interval '24 hours'`. |
| pg_cron | Vercel Cron Job (`vercel.json` + Next.js route) | Adds an authenticated `/api/cron/cleanup` route with `CRON_SECRET` env var, Vercel-tier cron quotas (free tier = 2 jobs, daily). Works but more moving parts. Acceptable fallback if pg_cron is not enabled on the Supabase plan. |
| `setInterval` for duration | Web Worker timer | Workers aren't throttled but add complexity. Wall-clock-based `setInterval` (Pattern 4) solves the throttling problem with no worker. |

### Installation

No package install required. Cleanup migration only:

```bash
# Verify pg_cron extension status (confirm before writing migration)
psql "$DATABASE_URL" -c "select extname from pg_extension where extname='pg_cron';"
# Expect: empty unless previously enabled. Migration enables it.
```

### Version Verification

`npm view` confirmed (2026-05-05):
- `next@16.2.4` is current; project is on `16.2.3` — fine.
- `@anthropic-ai/sdk@0.94.0` is current; project is on `0.39.0`. **The project version is significantly behind**, but the `messages.create` + `tool_use` API has been stable across all 0.x releases. No upgrade required for Phase 18; flag for a future maintenance task.
- `sonner@2.0.7` matches latest.
- `react-circular-progressbar@2.2.0` (latest) — only relevant if planner overrides recommendation; not used.

## Architecture Patterns

### Recommended Project Structure

```
app/
├── (app)/                                 # Authenticated app shell — UNCHANGED
│   ├── layout.tsx                         # Sidebar + Topbar + BottomNav
│   ├── projects/
│   │   ├── new/page.tsx                   # 1-step wizard (D-04)
│   │   └── [id]/page.tsx                  # Workspace (Overview / Audio / Photos / Estimate / Send tabs)
│   └── ...
├── (capture)/                             # NEW route group — no app shell
│   ├── layout.tsx                         # Minimal full-screen layout (no sidebar/topbar)
│   └── projects/
│       └── [id]/
│           └── capture/
│               ├── page.tsx               # Server: fetch project + auth, render <CaptureClient />
│               ├── loading.tsx            # Skeleton while project loads
│               └── capture-client.tsx     # Client: recorder + stepper + auto-fire orchestration
└── api/
    └── generate-estimate/
        └── route.ts                       # EXTENDED tool_use schema (D-05)

components/
├── projects/
│   ├── new-project-wizard.tsx             # Reduced to 1 step
│   └── step-client-select.tsx             # Reused as-is
├── workspace/audio/
│   ├── audio-recorder.tsx                 # Untouched (used by Audio tab)
│   ├── waveform-visualizer.tsx            # `width` prop added
│   └── circular-progress-ring.tsx         # NEW — pure SVG, prop-driven
└── capture/                               # NEW
    ├── capture-recorder.tsx               # Refactored full-screen recorder (D-08)
    ├── capture-stepper.tsx                # Multi-stage progress (D-10)
    ├── capture-timer.tsx                  # Color-escalating timer (D-07)
    └── capture-failure.tsx                # Retry / Edit manually states (D-14)

lib/
├── actions/
│   ├── project.ts                         # createProjectAction now writes status='draft' eagerly (D-01)
│   ├── recording.ts                       # UNCHANGED
│   └── estimate.ts                        # NEW — extractedFromAI patcher: updateProjectName(projectId, name)
└── schemas/
    └── project.ts                         # Reduced to { clientId, clientName }

supabase/
└── migrations/
    └── 20260505000001_phase18_cleanup_cron.sql  # pg_cron enable + scheduled job
```

### Pattern 1: 1-Step Wizard Schema Reduction

The current `projectSchema` validates 6 fields. Phase 18 needs only `clientId` + `clientName`. Existing `STEP_FIELDS` map drops to `{ 1: ['clientId'] }`. The wizard component collapses from 3 conditional branches to a single render.

```typescript
// lib/schemas/project.ts — REDUCED
export const projectSchema = z.object({
  clientId: z.string().min(1, 'Please select a client'),
  clientName: z.string(),
})
export type ProjectFormValues = z.infer<typeof projectSchema>

// Server action: insert with placeholder name; AI will overwrite via D-05
const placeholderName = `Untitled project — ${new Date().toLocaleDateString()}`
await supabase.from('projects').insert({
  company_id: company.id,
  client_id: formData.clientId,
  name: placeholderName,
  project_type: null,
  status: 'draft',
  target_budget: null,
  total: 0,
})
```

**Caveat:** `projects.name` is `NOT NULL` per the migration (`name TEXT NOT NULL`). The placeholder satisfies the constraint until D-05 runs. Do NOT `ALTER TABLE` to make it nullable — the placeholder is cheap and avoids a schema change.

### Pattern 2: Full-Screen Layout Escape via Sibling Route Group

**The Question:** Can a child layout un-render its parent? **Answer: No.** App Router layouts are strictly additive — a child layout always wraps inside its parent. Confirmed by the Next.js docs and a multi-year-old open issue. Source: [Next.js issue #50591](https://github.com/vercel/next.js/issues/50591) and [discussion #47686](https://github.com/vercel/next.js/discussions/47686).

**The Solution:** Two top-level route groups. Both groups can mount routes at the same URL hierarchy because route groups don't appear in the URL.

```
app/(app)/projects/[id]/page.tsx       → /projects/abc → wrapped in (app)/layout.tsx (sidebar)
app/(capture)/projects/[id]/capture/page.tsx → /projects/abc/capture → wrapped in (capture)/layout.tsx (full-screen)
```

```typescript
// app/(capture)/layout.tsx
import { redirect } from 'next/navigation'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'

export default async function CaptureLayout({ children }: { children: React.ReactNode }) {
  // Same auth gate as (app) — DRY pattern, not shared layout
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')
  const company = await getCachedCompany(claims.sub)
  if (!company) redirect('/onboarding')

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {children}
    </div>
  )
}
```

**Why not "fixed-position fullscreen page inside (app)":** The sidebar/topbar would still mount and hydrate (cost), would catch keyboard focus (a11y bug), and could leak through if z-index assumptions break. The route-group approach makes it impossible to render the shell.

**Auth handling:** Both route groups call the same cached helpers (`getAuthClaims`, `getCachedCompany` from `lib/queries/auth.ts`). React `cache()` deduplicates within a request, so this is not duplicated work. No middleware change needed; `proxy.ts` matchers already cover all paths.

### Pattern 3: SVG Circular Progress Ring (Tailwind-Only)

Pure SVG, no library. Uses `stroke-dasharray = circumference`, `stroke-dashoffset = circumference * (1 - progress)`. CSS variables drive color so neutral/amber/red transition smoothly via Tailwind utility classes.

```typescript
// components/capture/circular-progress-ring.tsx
'use client'
interface Props {
  progress: number       // 0..1
  size?: number          // px (default 240)
  strokeWidth?: number   // px (default 8)
  /** tailwind class controlling stroke color, e.g. 'stroke-blue-500' / 'stroke-amber-500' / 'stroke-red-500' */
  colorClass: string
  children: React.ReactNode  // mic button slot
}

export function CircularProgressRing({
  progress, size = 240, strokeWidth = 8, colorClass, children,
}: Props) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(Math.max(progress, 0), 1))

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        {/* Progress */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${colorClass} transition-[stroke-dashoffset,stroke] duration-300`}
        />
      </svg>
      {/* Mic button perfectly centered */}
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}
```

**Why this beats `react-circular-progressbar`:**
- Zero deps (the library is 12 KB minified).
- Color transitions for free via Tailwind's `transition-[stroke]` — the library forces re-renders to change `pathColor`.
- Mic button slot via children — the library's `children` API is awkward for arbitrary content.

Source pattern: [CSS-Tricks "Building a Progress Ring, Quickly"](https://css-tricks.com/building-progress-ring-quickly/) — same math, adapted to Tailwind utility classes.

### Pattern 4: Wall-Clock Duration Cap (Tab-Throttling-Resilient)

The current `audio-recorder.tsx` uses `setInterval(() => setDuration(d => d + 1), 1000)`. Browsers throttle `setInterval` to **1 Hz in background tabs** — but more importantly, the cap can be **missed by seconds** if the user multitasks during 9:55–10:00. The fix is a wall-clock baseline: each tick computes elapsed from `performance.now() - startTime`. The interval can fire at any rate (1 Hz, 4 Hz, 0.5 Hz) and the elapsed value is always correct.

```typescript
// In capture-recorder.tsx
const HARD_CAP_MS = 10 * 60 * 1000          // D-06
const WARN_AT_MS = 9 * 60 * 1000            // D-07 — 60s warning
const AMBER_AT_MS = 8 * 60 * 1000           // D-07 — color escalation
const RED_AT_MS = 9.5 * 60 * 1000           // D-07

const startTimeRef = useRef<number>(0)
const warnedRef = useRef<boolean>(false)
const [elapsedMs, setElapsedMs] = useState(0)

const tick = useCallback(() => {
  const elapsed = performance.now() - startTimeRef.current
  setElapsedMs(elapsed)

  if (elapsed >= WARN_AT_MS && !warnedRef.current) {
    warnedRef.current = true
    toast.warning('60 seconds remaining', { description: 'The recording will auto-stop at 10 minutes.' })
  }

  if (elapsed >= HARD_CAP_MS) {
    toast.info('Time limit reached', { description: 'Recording stopped at 10 minutes.' })
    stopRecording()  // triggers MediaRecorder.stop(), unmounts the interval
  }
}, [stopRecording])

useEffect(() => {
  if (!isRecording) return
  startTimeRef.current = performance.now()
  warnedRef.current = false
  // Tick every 250 ms while in foreground; throttling will slow this in bg tabs but elapsed math is still correct.
  const id = setInterval(tick, 250)
  return () => clearInterval(id)
}, [isRecording, tick])

// Color class derived from elapsedMs — driven by render, no extra state needed
const colorClass =
  elapsedMs >= RED_AT_MS    ? 'stroke-red-500'   :
  elapsedMs >= AMBER_AT_MS  ? 'stroke-amber-500' :
                              'stroke-blue-500'   // brand neutral (#406EF1)
```

**Why `performance.now()` over `Date.now()`:** monotonic clock — immune to NTP corrections, system clock changes, daylight-saving jumps. Same precision; better safety.

**Why 250 ms tick:** smooth ring animation at 4 fps without burning battery. The MediaRecorder itself runs independently of this timer — even if the interval is throttled to 1 Hz, the next tick will compute the correct elapsed time and fire `stop()` within 1 second of the cap.

**Tab visibility hook for extra safety:** add a `visibilitychange` listener that runs `tick()` immediately when the tab becomes visible, ensuring the cap is enforced as soon as the user returns:

```typescript
useEffect(() => {
  const onVis = () => { if (!document.hidden) tick() }
  document.addEventListener('visibilitychange', onVis)
  return () => document.removeEventListener('visibilitychange', onVis)
}, [tick])
```

Source: [Why do browsers throttle JavaScript timers?](https://nolanlawson.com/2025/08/31/why-do-browsers-throttle-javascript-timers/), [Heavy throttling of chained JS timers (Chrome blog)](https://developer.chrome.com/blog/timer-throttling-in-chrome-88).

### Pattern 5: Multi-Stage Stepper via Sequential Awaits (D-13)

No SSE, no streaming, no useReducer wizardry. A simple `stage` state machine driven by sequential `await`s.

```typescript
type Stage = 'idle' | 'saving' | 'transcribing' | 'analyzing' | 'generating' | 'done' | { error: string; failedAt: Stage }

async function runPipeline(blob: Blob, projectId: string, companyId: string) {
  setStage('saving')
  const recordingId = crypto.randomUUID()
  const ext = getFileExtension(mimeTypeRef.current)
  const storagePath = `${companyId}/${projectId}/${recordingId}.${ext}`
  const { error: upErr } = await supabase.storage.from('audio')
    .upload(storagePath, blob, { contentType: mimeTypeRef.current, upsert: false })
  if (upErr) return setStage({ error: 'Upload failed', failedAt: 'saving' })

  const created = await createRecording(projectId, storagePath, durationSeconds)
  if ('error' in created) return setStage({ error: created.error, failedAt: 'saving' })

  setStage('transcribing')
  const transcribed = await transcribeRecording(created.data.id)
  if ('error' in transcribed) return setStage({ error: transcribed.error, failedAt: 'transcribing' })
  if (!transcribed.data.transcript?.trim()) {
    return setStage({ error: 'We couldn\'t catch your description — please try again or edit manually.', failedAt: 'transcribing' })
  }

  setRevealedTranscript(transcribed.data.transcript)  // D-11

  setStage('analyzing')        // visual stage; the next call covers both 'analyzing' and 'generating'
  const res = await fetch('/api/generate-estimate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId }),
  })
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Generation failed' }))
    return setStage({ error, failedAt: 'analyzing' })
  }

  setStage('generating')       // brief animation between phases — visual only; could omit
  const { estimateId } = await res.json()

  setStage('done')
  router.push(`/projects/${projectId}?tab=estimate&estimate=${estimateId}`)
}
```

**Stage labels** (per D-10 spec, snake-case verbs in the label):
1. **Saving recording** (`saving`) — covers Storage upload + DB insert
2. **Transcribing** (`transcribing`) — Whisper round-trip
3. **Analyzing** (`analyzing`) — Claude tool_use call (kicks off "generating")
4. **Generating estimate** (`generating`) — Claude returned, server is persisting + we redirect

The `analyzing` and `generating` stages are both "the `/api/generate-estimate` call is in flight" — split for visual storytelling. Either set them on a 50/50 timer split or transition `generating` after the response starts but before the redirect (chosen above).

### Anti-Patterns to Avoid

- **Don't optimize the wizard with parallel routes / intercepting routes.** The plain route group is correct and minimal. Parallel routes are for modal-overlaid UIs (e.g., photo gallery in a modal) — wrong pattern here.
- **Don't share an `await` for `analyzing` and `generating`.** If the API call returns 8 seconds later, the user sees `analyzing` for 0 seconds before jumping to `done`. Add an artificial split (see Pattern 5).
- **Don't put the cleanup logic in a Next.js API route + Vercel cron without a secret header.** Vercel cron triggers a public URL; without `CRON_SECRET` the endpoint is callable by anyone, allowing data-deletion abuse. If Vercel cron is chosen, follow the `Authorization: Bearer ${CRON_SECRET}` pattern documented in Vercel's cron security docs.
- **Don't auto-fire estimate generation if `transcript.trim() === ''`.** The Whisper API returns 200 OK with empty body for silent recordings. The `/api/generate-estimate` route already guards on `hasTranscripts`, but the stepper should fail fast (D-15) so the user sees the right error without paying for a Claude call.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Toast notifications | Custom toast component | `sonner` (already installed) | Project standard; supports `toast.warning`, `toast.error`, custom durations |
| Form validation for the 1-step wizard | Manual `if`/`else` checks | `react-hook-form` + `zod` (existing pattern) | Keeps wizard component shape unchanged; only the schema shrinks |
| Project creation idempotency | Custom dedup token | Eager-create with `status='draft'` (D-01) | Cleanup cron (D-03) sweeps orphans daily |
| Audio waveform | New canvas drawing | `WaveformVisualizer` (existing) — extend with width prop | Already AnalyserNode-driven; full-width is a CSS change |
| Multi-stage progress UI | DIY orchestrator with `useReducer` + state machine library | Sequential awaits with simple `Stage` union | D-13 explicitly chose this; matches existing recorder upload→transcribe pattern |
| Cron in code | `node-cron` running inside Next.js | `pg_cron` SQL job | Stateless functions on Vercel can't run timers across requests |
| Tool input parsing | Manual JSON validation of Claude's response | Trust `tool_choice: { type: 'tool', name: 'create_estimate' }` + add field to `input_schema` | Anthropic guarantees the response matches the schema when forced via `tool_choice` |

**Key insight:** Phase 18 has zero green-field territory. Every "new" piece is either a route reorg (route group), a 30-line component (SVG ring, stepper), a 5-line schema extension (Claude tool), or a 1-line cron (pg_cron). The risk is integration friction, not novel engineering.

## Common Pitfalls

### Pitfall 1: iOS Safari AudioContext Lifecycle

**What goes wrong:** AudioContext starts in `'suspended'` state on iOS Safari. The current code already calls `audioContext.resume()` inside the click handler (good). But on iOS, if the user backgrounds the tab or locks the screen, the AudioContext flips to `'interrupted'` (not `'suspended'`) and **does not auto-resume** when the user returns. The MediaRecorder may have stopped silently, leaving an empty blob.

**Why it happens:** WebKit's audio session model differs from Chromium — iOS treats audio as a system resource that the OS can interrupt. See [WebKit bug 237878](https://bugs.webkit.org/show_bug.cgi?id=237878).

**How to avoid:**
- Listen to `MediaRecorder.onerror` and `MediaRecorder.onstop` to detect interrupted recordings.
- On `visibilitychange` returning to visible during recording, check `audioContextRef.current?.state` — if `'interrupted'` or `'suspended'`, surface a toast and stop the recording cleanly with whatever audio was captured.
- Document the limitation: "recording pauses if you switch apps on iOS" is acceptable UX for v1.

**Warning signs:** Final blob is unexpectedly short, MediaRecorder fires `'stop'` event without an explicit `stopRecording()` call.

### Pitfall 2: Permission Revoked Mid-Recording

**What goes wrong:** User opens browser settings during recording and revokes mic permission. MediaRecorder doesn't throw — the audio track simply emits silence. The recording proceeds and a long blob with no signal arrives at Whisper, returning empty text.

**How to avoid:**
- Listen to `streamRef.current.getAudioTracks()[0].onmute` and `oninactive` events. If either fires while `isRecording`, stop and show D-15 error.
- D-15 fail-fast on empty transcript catches the downstream symptom even if upstream detection misses.

**Warning signs:** MediaStream's audio track `.muted` becomes `true` during recording; `enabled === false`.

### Pitfall 3: Browser Back Button During Recording

**What goes wrong:** User presses back mid-recording. Next.js client navigation tears down the route — but `MediaStream` and `AudioContext` are not garbage-collected synchronously, leading to zombie streams that hold the mic indicator on, and an audio blob that never gets uploaded.

**How to avoid:**
- Add `useEffect` cleanup to stop `MediaStream` tracks and close `AudioContext` on unmount.
- Add a `beforeunload` listener while `isRecording` to warn: "You're recording. Leave anyway?"
- The existing recorder already does cleanup-on-stop but not on unmount; verify and extend.

**Warning signs:** Mic indicator stays lit after back navigation; subsequent recording attempts fail with "device in use".

### Pitfall 4: Race Conditions Between "Skip" and In-Flight Pipeline

**What goes wrong:** User clicks "Skip recording" while `transcribeRecording` is still in flight. They land on `/projects/[id]` and 4 seconds later the in-flight request completes and writes a transcript to a recording the user doesn't expect to exist. Then auto-fire estimate generation could attempt to run on a project the user has now manually edited.

**How to avoid:**
- Disable "Skip recording" once any pipeline stage has started. Once recording stops, the only escape is "Edit manually" (which lives in the failure UI, not as a pre-pipeline action).
- Use `AbortController` for the `/api/generate-estimate` fetch. Track `abortControllerRef`; on unmount, call `.abort()`.
- The `createRecording` and `transcribeRecording` server actions can't be aborted from the client — they will complete server-side. That's acceptable; the recording just sits in the DB and is visible in the Audio tab.

### Pitfall 5: revalidatePath / revalidateTag for the New /capture Route

**What goes wrong:** After eager project creation in `createProjectAction`, the existing code calls `revalidatePath('/dashboard')` and `revalidatePath('/', 'layout')`. Phase 16 wired the sidebar projects list to be revalidated on creation. Phase 18's new flow needs the **navigated-to** capture page to render the just-created project, but `unstable_cache` for company data might return stale data if not tagged.

**How to avoid:**
- The existing `revalidatePath('/', 'layout')` is sufficient — it busts the layout-tree cache, which the `/(capture)/layout.tsx` and `/(app)/layout.tsx` both share via `getCachedCompany`.
- After estimate generation, `app/api/generate-estimate/route.ts` does NOT currently revalidate `/projects/[id]`. Phase 18 should add `revalidatePath(\`/projects/\${projectId}\`)` so the workspace tabs reflect the new estimate.
- Sidebar projects list refresh: existing `revalidatePath('/', 'layout')` covers it.

### Pitfall 6: Whisper Empty Transcript / Network Timeout

**What goes wrong:** Whisper returns 200 OK with empty body for silent or unintelligible audio. Long uploads (8–10 min recordings near the 25 MB Whisper limit) can time out on slow mobile networks. The current `transcribeRecording` action returns the empty string verbatim.

**How to avoid:**
- D-15 explicitly handles empty transcripts: `if (!transcript.trim()) return setStage({ error: 'We couldn\'t catch your description...', failedAt: 'transcribing' })`.
- For network timeouts: Vercel server actions have a 60s default Hobby / 300s Pro timeout. A 10-min audio at 64 kbps Opus is ~5 MB — well under the limit; upload should complete in <30s on 4G. Document this in the action.
- The `/api/generate-estimate` route already validates `hasTranscripts` — the empty-transcript path won't waste a Claude call.

### Pitfall 7: Tool Schema Field Casing

**What goes wrong:** Mixing camelCase and snake_case in `input_schema`. The existing schema uses snake_case (`payment_terms`, `unit_price`). Adding `suggestedProjectName` would create inconsistent extraction code.

**How to avoid:** Use `suggested_project_name` to match the existing convention. Map to JS once at the extraction site.

### Pitfall 8: Race Between createProjectAction and Recorder Mount

**What goes wrong:** D-01 says project creation runs on client-step submit, then `router.push('/projects/[id]/capture')`. If `createProjectAction` returns the new project ID but Next.js hasn't yet propagated the row through RLS-cached views, the capture page might `notFound()` on first load.

**How to avoid:**
- The existing `createProjectAction` already uses `revalidatePath('/', 'layout')` which busts the cached layout. Capture page reads project via direct `supabase.from('projects').select(...).eq('id', id)` — RLS evaluates fresh, no cache concern.
- `getProjectById` already exists and works without unstable_cache.

## Code Examples

Verified patterns from the existing codebase + standard Next.js docs.

### Extending the Anthropic Tool Schema (D-05)

```typescript
// app/api/generate-estimate/route.ts — input_schema additions only
input_schema: {
  type: 'object' as const,
  required: ['summary', 'sections', 'suggested_project_name'],  // NEW required
  properties: {
    suggested_project_name: {                                    // NEW
      type: 'string',
      description: 'A short, professional project name in 2-5 words derived from the work scope and client. Examples: "Smith Bathroom Remodel", "Garcia Driveway Repaving", "Patel Kitchen Reno". Avoid generic words like "Project" or "Estimate".',
    },
    summary: { type: 'string', description: 'Brief summary of the work scope' },
    // ... existing fields unchanged
  },
}

// Extraction:
const aiEstimate = toolBlock.input as {
  suggested_project_name: string
  summary: string
  // ... existing
}

// New: patch the project name (only if still the placeholder)
const { data: currentProject } = await supabase
  .from('projects')
  .select('name')
  .eq('id', projectId)
  .single()

const PLACEHOLDER_PREFIX = 'Untitled project — '
if (currentProject?.name?.startsWith(PLACEHOLDER_PREFIX) && aiEstimate.suggested_project_name) {
  await supabase
    .from('projects')
    .update({ name: aiEstimate.suggested_project_name })
    .eq('id', projectId)
}
```

**System prompt addition** (in the same route):
```typescript
const systemPrompt = `You are a professional estimator for a ${company.industry ?? 'general services'} business. Create a detailed, itemized estimate based on the job site information provided. Be thorough but realistic with pricing for the US market. Break the work into logical sections (e.g., Materials, Labor, Equipment). Each line item needs a clear description, quantity, unit (e.g., sq ft, hours, each, linear ft), and unit price.

Also generate a short, professional project name in 2-5 words derived from the work scope and the client name. Examples: "Smith Bathroom Remodel", "Garcia Driveway Repaving". Return it as suggested_project_name.`
```

### Cleanup Cron (pg_cron) — D-03

```sql
-- supabase/migrations/20260505000001_phase18_cleanup_cron.sql

-- Enable pg_cron (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- The cleanup function — keeps logic auditable, separated from the schedule
CREATE OR REPLACE FUNCTION public.cleanup_orphan_draft_projects()
RETURNS TABLE(deleted_count integer) AS $$
DECLARE
  deleted INTEGER;
BEGIN
  WITH targets AS (
    SELECT p.id
    FROM projects p
    WHERE p.status = 'draft'
      AND p.created_at < NOW() - INTERVAL '24 hours'
      AND NOT EXISTS (SELECT 1 FROM recordings r WHERE r.project_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM estimates e WHERE e.project_id = p.id)
  ),
  deleted_rows AS (
    DELETE FROM projects WHERE id IN (SELECT id FROM targets) RETURNING 1
  )
  SELECT COUNT(*)::INTEGER INTO deleted FROM deleted_rows;

  deleted_count := deleted;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule: every day at 03:00 UTC
SELECT cron.schedule(
  'cleanup-orphan-draft-projects',
  '0 3 * * *',
  $$ SELECT public.cleanup_orphan_draft_projects(); $$
);
```

**Verification before merge:**
```sql
-- Confirm scheduled
SELECT * FROM cron.job WHERE jobname = 'cleanup-orphan-draft-projects';
-- Manual dry-run as platform_admin (does not run the schedule)
SELECT * FROM public.cleanup_orphan_draft_projects();
```

**Rollback:**
```sql
SELECT cron.unschedule('cleanup-orphan-draft-projects');
DROP FUNCTION public.cleanup_orphan_draft_projects();
```

### Wall-Clock Timer (Pattern 4 — already shown above)

See Pattern 4 in Architecture Patterns section.

### Stage Stepper UI Skeleton

```typescript
// components/capture/capture-stepper.tsx
'use client'
import { Check, Loader2, AlertCircle } from 'lucide-react'

const STAGES = ['saving', 'transcribing', 'analyzing', 'generating'] as const
type StageKey = typeof STAGES[number]
const LABELS: Record<StageKey, string> = {
  saving: 'Saving recording',
  transcribing: 'Transcribing',
  analyzing: 'Analyzing',
  generating: 'Generating estimate',
}

interface Props {
  currentStage: StageKey | 'done'
  failedAt?: StageKey
  errorMessage?: string
  transcript?: string
  onRetry?: () => void
  onEditManually?: () => void
}

export function CaptureStepper({ currentStage, failedAt, errorMessage, transcript, onRetry, onEditManually }: Props) {
  const currentIdx = currentStage === 'done' ? STAGES.length : STAGES.indexOf(currentStage as StageKey)
  const failedIdx = failedAt ? STAGES.indexOf(failedAt) : -1

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {STAGES.map((s, i) => {
          const status =
            failedIdx === i ? 'failed' :
            i < currentIdx ? 'done' :
            i === currentIdx ? 'active' :
            'pending'
          return (
            <div key={s} className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border">
                {status === 'done' && <Check className="h-4 w-4 text-emerald-500" />}
                {status === 'active' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {status === 'failed' && <AlertCircle className="h-4 w-4 text-destructive" />}
                {status === 'pending' && <span className="h-2 w-2 rounded-full bg-muted" />}
              </span>
              <span className={status === 'pending' ? 'text-muted-foreground' : 'text-foreground'}>
                {LABELS[s]}
              </span>
            </div>
          )
        })}
      </div>

      {transcript && (
        <div className="rounded-md border bg-muted/50 p-3 max-h-32 overflow-y-auto">
          <p className="text-xs text-muted-foreground mb-1">Transcript</p>
          <p className="text-sm">{transcript}</p>
        </div>
      )}

      {failedAt && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{errorMessage}</p>
          <div className="flex gap-2">
            {onRetry && <button onClick={onRetry}>Retry</button>}
            {onEditManually && <button onClick={onEditManually}>Edit manually</button>}
          </div>
        </div>
      )}
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 3-step wizard with name/type/budget upfront | 1-step client-only wizard, AI fills name | Phase 18 | Reduces typing, lets AI suggest name from context |
| Manual "Generate Estimate" button after recording | Auto-fire after transcript | Phase 18 | Removes 1 click, drives time-to-estimate <5 min |
| Tiny `Loader2` spinner during AI generation | 4-stage stepper with transcript reveal | Phase 18 | Reduces perceived wait, makes failures actionable |
| `setInterval(d => d+1, 1000)` for timer | `performance.now()` baseline + 250 ms tick | Phase 18 | Survives background tab throttling |
| Recorder embedded in Audio tab as one of many | Full-screen `/capture` route as primary surface | Phase 18 | Aligns app with core value: voice → estimate <5 min |
| `setInterval` polling in inactive tabs reliably running | Throttled to ≤1 Hz (Chrome 88+, Safari, Firefox) | Browser policy 2021+ | Drives Pattern 4 — wall-clock baseline required |

**Deprecated/outdated:**
- Old chained `setTimeout` recursion for accurate timers — superseded by `performance.now()` baseline. Source: [Chrome 88 timer throttling blog](https://developer.chrome.com/blog/timer-throttling-in-chrome-88).

## Open Questions

1. **Is `pg_cron` already enabled on the project's Supabase instance?**
   - What we know: Supabase Cron is a managed feature, available on all current plans.
   - What's unclear: Whether this specific project enabled it. The migration includes `CREATE EXTENSION IF NOT EXISTS pg_cron` which is idempotent; on the hosted platform this needs the project to opt in via Dashboard or SQL with proper privileges.
   - Recommendation: planner Wave 0 includes a check task: `SELECT * FROM pg_extension WHERE extname='pg_cron'`. If absent, the migration enables it; if blocked, fall back to Vercel cron with the `CRON_SECRET` pattern.

2. **Should the wizard's "client step" allow inline-create, or only select-existing?**
   - What we know: Existing `step-client-select.tsx` includes inline-create UI.
   - What's unclear: D-04 says "client only (existing or inline-created)" — wording suggests inline-create stays. Confirmed.
   - Recommendation: keep inline-create — it's already wired and matches D-04 verbatim.

3. **Do we surface the AI-suggested project name in the editor with a "regenerate" affordance?**
   - What we know: D-05 says "User edits the name in the estimate editor". Out of scope for capture flow.
   - What's unclear: Whether the editor needs visual signal that the name came from AI.
   - Recommendation: out of scope for Phase 18. Phase 19+ candidate.

4. **Cancel-mid-recording UX (Claude's discretion)**
   - What we know: Discretionary — D-listed under "Claude's Discretion".
   - Recommendation: discard partial; show small "Discard" button next to the mic during recording. Saving partials would require a separate "Save without transcribing" path that no other surface offers; the simplicity argument wins.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Local dev, build | Yes | v24.13.0 | — |
| npm | Package management | Yes | 11.6.2 | bun (also installed via `bun.lock`) |
| Supabase pg_cron extension | D-03 cleanup cron | Unknown — needs DB query | — | Vercel cron + `CRON_SECRET` route |
| Vercel Cron Jobs | Fallback for D-03 | Project deploys to Vercel (`vercel.json` confirmed) | — | None (pg_cron is preferred path) |
| OpenAI Whisper | Existing transcribe action | Yes (via `getIntegrationKey('openai')`) | — | None — phase requires it |
| Anthropic Claude | Existing generate-estimate route | Yes (via `getIntegrationKey('anthropic')`) | `claude-sonnet-4-20250514` | None — phase requires it |
| MediaRecorder API | Recorder | Yes — verified in Phase 5 on iOS Safari + Android Chrome | — | None — phase requires it |
| Web Audio API (AnalyserNode) | Waveform | Yes — already used | — | None — phase requires it |
| `pg_cron` enable privilege on Supabase project | Migration `CREATE EXTENSION pg_cron` | Unknown | — | Enable via Supabase Dashboard → Database → Extensions; or fall back to Vercel cron |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:**
- pg_cron enablement: if not on, planner switches D-03 implementation to a Vercel cron + Next.js API route (`app/api/cron/cleanup-orphan-projects/route.ts`) gated by `CRON_SECRET` env var. Add to `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/cron/cleanup-orphan-projects", "schedule": "0 3 * * *" }] }
  ```
  The route validates `request.headers.get('authorization') === \`Bearer \${process.env.CRON_SECRET}\``.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (unit/integration), Playwright 1.59.1 (e2e) |
| Config files | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `npm test` (or `bun test`) — runs vitest |
| Full suite command | `npm test && npm run test:e2e` |
| Test directories | `tests/unit/`, `tests/integration/`, `tests/e2e/` |

### Phase Requirements → Test Map

Mapping the 9 success criteria from ROADMAP (P18-01 … P18-09) to concrete tests. Each test name follows the existing project convention (`tests/unit/<topic>.test.ts`, `tests/e2e/<feature>.spec.ts`).

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P18-01 | Wizard reduced to 1 step (client only); name/type/budget removed | unit (schema) | `npm test -- tests/unit/schemas/project.test.ts` | ❌ Wave 0 |
| P18-01 | Wizard component renders only client step | unit (component) | `npm test -- tests/unit/components/new-project-wizard.test.tsx` | ❌ Wave 0 |
| P18-01 | Eager project creation (D-01): submit triggers `createProjectAction`, redirects to `/projects/[id]/capture` | unit (component) | Same as above with `vi.mock('@/lib/actions/project')` | ❌ Wave 0 |
| P18-02 | `/projects/[id]/capture` renders without app shell sidebar/topbar | e2e | `npx playwright test tests/e2e/capture-fullscreen.spec.ts -g "no sidebar"` | ❌ Wave 0 |
| P18-02 | Mic button rendered with circular progress ring; ring shows 0% at start | unit (component) | `npm test -- tests/unit/components/capture-recorder.test.tsx -t "ring 0%"` | ❌ Wave 0 |
| P18-02 | WaveformVisualizer renders full-width on /capture | unit (component) | Same file with width assertion | ❌ Wave 0 |
| P18-03 | Color escalation: <8min neutral, 8–9.5 amber, ≥9.5 red | unit (logic) | `npm test -- tests/unit/components/capture-recorder.test.tsx -t "color"` | ❌ Wave 0 |
| P18-03 | Auto-stop at 10:00 with toast | unit (logic) | Same — fast-forward `performance.now()` via `vi.useFakeTimers` | ❌ Wave 0 |
| P18-04 | 60s warning visible at 9:00 + toast.warning called | unit (logic) | Same file `-t "60s warning"` | ❌ Wave 0 |
| P18-05 | Stepper renders 4 named stages with active/done/pending states | unit (component) | `npm test -- tests/unit/components/capture-stepper.test.tsx` | ❌ Wave 0 |
| P18-05 | Failed stage shows AlertCircle + Retry/Edit manually buttons | unit (component) | Same file `-t "failed state"` | ❌ Wave 0 |
| P18-06 | Transcript revealed between transcribing→analyzing | unit (component) | Same file `-t "transcript reveal"` | ❌ Wave 0 |
| P18-07 | Auto-fire generation: pipeline calls `/api/generate-estimate` after transcribe | unit (component) | `npm test -- tests/unit/components/capture-orchestrator.test.tsx` | ❌ Wave 0 |
| P18-07 | `create_estimate` tool schema includes `suggested_project_name` | unit | `npm test -- tests/unit/api/generate-estimate-route.test.ts -t "tool schema"` | ❌ Wave 0 |
| P18-07 | Project name updated only if it starts with placeholder prefix | unit | Same `-t "preserves user-edited name"` | ❌ Wave 0 |
| P18-08 | "Skip recording" button routes to `/projects/[id]` | e2e | `npx playwright test tests/e2e/capture-skip.spec.ts` | ❌ Wave 0 |
| P18-09 | Recorder renders correctly on iPhone 13 viewport (mobile-safari project) | e2e | `npx playwright test --project=mobile-safari tests/e2e/capture-fullscreen.spec.ts` | ❌ Wave 0 |
| P18-09 | Recorder renders correctly on Pixel 7 viewport (mobile-chrome project) | e2e | `npx playwright test --project=mobile-chrome tests/e2e/capture-fullscreen.spec.ts` | ❌ Wave 0 |
| P18-09 | Mic button is in bottom third on small viewports | unit (component) | `npm test -- tests/unit/components/capture-recorder.test.tsx -t "thumb-reachable"` | ❌ Wave 0 |
| D-03 | Cleanup function deletes drafts older than 24h with no recordings/estimates | integration (DB) | `npm test -- tests/integration/cleanup-orphan-projects.test.ts` (skipped without `DATABASE_URL`) | ❌ Wave 0 |
| D-15 | Empty transcript shows specific error copy | unit (component) | `npm test -- tests/unit/components/capture-orchestrator.test.tsx -t "empty transcript"` | ❌ Wave 0 |

### Manual UAT (planner records as VERIFICATION items)

These cannot be reliably automated and should be human-verified:

- **iOS Safari real-device recording:** record 30s on actual iPhone Safari; confirm waveform animates, transcript appears, estimate generates. Playwright's iPhone 13 emulator does NOT exercise real WebKit MediaRecorder.
- **Android Chrome real-device recording:** same as above on actual Android.
- **10-minute background-tab cap:** start a recording, switch to another tab for 11 minutes, return. Confirm recording stopped at exactly 10:00 (or within 1s) and pipeline ran.
- **Voice quality + Whisper transcript accuracy** for ambient construction-site noise.
- **Visual polish review:** ring stroke widths, color easing curves, mobile thumb-reach on real devices at 320px / 360px / 390px / 414px / 430px widths.

### Sampling Rate

- **Per task commit:** `npm test` (vitest only — fast)
- **Per wave merge:** `npm test && npx playwright test --project=chromium tests/e2e/capture-*.spec.ts`
- **Phase gate:** Full suite green: `npm test && npm run test:e2e` (all 3 Playwright projects: chromium, mobile-safari, mobile-chrome). Manual UAT items documented in VERIFICATION.md.

### Wave 0 Gaps

All test files for Phase 18 are new. Wave 0 must scaffold:

- [ ] `tests/unit/schemas/project.test.ts` — covers P18-01 (1-step schema)
- [ ] `tests/unit/components/new-project-wizard.test.tsx` — covers P18-01 (UI + eager submit)
- [ ] `tests/unit/components/capture-recorder.test.tsx` — covers P18-02, P18-03, P18-04, P18-09
- [ ] `tests/unit/components/capture-stepper.test.tsx` — covers P18-05, P18-06
- [ ] `tests/unit/components/capture-orchestrator.test.tsx` — covers P18-07 (pipeline orchestration), D-15
- [ ] `tests/unit/api/generate-estimate-route.test.ts` — covers P18-07 (tool schema), D-05 name patch
- [ ] `tests/e2e/capture-fullscreen.spec.ts` — covers P18-02 (no shell), P18-09 (mobile)
- [ ] `tests/e2e/capture-skip.spec.ts` — covers P18-08
- [ ] `tests/integration/cleanup-orphan-projects.test.ts` — covers D-03 (skipped without `DATABASE_URL`)

Framework install: none required (vitest + playwright already installed).

## Sources

### Primary (HIGH confidence)

- `package.json` — verified versions of next@16.2.3, @anthropic-ai/sdk@0.39.0, sonner@2.0.7, framer-motion@12.38.0, react@19.2.4
- `app/(app)/layout.tsx`, `proxy.ts`, `lib/queries/auth.ts` — current shell + auth pattern
- `components/workspace/audio/audio-recorder.tsx` — current recorder; reused as base
- `app/api/generate-estimate/route.ts` — current tool_use schema; extended for D-05
- `lib/actions/recording.ts`, `lib/actions/project.ts` — server-action patterns to preserve
- `supabase/migrations/20260409000001_initial_schema.sql` — projects.name NOT NULL constraint (drives placeholder name pattern)
- `vitest.config.ts`, `playwright.config.ts` — test infra (3 Playwright projects: chromium, mobile-safari, mobile-chrome)
- [Next.js docs — Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) — official mechanism for the layout escape (Pattern 2)
- [Next.js docs — Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages) — confirms layouts are additive
- [Anthropic — Tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) — `tool_choice` + schema additivity
- [Anthropic — Define tools](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use) — input_schema reference
- [Supabase Cron docs](https://supabase.com/docs/guides/cron) — pg_cron is the managed scheduler
- [Supabase pg_cron extension docs](https://supabase.com/docs/guides/database/extensions/pg_cron) — SQL syntax, cron.schedule, cron.unschedule
- [CSS-Tricks: Building a Progress Ring, Quickly](https://css-tricks.com/building-progress-ring-quickly/) — stroke-dasharray math
- [WebKit Bug 237878 — AudioContext suspended on iOS](https://bugs.webkit.org/show_bug.cgi?id=237878) — confirms iOS Pitfall 1
- [Chrome blog — Heavy throttling of chained JS timers (Chrome 88)](https://developer.chrome.com/blog/timer-throttling-in-chrome-88) — confirms Pattern 4 necessity
- [Why do browsers throttle JavaScript timers? (2025)](https://nolanlawson.com/2025/08/31/why-do-browsers-throttle-javascript-timers/) — confirms Pattern 4 broader applicability

### Secondary (MEDIUM confidence)

- [Vercel issue #50591 — No way to skip root layout](https://github.com/vercel/next.js/issues/50591) — community-confirmed limitation; aligns with official docs
- [Discussion #47686 — Can we skip parent layout in nested page](https://github.com/vercel/next.js/discussions/47686) — community workarounds; consistent recommendation: route groups
- [react-circular-progressbar npm](https://www.npmjs.com/package/react-circular-progressbar) — confirmed v2.2.0 latest; used only as alternatives-considered comparison

### Tertiary (LOW confidence)

- General WebSearch on `setInterval` background-tab behavior — multiple sources agree on 1Hz throttle, but specific numbers per browser version vary. Pattern 4 is robust regardless of exact throttle rate.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version verified via `npm view` + `package.json`.
- Architecture: HIGH — Pattern 2 (route groups) confirmed by Next.js docs + community discussions; Pattern 4 (wall-clock timer) is a well-established defense.
- Pitfalls: HIGH for iOS AudioContext (WebKit bug confirmed), MEDIUM for Vercel-cron-secret (project hasn't picked cleanup mechanism yet).
- Validation: HIGH — existing test infra (vitest, Playwright with 3 projects) covers all automatable cases; manual UAT is honestly flagged for real-device testing.

**Research date:** 2026-05-05
**Valid until:** 2026-06-05 (30 days — stack is stable)
