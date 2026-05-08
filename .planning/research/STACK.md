# Technology Stack

**Project:** Xtimator v1.5 Zero-friction Project Onboarding
**Researched:** 2026-05-08
**Scope:** NEW capabilities only — what must be added or changed for this milestone

---

## What NOT to Re-research (Already Exists and Validated)

| Capability | How It Exists |
|------------|--------------|
| Voice recording (full-screen) | `CaptureRecorder` + `(capture)` route group — MediaRecorder, waveform, 10-min cap, multi-stage pipeline |
| Audio transcription | `transcribeRecording` action — OpenAI Whisper, server-side only |
| Photo upload + compression | `PhotoDropZone` + `photo-grid.tsx` — drag-and-drop, camera capture, 20-photo limit |
| AI estimate generation | `lib/ai/` abstraction — `AnthropicAdapter` (tool_use), `GeminiAdapter`, `getAIProvider()` |
| Client CRUD | `client-list`, `client-sheet`, `client-detail-actions` — full CRUD with logo upload |
| Project creation action | `createProjectAction` in `lib/actions/project.ts` — eager draft, nullable `client_id` |
| Supabase schema | `projects.client_id UUID REFERENCES clients(id) ON DELETE SET NULL` — already nullable |
| shadcn/ui component library | New York variant, all primitives available: Dialog, Button, Textarea, Card, Badge, Sheet |
| react-hook-form + zod | Already in use across all forms, `^4.3.6` / `^7.72.1` |
| framer-motion | `^12.38.0` already installed — used for animations |
| Sonner toasts | `^2.0.7` — available for post-AI-extraction client detection notifications |

---

## New Capabilities Required for v1.5

### 1. Inline Short-Duration Voice Recorder (Text Path Fallback)

**Requirement:** A compact voice recorder embedded inside the new "describe" route — not full-screen, max ~2 minutes, for users who want to dictate rather than type.

**Decision: Build from existing primitives — NO new library needed.**

Rationale:
- `AudioRecorder` in `components/workspace/audio/audio-recorder.tsx` already implements the full MediaRecorder + Whisper pipeline with waveform, duration timer, and upload.
- The workspace `AudioRecorder` is already a non-full-screen component — it only occupies a card within the Audio tab.
- The inline recorder for the text path needs a subset of that functionality: record → stop → auto-transcribe → populate textarea. This is a lighter variant, not a different technology.
- All third-party recorder libraries (`react-audio-voice-recorder`, `react-duration-voice-recorder`, `react-media-recorder`) wrap the same native MediaRecorder API already used. Adding one introduces a dependency for zero new capability.

**Implementation:** Extract a `useInlineRecorder` hook from the existing `AudioRecorder` logic (MediaRecorder + duration tracking + auto-stop at configurable max). Cap at 2 minutes (configurable constant). On stop, call `transcribeRecording` and pipe result into the description textarea. No Supabase Storage write needed — the transcript is saved directly as a text-path recording row (null `storage_path`, null `duration_seconds` — same pattern the seed notes).

**Existing utilities reused:**
- `lib/utils/media-format.ts` — `getSupportedAudioMimeType()`, `getFileExtension()`
- `components/workspace/audio/waveform-visualizer.tsx` — reuse as-is or simplify for inline context
- `lib/actions/recording.ts` — `transcribeRecording()` — unchanged

---

### 2. 3-Way Input Choice UI (Modal or Inline Cards)

**Requirement:** At project creation, show Audio / Text / Photos as 3 equally prominent options. Must work on mobile (large tap targets, 1 tap to choose).

**Decision: Inline card selection within the `/projects/new` page — NO new library needed.**

