# Domain Pitfalls

**Domain:** Multi-modal project input + AI-inferred client association (v1.5)
**Researched:** 2026-05-08
**Scope:** Integration pitfalls for adding 3-way input choice (audio/text/photos) and AI-extracted client linking to the existing Next.js 14+ field-service app.

---

## Critical Pitfalls

Mistakes that cause migrations, data corruption, broken AI pipelines, or complete rerewrites of a phase.

---

### Pitfall 1: `storage_path NOT NULL` blocks text-input recording insert

**What goes wrong:** The text-input path saves a user's typed description as a `recordings.transcript` row without an audio file. The `recordings` table schema (`20260409000001_initial_schema.sql`, line 74) has `storage_path TEXT NOT NULL`. Inserting a transcript-only row with `storage_path: null` fails at the DB level with a constraint violation. The generate-estimate route reads `recordings.transcript`, so this insert is the only way to feed text into the existing pipeline.

**Why it happens:** The `createRecording` action signature (`lib/actions/recording.ts:26`) requires `storagePath: string` and `durationSeconds: number` — designed exclusively for Whisper flow. No path to create a transcript-only recording row exists.

**Consequences:** The text-input path either silently fails (user sees "Generate Estimate" remain disabled) or crashes with a 500. This is the single hardest blocker for the text path.

**Prevention:**
- Migrate `storage_path` to nullable: `ALTER TABLE recordings ALTER COLUMN storage_path DROP NOT NULL;`
- Add a new server action `createTextTranscript(projectId, transcript)` that inserts with `storage_path: null, duration_seconds: null`. Keep the existing `createRecording` for audio.
- The generate-estimate route (`route.ts:76-81`) already handles transcript-only correctly — it only needs `r.transcript && r.transcript.trim().length > 0`. No change needed there.

**Detection:** TypeScript will not catch this — `storage_path` is `string` in `lib/queries/recording.ts:8` (generated types reflect the NOT NULL DDL). The failure is a runtime Supabase insert error.

**Phase:** Must be resolved in the phase that introduces the text-input route, before any UI work.

---

### Pitfall 2: Orphan-cleanup cron deletes text-only projects before estimate generation

**What goes wrong:** The cleanup cron (`20260505000001_phase18_cleanup_cron.sql`) deletes `status = 'draft'` projects older than 24 hours that have **no recordings AND no estimates**. If a user opens the text-input path, types their description, but does not yet generate the estimate (estimate is not created until `/api/generate-estimate` completes), the project is safe only if a recording row exists. However, if the text-input path is implemented using a `recordings` row, the cron is satisfied. The danger is if the implementation stores the text somewhere else (e.g., a new `project.description` column, or deferred recording creation), leaving the project temporarily recording-less.

**Why it happens:** The cron predicate was written for the audio flow, where saving audio always creates a recording row immediately. The text flow has a different timing model.

**Consequences:** A user types a description, saves it, gets distracted for 24h, comes back — project is gone with no warning.

**Prevention:**
- Use the `recordings` table row (with the nullable `storage_path` fix from Pitfall 1) as the anchor. As soon as the user submits text, insert the recording row. This satisfies the cron predicate.
- Alternatively, update the cron predicate to also exclude projects with `recordings.storage_path IS NULL AND recordings.transcript IS NOT NULL` — but this is unnecessary if the recording row is always inserted on text save.
- Do not defer the recording insert to "after estimate generation."

**Phase:** Same phase as text-input route; the recording insert must happen before the generate step, not as part of it.

---

### Pitfall 3: `clientId` required in `projectSchema` and `createProjectAction` breaks the optional-client flow

**What goes wrong:** The current `projectSchema` (`lib/schemas/project.ts:4`) enforces `clientId: z.string().min(1, 'Please select a client')`. The `createProjectAction` passes `client_id: formData.clientId` directly to the insert. If client selection is made optional (v1.5 goal: `client_id: null`), the schema validation fires before the insert and blocks project creation.

**Why it happens:** The schema was authored for a mandatory client step. Making client optional in the wizard UI does nothing if the server action still rejects an empty `clientId`.

**Consequences:** Wizard submits → server action returns `{ error: "Please select a client" }` → user is stuck. The entire "zero-friction" milestone breaks on the first call.

