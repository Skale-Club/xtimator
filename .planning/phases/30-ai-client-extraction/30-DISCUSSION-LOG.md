# Phase 30: AI Client Extraction - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 30-ai-client-extraction
**Areas discussed:** Suggestion trigger, AI output contract, matching and user choice, UX placement

---

## Suggestion Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Clientless projects only | Show suggestions only when the project has no linked client. | yes |
| Always show | Show even when a project already has a client. | |
| Never show automatically | Require user to manually inspect suggestions. | |

**User's choice:** Auto-selected recommended default.
**Notes:** Suppress prompts for already-linked projects and no-detection cases to preserve the current flow.

---

## AI Output Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Extend estimate output | Add optional client suggestion fields to the existing structured AI response. | yes |
| Separate AI call | Run a second extraction call after estimate generation. | |
| Client-side extraction | Try to parse client names in the browser. | |

**User's choice:** Auto-selected recommended default.
**Notes:** One server-side AI call keeps the flow simple and avoids exposing AI work to the browser.

---

## Matching And User Choice

| Option | Description | Selected |
|--------|-------------|----------|
| Conservative exact matching | Match existing clients by normalized exact name; defer fuzzy matching. | yes |
| Fuzzy matching now | Support partial names and similarity scoring in v1.5. | |
| Always create new | Treat every detected name as a new client candidate. | |

**User's choice:** Auto-selected recommended default.
**Notes:** REQUIREMENTS.md explicitly defers fuzzy matching and excludes silent AI client auto-creation.

---

## UX Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Toast after generation | Use a non-blocking sonner toast after estimate generation succeeds. | yes |
| Modal confirmation | Interrupt the editor with a blocking confirmation dialog. | |
| Overview-only card | Only show the suggestion later in Overview. | |

**User's choice:** Auto-selected recommended default.
**Notes:** The roadmap calls for a non-blocking prompt, so a toast matches the requirement and existing UI patterns.

---

## the agent's Discretion

- Exact payload shape and handoff mechanism may be chosen during planning.
- No extra user questions were asked because this run came from `next` auto-progression.

## Deferred Ideas

- Fuzzy matching.
- Silent creation.
- Rich client resolution modal.