Rationale:
- The choice is not a blocking interruption over other content; it IS the content of the page at this step. A Dialog/modal adds unnecessary friction (extra dismiss step, focus management overhead).
- Three full-width card buttons with icon + label + short description satisfy the "large tap target, 1 tap" requirement without needing a modal.
- shadcn/ui `Card` + `Button` already in use. The 3-card layout is a simple CSS grid/flex — no additional component primitives needed.
- If the decision is made to use a Dialog for this (e.g., triggered from a "+" button on the dashboard rather than as a dedicated page), shadcn's existing `Dialog` primitive handles it — still no new dependency.

**For mobile bottom-sheet pattern (optional enhancement):** shadcn `Drawer` (built on `vaul` by emilkowalski) is already available via shadcn/ui's component registry. It is NOT in `package.json` yet but is a zero-new-dependency add via `npx shadcn@latest add drawer` — installs vaul as peer. Recommend starting with the inline card layout; add Drawer only if UX testing shows mobile users prefer it.

**URL state for pre-linked client:** The new `/projects/new` page accepts `?clientId=` via `searchParams` (Next.js App Router server component pattern — no extra library). The existing `createProjectAction` is extended to accept an optional `clientId` parameter instead of requiring it.

| Pattern | Library | Status |
|---------|---------|--------|
| 3-card inline choice | shadcn Card + Button | Already installed |
| Dialog/modal choice | shadcn Dialog | Already installed |
| Mobile bottom drawer | shadcn Drawer (vaul) | Available via `npx shadcn@latest add drawer` if needed |
| URL clientId param | Next.js searchParams | Built-in, no library |

---

### 3. AI Client Name Extraction

**Requirement:** After estimate generation, Claude returns `detected_client_name` (nullable string). A post-generation action performs case-insensitive match against existing clients, then auto-links or creates a minimal client record. User sees a toast confirmation before automatic creation.

**Decision: Extend existing `create_estimate` tool_use schema — NO new library or API call needed.**

Rationale:
- The `AnthropicAdapter` already uses `tool_choice: { type: 'tool', name: 'create_estimate' }` with a structured JSON schema (verified in `lib/ai/providers/anthropic.ts`).
- Adding `detected_client_name` (type: `string | null`) to the existing `create_estimate` tool schema costs nothing — one additional field in the `properties` object. Claude already names clients in `suggested_project_name` (e.g. "Smith Bathroom Remodel"), confirming it already extracts this information from the transcript.
- The same extension applies to `GeminiAdapter` — the field is added to both adapters' output schema and to `EstimateOutput` in `lib/ai/types.ts`.
- Client matching uses Supabase's built-in `.ilike()` filter for case-insensitive name matching — no fuzzy-match library needed. Exact behavior: `supabase.from('clients').select('id, name').eq('company_id', companyId).ilike('name', detectedName)`. Claude's discretion handles minor variations (the seed notes this explicitly).

**Post-generation action pattern:**
1. `generate-estimate` route returns `detected_client_name` in its response JSON alongside the estimate.
2. A new `linkDetectedClient` server action (in `lib/actions/project.ts`) runs client-side after estimate generation completes.
3. If match found: `UPDATE projects SET client_id = ? WHERE id = ?`.
4. If no match: show a toast — "Client 'Maria Silva' not found — create?" with an inline confirm button before inserting.
5. If null: show the "No client linked" card on the Overview tab (existing `OverviewTab` component, add conditional card).

**Schema change required:** `detected_client_name` field added to `EstimateOutput` type and both AI provider tool schemas. No DB migration needed.

| Capability | Technology | Notes |
|------------|------------|-------|
| Claude structured extraction | Existing `tool_use` schema extension | Add `detected_client_name` field |
| Gemini structured extraction | Existing `GeminiAdapter` schema | Same field addition |
| Case-insensitive client lookup | Supabase `.ilike()` | Already available, no library |
| User confirmation toast | `sonner` (already installed) | Toast with action button |

---

### 4. "New Project" Button on Client Detail Page

**Requirement:** A button in the `ClientDetailActions` header on `/clients/[id]` that navigates to `/projects/new?clientId=<id>`, bypassing the client select step.

**Decision: Zero new technology — router.push + searchParams only.**