**Prevention:**
- Change `projectSchema` to `clientId: z.string().optional()` (or allow empty string: `.optional().or(z.literal(''))`).
- Change `createProjectAction` to `client_id: formData.clientId || null`.
- The DB column is already nullable (`client_id UUID REFERENCES clients(id) ON DELETE SET NULL`) — no migration needed.
- The `?clientId=` searchParam path (New Project from client card) must pass clientId as a pre-populated value so the insert still sets `client_id` correctly for that flow.

**Phase:** Must be the first change in whatever phase restructures the wizard. All other wizard changes depend on this.

---

### Pitfall 4: AI client extraction runs inside generate-estimate but `detected_client_name` is not in the current tool schema

**What goes wrong:** The SEED-007 design calls for the Claude tool (`create_estimate`) to return a `detected_client_name` field. The current tool input_schema (`lib/ai/providers/anthropic.ts`) has no such field — Claude will never return it because it is not declared in the required/properties. Attempts to read `toolBlock.input.detected_client_name` will always be `undefined`.

**Why it happens:** The tool schema is a closed contract. Claude only emits fields that are in the schema.

**Consequences:** Post-generation client-linking logic finds no name, always falls through to "no client" — the AI client inference feature appears to work (no errors) but does nothing.

**Prevention:**
- Add `detected_client_name: { type: 'string', description: '...' }` (nullable-ish: make it optional in the schema, not required) to the tool properties in both `AnthropicAdapter` and `GeminiAdapter`.
- Update `normalizeOutput` in `lib/ai/normalize.ts` to pass `detected_client_name` through to `EstimateOutput`.
- Update `EstimateOutput` in `lib/ai/types.ts` to include `detected_client_name?: string | null`.
- The Gemini adapter must mirror this — divergence between adapters will make the feature work on Anthropic but silently fail when the admin switches providers.

**Phase:** The AI extraction phase. Must update both adapters atomically.

---

### Pitfall 5: Post-generation client matching runs a case-insensitive search against the wrong scope

**What goes wrong:** After estimate generation, the app needs to match `detected_client_name` against existing clients. If the query does not scope by `company_id`, it will match clients from other companies — an RLS bypass for reads that returns wrong data, or even links a project to another company's client (which RLS then makes invisible to the owner).

**Why it happens:** New code written in a server action context might use `supabase.from('clients').select().ilike('name', detected_client_name)` without the `eq('company_id', ...)` guard, especially since a copy-paste from an earlier query that already has company scoping is easy to miss.

**Consequences:** Cross-tenant data confusion. Client B from company A appears to be linked to a project of company B (which then shows "No client" in the UI because RLS hides the row).

**Prevention:**
- Always include `.eq('company_id', companyId)` before any `ilike` on the clients table.
- The existing `getAuthContext()` helper returns `company.id` — use that, never derive company_id from the project row alone.
- Write a unit test for the matching function that asserts the `company_id` filter is present before the name match.

**Phase:** AI client extraction phase.

---

### Pitfall 6: Auto-created client from AI extraction skips the "confirm before create" step described in SEED-007

**What goes wrong:** SEED-007 notes: *"The name detected by the AI should be shown to the user before creating the client automatically — avoid creating 'Maria' when the user said 'a Maria do apartamento 201' and 'Maria Aparecida' already exists."* If the post-generation hook silently calls `INSERT INTO clients` on any non-null `detected_client_name`, it will create duplicate or partial clients without user consent.

**Why it happens:** The generate-estimate route is a fire-and-forget API call. It is tempting to add the full match/create pipeline inside the route itself (it has all the data), but the user has no visibility into what is happening.

**Consequences:** Pollution of the client list with stub entries like "the building on Fifth", "Maria", "my friend John". These are hard to clean up and visible to the user in the combobox.

**Prevention:**
- Return `detected_client_name` in the generate-estimate API response body alongside `estimateId`.
- Let the client — the capture page or a new text-input page — surface a dismissible toast or inline prompt: *"Client detected: Maria Silva — Link or Create?"* with a single confirm button.
- Only auto-link (not auto-create) when an exact case-insensitive match exists in the company's client list.
- Auto-create should be gated behind explicit user confirmation.

