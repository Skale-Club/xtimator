# Feature Landscape: v1.5 Zero-friction Project Onboarding

**Domain:** Multi-modal project input + AI-inferred client association for field-service SaaS
**Researched:** 2026-05-08
**Overall confidence:** HIGH (existing codebase verified, patterns confirmed against competitors)

---

## Context

This is a subsequent milestone. Core plumbing is live. What changes is the *entry surface* for project creation, not the AI estimate pipeline itself. The generate-estimate API already handles `hasTranscript || hasPhotos` — the pipeline does not need to change. All three input paths converge there.

Competitors verified: Handoff AI (audio + photos + files), CompanyCam/Beam (photo-first estimating), Jobber (client required at job creation — a point of friction Xtimator can win on), ServiceTitan (deep client requirement, complex onboarding). None of these offer a true 3-equal-weight modal picker at the project creation level. This is a differentiator.

---

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Audio path preserved exactly as-is | Existing users built muscle memory; regression is unacceptable | Low | /projects/[id]/capture reused untouched |
| Text path produces identical estimate output | Users who type expect the same quality as audio users | Low | Saves to `recordings.transcript` without storage_path; same generate-estimate API call |
| Photos path produces identical estimate output | Photo-first is already technically supported (hasTranscript \|\| hasPhotos guard exists) | Low | Expose the path in UX; backend unchanged |
| Modal picker is 3 equal-weight options | Users in any context (noisy job site, office, quick visual) must feel first-class | Low-Med | 3 large cards, icon + label + short descriptor; no default pre-selected option the first time |
| "New Project" button on client detail page | Removes 4-screen detour (clients → select client → back → /projects/new → re-select); expected by any CRM-adjacent user | Low | ClientDetailPage header; passes ?clientId= to wizard; skips client selection step |
| Client linkable after project creation | Field-first users should not be blocked pre-capture; Overview tab card handles post-creation link | Med | Overview tab already shown; add "No client linked" card when client_id is null |
| Client name visible on project once linked | Users need visual confirmation that AI or manual link worked | Low | Already rendered in workspace Overview if client exists |

---

## Differentiators

Features that set Xtimator apart. Not expected by users from a v1 product, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI-inferred client from transcript/text/photo | Business owner records "this is the Smith's kitchen" and the system auto-links or creates the Smith client — zero manual search | Med | Claude returns `detected_client_name` as a new JSON field alongside estimate output; post-generation action does case-insensitive match against existing clients in company, then creates or links; happens async after estimate generation |
| "Last used mode" pre-selection | Repeat users (construction = 90% audio, cleaning = 90% photos) get to their preferred input in 0 taps on subsequent uses | Low | localStorage key per company/user; no DB column needed; falls back to no pre-selection if no history |
| Skip client entirely on first visit | Zero-step project creation: tap "+ New Project" → choose modality → capture → estimate. The wizard has no mandatory form gate | Med | Requires project creation with client_id: null (already supported by ON DELETE SET NULL schema constraint) |
| Confirmation banner for AI-detected client | "Client detected: Smith Residence — linked" or "No client found — add one?" — transparent AI behavior builds trust | Low | Toast + Overview card state; user can override |
| Text input as equal first-class citizen | No apps in the verified competitive set expose text-first as a primary entry path (they all default to forms or audio). Being explicit that "typing is fine" removes anxiety for office-based workers or assistants | Low | Textarea with rich placeholder; "Generate Estimate" CTA; same pipeline |

---

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Auto-confirm AI client creation without showing user | Creates duplicate clients silently; "Maria" vs "Maria Aparecida" scenario documented in SEED-007. Trust erodes if AI makes wrong link invisibly | Show `detected_client_name` in a non-blocking banner; let user confirm or dismiss before creating a new client record |
| Force client selection before any capture in new wizard | The whole point of SEED-007 is eliminating this step; re-adding it defeats the milestone goal | client_id: null on project creation; link after |
| Mixed-modality onboarding in this milestone | Adds branching complexity and scope risk; users who start text can always add photos in workspace after | "You can always add photos/audio in the workspace" copy on the modal picker |
| Fuzzy / NLP match with auto-merge of duplicate clients | Duplicate detection at write-time is v2; fuzzy match for read (finding the right existing client) is safe and should be used | Match for reads only; never auto-merge existing clients |
| "Last used mode" stored in DB | localStorage is sufficient for a UX pref; DB column adds a migration, query overhead, and sync complexity with no clear benefit at this scale | localStorage with JSON.stringify; degrade gracefully if cleared |
| Handwriting recognition in photos | v3+ feature; OCR on hand-written site notes is a different product capability | Document it as future seed |
| TTS (text-to-audio) from typed input | No user has asked for this; adds cost and complexity with no clear value in a quote-generation flow | Out of scope forever for this use case |
| Offline mode for any of the three paths | All three paths require the AI API; false promise of offline capture is worse than a clear "needs network" state | Show connectivity error clearly if API call fails |

---

## Feature Dependencies