Rationale:
- `ClientDetailActions` is a `'use client'` component with `useRouter()` already imported.
- The button calls `router.push('/projects/new?clientId=' + client.id)`.
- The `/projects/new` page reads `searchParams.clientId` (server component) and passes it to the wizard.
- The wizard skips the client selection step when `clientId` is pre-populated.

No new library, hook, or component primitive is required.

---

### 5. "Last Used Mode" Preference Persistence

**Requirement (optional, from SEED-005):** Pre-select the last used input mode (Audio/Text/Photos) on the next project creation.

**Decision: `localStorage` in a `'use client'` component — NO library, NO cookie.**

Rationale:
- This preference does not affect SSR rendering (the choice screen is a client-rendered step, not a page-level concern). There is no FOUC risk — the mode selection is shown after the page loads regardless. The `eb-theme` cookie pattern exists specifically because dark mode SSR hydration requires it; input mode preference has no SSR requirement.
- A `useLastInputMode` hook wrapping `localStorage.getItem/setItem` (inside `useEffect` to guard against SSR) is ~10 lines and adds no dependency.
- Cookies would be overkill — the server never needs to read this preference.

---

## Summary: Net-New Dependencies

| Package | Version | Why Needed | Confidence |
|---------|---------|------------|------------|
| None (Drawer optional) | — | All new capabilities compose from existing stack | HIGH |

**If Drawer UX is chosen:** `npx shadcn@latest add drawer` installs `vaul` (~1.0.x). This is the only possible net-new package and is optional — decision deferred to UX implementation.

---

## Schema Changes (No Migrations Required)

| Change | Location | Notes |
|--------|----------|-------|
| `detected_client_name: string \| null` | `lib/ai/types.ts` — `EstimateOutput` | TypeScript only, no DB column |
| `detected_client_name` in tool schema | `lib/ai/providers/anthropic.ts` + `providers/gemini.ts` | Added to `properties` of `create_estimate` tool |
| `createProjectAction` accepts optional `clientId` | `lib/actions/project.ts` | Already nullable in DB — no migration |
| `projectSchema` makes `clientId` optional | `lib/schemas/project.ts` | Zod schema change only |

---

## Integration Points (Existing Code Touch Points)

| File | Change |
|------|--------|
| `components/projects/new-project-wizard.tsx` | Redesign: remove mandatory client step, add 3-way mode selection, accept `clientId` prop |
| `app/(app)/projects/new/page.tsx` | Read `searchParams.clientId`, pass to wizard; optionally skip client fetch if clientId already known |
| `lib/schemas/project.ts` | Make `clientId` optional, add `inputMode` enum field (`audio \| text \| photos`) |
| `lib/actions/project.ts` | `createProjectAction` accepts optional `clientId`; add `linkDetectedClient` action |
| `lib/ai/types.ts` | Add `detected_client_name` to `EstimateOutput` |
| `lib/ai/providers/anthropic.ts` | Add `detected_client_name` to `create_estimate` tool schema |
| `lib/ai/providers/gemini.ts` | Add `detected_client_name` to response schema |
| `app/api/generate-estimate/route.ts` | Return `detected_client_name` in response body |
| `components/workspace/overview-tab.tsx` | Add "No client linked" card when `project.client` is null |
| `components/clients/client-detail-actions.tsx` | Add "New Project" button |

---

## Sources

- Supabase `.ilike()` docs: https://supabase.com/docs/reference/javascript/ilike
- Anthropic structured outputs (public beta, Nov 2025): https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Claude tool_use with JSON extraction: https://platform.claude.com/cookbook/tool-use-extracting-structured-json
- shadcn Drawer (vaul): https://ui.shadcn.com/docs/components/radix/drawer
- Next.js useSearchParams: https://nextjs.org/docs/app/api-reference/functions/use-search-params
- Responsive Dialog + Drawer pattern: https://www.nextjsshop.com/resources/blog/responsive-dialog-drawer-shadcn-ui