**Phase:** AI client extraction phase; affects both the API route response shape and the calling UI component.

---

## Moderate Pitfalls

---

### Pitfall 7: The `?clientId=` searchParam is read server-side on a cached page, but `NewProjectWizard` needs it client-side

**What goes wrong:** The "New Project" button on `/clients/[id]` navigates to `/projects/new?clientId=<uuid>`. The `app/(app)/projects/new/page.tsx` is a server component that currently reads nothing from `searchParams`. If the clientId is pre-populated by passing it as a prop to `NewProjectWizard`, the wizard needs to skip client selection. But `NewProjectWizard` is a `'use client'` component. If the server page uses `React.cache()` or any ISR, `searchParams` access makes the page dynamic — acceptable here but must be explicitly handled.

**Why it happens:** Next.js App Router: reading `searchParams` in a server component opts the route into dynamic rendering. The existing `page.tsx` does not accept a `searchParams` prop at all.

**Consequences:** Either the clientId is ignored (button appears to do nothing special), or the page is accidentally left static and `searchParams` is always `{}`.

**Prevention:**
- Add `searchParams: Promise<{ clientId?: string }>` to the page props signature (Next.js 16 async params pattern — already established in `clients/[id]/page.tsx`).
- Pass `preselectedClientId` as a prop to `NewProjectWizard`.
- In `createProjectAction`, accept an optional `preselectedClientId` that bypasses the form's `clientId` field if provided.
- This does not need a modal route or any state management — pure URL prop passing.

**Phase:** "New Project from client card" phase.

---

### Pitfall 8: The wizard removes client select but `NewProjectWizard`'s `clients` prop (and the `getClients` query) is still loaded unconditionally on every page visit

