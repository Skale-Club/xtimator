# Phase 18: Voice-First Project Onboarding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 18-voice-first-project-onboarding
**Areas discussed:** Project creation timing & recorder route, Photos, Project name strategy, Failure & empty-state recovery

---

## Gray-Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Project creation timing & recorder route | When the projects row is created and where the recorder lives | ✓ |
| Photo capture in this flow | Voice-only vs inline photos vs two-step capture | (deferred to round 2) |
| Project name strategy (no longer in wizard) | Auto vs AI-suggested vs editable later | (deferred to round 2) |
| Failure & empty-state recovery | What happens when transcription/generation fails | (deferred to round 2) |

**User's choice:** "Project creation timing & recorder route" only on first round; second round opted to discuss the remaining 3 instead of leaving them to Claude's discretion.

---

## Project creation timing & recorder route

### Q1: When is the projects row created in the DB?

| Option | Description | Selected |
|--------|-------------|----------|
| Eager: on client-step submit (Recommended) | createProjectAction runs on submit; recorder always has project_id; refactor-free path. Tradeoff: orphan drafts. | ✓ |
| Lazy: on first recording save | Wizard passes clientId in URL/session; recorder runs without project_id; row inserted on Save & Transcribe. Refresh during recording loses everything. | |
| Eager + scheduled cleanup | Same as Eager + scheduled job to delete orphan drafts > 24h old. | (folded into Q3) |

### Q2: Where does the recorder live?

| Option | Description | Selected |
|--------|-------------|----------|
| /projects/[id]/capture (Recommended) | Sub-route under workspace with full-screen layout that escapes app shell. Bookmarkable. | ✓ |
| /projects/new/record | Top-level wizard route; pairs with lazy creation. | |
| /projects/[id] with ?capture=1 | Reuse workspace page with full-screen overlay. Mixes layouts in one file. | |

### Q3: How are orphan draft projects handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Scheduled cleanup job (Recommended) | Supabase scheduled function or pg_cron deletes drafts with 0 recordings + no estimate older than 24h; UI hides them in the meantime. | ✓ |
| Filter in UI only | No deletion — exclude empty drafts from dashboard/sidebar/stats. Lives in DB forever. | |
| Defer — accept orphan rows | Phase 18 ships without cleanup; revisit later. | |

---

## Photos

### Q: Where do photos fit in the voice-first flow?

| Option | Description | Selected |
|--------|-------------|----------|
| Voice-only first; photos via existing tab later (Recommended) | Capture screen has only the recorder. Photos accessible via existing Photos tab post-generation. AI runs from transcript alone first; user regenerates with photos later. | ✓ |
| Inline photo capture below recorder | Recorder + optional "Add photos" button on the capture screen; AI uses both. More UI on the screen. | |
| Two-step capture: record → photos → generate | Intermediate photo step before generation. Conflicts with auto-fire philosophy. | |

---

## Project name strategy

### Q: How is projects.name populated now that the wizard skips it?

| Option | Description | Selected |
|--------|-------------|----------|
| AI-suggested from transcript at generation time (Recommended) | Extend create_estimate tool schema; Claude returns suggested name (e.g. "Smith Bathroom Remodel"). Editable in editor. | ✓ |
| Auto template: "{Client} — {Date}" | Deterministic; e.g. "Smith Family — May 5". No AI dependency. Less human/contextual. | |
| Empty until user edits | Stored as null until user names it; UI shows "Untitled project" fallback. Friction before sharing. | |

---

## Failure & empty-state recovery

### Q: What happens when transcription is empty or AI generation fails?

| Option | Description | Selected |
|--------|-------------|----------|
| Retry-in-place with manual fallback (Recommended) | Stepper shows failed stage with Retry button (max 2). After 2 fails or "Skip & edit manually", land in empty editor with recording attached. | ✓ |
| Auto-redirect to editor on any failure | Any error silently redirects to empty editor with toast explanation. Less user agency. | |
| Block in stepper with error — user clicks to recover | Stepper stops with "Try again" / "Edit manually" buttons. No auto-redirect. | |

---

## Claude's Discretion

- Specific cleanup mechanism (pg_cron vs Supabase edge function vs Vercel cron) — planner picks based on existing infra.
- Visual treatment specifics (stroke widths, animation easing, exact microcopy strings).
- Toast library defaults to `sonner` (already in use).
- Cancel-mid-recording UX (discard vs save partial).

## Deferred Ideas

- Editor "regenerate from scratch with photos added" UX (Phase 6 surface).
- Inline photo capture on `/capture` screen.
- Two-step capture (record → photos → generate).
- Web Speech live preview cross-browser parity.
- Mobile-specific layout beyond responsive sizing (e.g. iOS bottom-sheet).
