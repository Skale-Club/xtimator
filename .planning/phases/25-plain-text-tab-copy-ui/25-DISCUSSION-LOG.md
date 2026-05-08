# Phase 25: Plain Text Tab + Copy UI — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 25-plain-text-tab-copy-ui
**Areas discussed:** Placement, Items format, Reset behavior

---

## Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Send tab — new full-width card | Add Plain Text card below existing 2-col layout (EstimatePreview + SendForm). No structural changes. | ✓ |
| Send tab — tabs inside EstimatePreview | Restructure EstimatePreview to use Tabs (PDF \| Web Link \| Plain Text). Matches roadmap language but requires refactor. | |
| New 6th workspace tab | Add 'Plain Text' alongside Overview / Audio / Photos / AI Estimate / Send. | |

**User's choice:** Send tab — new full-width card (Recommended)
**Notes:** Clean, minimal change, fits existing card pattern from Phases 20 and 24.

---

## Items Format

| Option | Description | Selected |
|--------|-------------|----------|
| [Section Title]\nItem description: $120 | SEED-004 exact format. Square-bracket header, colon-separated price. | ✓ |
| [Section Title]\nItem description — $120 | Same structure but em-dash separator. Slightly more formal. | |
| You decide | Claude picks the format using SEED-004 as reference. | |

**User's choice:** [Section Title]\nItem description: $120 (Recommended)
**Notes:** Matches SEED-004 example exactly.

---

## Reset Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — small reset icon button | RotateCcw icon next to Copy button, resets textarea to generated text. | ✓ |
| No reset — just reload the page | Keep simple; user refreshes if they want original text. | |

**User's choice:** Yes — small reset icon button next to Copy (Recommended)
**Notes:** Low-surface-area feature. Tooltip: "Reset to generated text". Immediate, no confirmation.

---

## Claude's Discretion

- Card header wording and description text
- Textarea row count (14–18 suggested)
- Optional character count display below textarea
- Loading/skeleton state when template data is loading

## Deferred Ideas

- Markdown variant for Slack/Discord — v1.5
- Per-estimate template override — future
- Direct SMS/WhatsApp send integration — out of scope