**What goes wrong:** `app/(app)/projects/new/page.tsx` always calls `getClients(supabase, company.id)` before rendering the wizard. If client selection is removed as a mandatory step, this query becomes dead weight for the audio and text paths (it's only needed for the "pre-select from client card" scenario, where the client is already known via `?clientId=`).

**Why it happens:** The query was authored when the wizard had only one purpose: pick a client. After v1.5, the client list is only needed when no `clientId` is pre-supplied and the user wants to optionally link a client during onboarding.

**Consequences:** An extra 50-200ms DB round-trip on every new project creation, loading a potentially large client list that the user never sees or uses.

**Prevention:**
- Make the query conditional: only run `getClients` if `searchParams.clientId` is absent and the wizard's UI still offers optional client selection.
- Or: defer client loading entirely and let the Overview tab's "Link client" card handle client assignment post-creation (which is the SEED-007 preferred model).
- The simplest safe approach for the first phase: keep the query but make it optional in the wizard UI; defer optimization to a follow-up.

**Phase:** Wizard restructure phase.

---

### Pitfall 9: Photos-first path bypasses photo analysis and finds no `ai_description` rows

**What goes wrong:** The `estimate-tab.tsx` `hasPhotos` check (`photos.length > 0`) returns `true` when photos exist, enabling the Generate button. But the generate-estimate route checks for `hasPhotoDescriptions = photos.some(p => p.ai_description && ...)` — photos without AI descriptions are not fed to the estimate. If the photos-first path uploads photos but does not trigger `/api/analyze-photos` first, the estimate is generated with zero photo context.

**Why it happens:** The existing `handleGenerate()` in `estimate-tab.tsx` does call `/api/analyze-photos` if `hasPhotos` is true (lines 59-69), but this is only in the workspace Estimate tab. A new photos-first route that calls generate-estimate directly (without going through the workspace) would skip this step.

**Consequences:** Photos-first path generates an estimate identical to a blank estimate — no line items derived from the photos. The user sees a useless estimate and concludes the feature is broken.

**Prevention:**
- Any new photos-first UI must call `/api/analyze-photos` and await its completion before calling `/api/generate-estimate`. This is already the correct ordering in `estimate-tab.tsx`.
- Do not expose a "Generate from Photos" button that calls generate-estimate directly. Always go through analyze-photos first.
- The generate-estimate route itself does not defensively call analyze-photos — it trusts the caller. This is intentional but means the caller must be correct.

**Phase:** Photos-first input route phase.

---

### Pitfall 10: Modal choice selection state lost if the user navigates back

**What goes wrong:** If the wizard implements the 3-way modal choice as a second step (after project creation), the user may hit the browser Back button after selecting "Text" and creating the project. The project row exists (eager creation is confirmed at wizard step 1), but the user re-lands on a page with no knowledge that a draft project was already created. They might click "New Project" again, creating a second orphan project.

**Why it happens:** Eager project creation (D-01, confirmed in STATE.md) fires at the first wizard step. If the modal choice is step 2 in the wizard UI, the project already exists before the user picks their input type.

**Consequences:** Orphan draft accumulation (partially mitigated by the 24h cron, but the user sees two draft projects in the sidebar immediately).

**Prevention:**
- Move project creation to after modal choice, not before. The modal choice page does not need a project row — it just picks where to redirect.
- Structure: show modal choice first (no DB write), then on selection create the project row and redirect to the input route.
- Alternatively: make the 3-way modal choice the only thing on the wizard page, create the project row immediately when the user taps a modal card (single-tap-to-create). This minimizes the back-navigation window.

**Phase:** Wizard redesign phase.

---

### Pitfall 11: `project_status` transitions do not account for the text path

**What goes wrong:** `createRecording` in `lib/actions/recording.ts` sets `projects.status = 'recording'` when the first recording is added (line 51-57). If the text path inserts a recording row with `storage_path: null`, this same status transition fires — which is correct for the pipeline but semantically odd ("recording" status for a text-only project). More critically, if the text path does not use the `createRecording` action (uses a new `createTextTranscript` action instead), status is never updated from `draft`, and the project stays in `draft` status even after the estimate is ready.

**Why it happens:** Status transitions are hard-coded in the recording action, not in a central state machine.

**Consequences:** Projects appear as `draft` in the dashboard long after the estimate is generated. Dashboard filters and stats are wrong. The sidebar shows draft projects that should show `estimate_ready`.

**Prevention:**
- Reuse or mirror the status transition logic in `createTextTranscript`. After inserting the transcript-only recording row, update `projects.status = 'recording'` (same trigger point as audio).
- The generate-estimate route already updates status to `estimate_ready` on success (line 287) — this works for all paths, no change needed there.

**Phase:** Text-input route phase.

---

## Minor Pitfalls

---

### Pitfall 12: The photos-first input path creates a route-group collision risk

**What goes wrong:** SEED-005 sketches `/projects/[id]/photos-input` as a new route for the photos-first flow. The existing workspace photos tab is at `/projects/[id]` (tab-based, no sub-route). Creating `/projects/[id]/photos-input` inside the `(app)` route group puts it under the app shell (sidebar + topbar), while `/projects/[id]/capture` is in the `(capture)` route group (full-screen, no shell). If the photos-first path should be a focused experience (no shell distractions), it needs to be in `(capture)` — but the existing `(capture)` layout is designed only for the recorder.

**Why it happens:** Route group architecture choices made in Phase 18 were audio-specific.

**Prevention:**
- Decide early whether the photos-first path is a full-screen experience (add to `(capture)` group, extend the layout) or an in-shell experience (use the existing Photos workspace tab with a more prominent "Generate" CTA).
- The simplest path: enhance the existing Photos workspace tab rather than creating a new route. Add a prominent "Generate from Photos" banner/button to the Photos tab when no estimate exists.

**Phase:** Photos-first input phase; resolve before building any UI.

---

### Pitfall 13: The text-input textarea has no minimum length validation and an LLM will hallucinate on very short input

**What goes wrong:** If the user types "paint house" (10 characters) and hits Generate, Claude receives a transcript of 10 characters with no other context. Claude will still return a structured estimate — it will hallucinate quantities, prices, and scope. The user gets a plausible-looking but entirely fabricated estimate that may be used for a real job.

**Why it happens:** The generate-estimate route has no minimum transcript length check beyond `trim().length > 0`. This was acceptable for Whisper transcripts (which are always at least a few sentences) but is a real UX problem for typed input.

**Prevention:**
- Add a client-side minimum length (e.g., 50 characters) with a visible character counter and disabled Generate button below the threshold.
- Add a server-side guard in the generate-estimate route: if the only transcript is under 50 characters and there are no photos, return a 400 with `"Description is too short to generate a useful estimate."`.
- SEED-005 suggests a minimum of 10 lines for the textarea — this is a UI constraint, not a character count, and is insufficient on its own.

**Phase:** Text-input route phase.

---

### Pitfall 14: Auto-created clients (name-only) surface in all client-facing comboboxes and dropdown searches

**What goes wrong:** If AI extraction auto-creates a client with only a name (no email, phone, address), that stub client appears in the client search combobox everywhere: the wizard client selector, the Overview tab link-client control, the share-estimate email field. Users may accidentally select the stub client for a different project.

**Why it happens:** The `getClients` query returns all clients for the company. There is no `is_stub` or `source` column to distinguish AI-created from user-created clients.

**Prevention:**
- Only auto-link to existing clients (never auto-create) unless the user explicitly confirms.
- If auto-create is implemented, consider adding a `source TEXT` column to `clients` (`'user'` vs `'ai_inferred'`) so stubs can be visually differentiated in the combobox with a "Incomplete" badge and easily cleaned up.
- This is primarily a consequence of Pitfall 6 — preventing silent auto-creation prevents this pitfall entirely.

**Phase:** AI client extraction phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Wizard redesign (remove mandatory client select) | Pitfall 3: schema still requires clientId | Update `projectSchema` first, before any UI changes |
| Wizard redesign (3-way modal choice) | Pitfall 10: eager project creation + back navigation creates orphans | Create project row on modal card tap, not on wizard load |
| Text-input route | Pitfall 1: `storage_path NOT NULL` on recordings table | Migration to make `storage_path` nullable is a prerequisite |
| Text-input route | Pitfall 2: orphan cron deletes text-only projects | Insert recording row immediately on text save, not after estimate generation |
| Text-input route | Pitfall 11: project status stays `draft` after text save | Mirror status transition from `createRecording` in `createTextTranscript` |
| Text-input route | Pitfall 13: LLM hallucination on very short input | Client + server minimum length guard |
| Photos-first route | Pitfall 9: photos uploaded but not analyzed before generate | Always call analyze-photos, then generate-estimate, never skip analysis |
| Photos-first route | Pitfall 12: route group placement (shell vs full-screen) | Decide before building; enhancing the Photos tab avoids new route entirely |
| AI client extraction | Pitfall 4: `detected_client_name` not in tool schema | Update both Anthropic and Gemini adapter schemas atomically |
| AI client extraction | Pitfall 5: client match not scoped by company_id | Add `.eq('company_id', companyId)` before ilike; unit test the filter |
| AI client extraction | Pitfall 6: silent auto-create pollutes client list | Return `detected_client_name` in API response; let UI confirm before creating |
| AI client extraction | Pitfall 14: stub clients in all comboboxes | Only auto-link, never auto-create without user confirmation |
| New Project from client card | Pitfall 7: searchParams not read in page.tsx | Add `searchParams` prop to page; pass as `preselectedClientId` to wizard |
| New Project from client card | Pitfall 8: `getClients` query runs even when client is pre-known | Conditionally skip the query when `clientId` is pre-supplied |

## Sources

- Codebase (direct inspection): `lib/schemas/project.ts`, `lib/actions/project.ts`, `lib/actions/recording.ts`, `app/api/generate-estimate/route.ts`, `lib/ai/providers/anthropic.ts`, `lib/ai/types.ts`, `lib/ai/prompt-builder.ts`, `supabase/migrations/20260409000001_initial_schema.sql`, `supabase/migrations/20260505000001_phase18_cleanup_cron.sql`, `components/projects/new-project-wizard.tsx`, `components/workspace/estimate/estimate-tab.tsx`, `components/workspace/overview-tab.tsx`, `app/(app)/clients/[id]/page.tsx`, `components/clients/client-detail-actions.tsx`
- Seed documents: `.planning/seeds/SEED-005-multi-modal-project-input.md`, `.planning/seeds/SEED-007-frictionless-client-project-association.md`
- Accumulated decisions: `.planning/STATE.md` (Decisions section, particularly Phase 18 voice-first onboarding decisions)