```
Modal picker (3-way choice)
  → depends on: Project created with client_id: null (schema already supports this)
  → feeds: Audio path (existing /capture route)
  → feeds: Text path (new /describe route — saves to recordings.transcript)
  → feeds: Photos path (enhanced photo-first entry — reuses PhotoDropZone)

Text path
  → depends on: recordings table accepts transcript without storage_path (already nullable)
  → feeds: generate-estimate API (no change needed)

Photos path (enhanced entry)
  → depends on: PhotoDropZone component (already built)
  → feeds: analyze-photos + generate-estimate APIs (no change needed)
  → Note: generate-estimate already checks hasTranscript || hasPhotos

AI client inference
  → depends on: estimate generation completing (runs as post-generation hook)
  → depends on: clients table CRUD (already built)
  → depends on: projects.client_id nullable (already schema fact)
  → produces: detected_client_name in Claude response JSON

"New Project" button on ClientDetailPage
  → depends on: /projects/new accepting ?clientId= searchParam
  → depends on: wizard skipping client-select step when clientId is pre-supplied
  → independent of AI inference (client already known)

"Link client" card in Overview
  → depends on: project.client_id being null (already possible)
  → depends on: ClientSearchCombobox (same pattern as wizard's StepClientSelect — reuse)
  → independent of AI inference (manual fallback path)
```

---

## MVP Recommendation

The milestone has two independent clusters. Build cluster A first; cluster B can ship independently.

**Cluster A — Modal input choice (SEED-005)**

Priority order:
1. Wizard redesign — add input mode step (3-card picker); route to correct path; store input_mode field on project (nullable, no breaking migration)
2. Text path route `/projects/[id]/describe` — textarea → save as transcript → generate
3. Photos path enhancement — photo-first entry point with prominent "Generate from Photos" CTA (PhotoDropZone already built; just expose and route to it from the modal picker)

**Cluster B — Frictionless client association (SEED-007)**

Priority order:
1. "New Project" button on ClientDetailPage — trivially small, high ROI, zero AI dependency
2. Client optional in wizard — remove mandatory client select step; allow client_id: null at project creation
3. AI client extraction — add `detected_client_name` to Claude response schema; post-generation action for match/create; banner in UI

**Defer:**
- "Last used mode" preference: simple but not blocking; can be added as a 1-hour addition to the wizard phase
- Confirmation banner for AI-linked client: bundle with AI client extraction phase, not a separate phase

---

## Complexity Notes for Requirements Agent

| Feature | Complexity | Reason |
|---------|------------|--------|
| 3-card modal picker | Low | UI only; wizard already has multi-step structure |
| Text path route | Low | New page + save recording row without audio; reuse generate-estimate call |
| Photos path entry route | Low | Routing change + PhotoDropZone reuse; backend unchanged |
| Optional client in wizard | Low-Med | Remove validation guard; ensure project creation action accepts null client_id |
| "New Project" on ClientDetailPage | Low | Button + router.push with searchParam; wizard reads param and skips step |
| AI client extraction (Claude JSON field) | Med | Prompt engineering + JSON schema change + post-process action + UI feedback |
| "Link client" card in Overview | Low-Med | Conditional render + combobox search (reuse existing client search) |
| input_mode DB field | Low | Nullable TEXT with CHECK constraint; same pattern as theme_preference |

---

## Sources

- Codebase: `components/workspace/estimate/estimate-tab.tsx` — confirms `hasTranscript || hasPhotos` pipeline guard (HIGH confidence, direct code read)
- Codebase: `app/api/generate-estimate/route.ts` — confirms generate-estimate reusable for all modalities (HIGH confidence, direct code read)
- Codebase: `components/projects/new-project-wizard.tsx` components list — confirms wizard is componentized and extensible (HIGH confidence, direct ls)
- SEED-005 / SEED-007 — product owner analysis of use cases and proposed flows (HIGH confidence, primary spec)
- [Handoff AI](https://handoff.ai/) — verified competitor supporting audio + photos + files for estimate generation (MEDIUM confidence, WebFetch)
- [CompanyCam + Beam](https://companycam.com/press) — photo-to-estimate pipeline as market validation for photo-first flows (MEDIUM confidence, WebSearch)
- [Nielsen Norman Group — Bottom Sheets](https://www.nngroup.com/articles/bottom-sheet/) — guidance: bottom sheet for short modal choice, full-screen if complex (HIGH confidence, official source)
- [LogRocket Modal UX Patterns](https://blog.logrocket.com/ux-design/modal-ux-design-patterns-examples-best-practices/) — progressive disclosure and chunked step guidance (MEDIUM confidence, WebFetch)
- [Jobber job creation docs](https://help.getjobber.com/hc/en-us/articles/115009379047-Create-a-One-Off-Job) — Jobber requires client at job creation (confirmed via WebSearch; 403 on direct fetch); validates Xtimator's optional-client approach as differentiator (MEDIUM confidence)
- [Microsoft tech community — AI post-call intelligence](https://techcommunity.microsoft.com/blog/azurecommunicationservicesblog/from-call-transcripts-to-crm-gold-ai-powered-post-call-intelligence/4456337) — validates pattern of extracting entity names from transcripts and auto-linking CRM records (MEDIUM confidence, WebSearch)
- [WinPure fuzzy matching guide](https://winpure.com/fuzzy-matching-guide/) — validates case-insensitive name match + human confirmation loop for edge cases (MEDIUM confidence, WebSearch)
