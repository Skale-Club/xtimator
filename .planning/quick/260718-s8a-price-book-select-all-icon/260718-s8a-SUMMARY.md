---
phase: quick-260718-s8a
status: complete
date: 2026-07-18
commit: ac218e05
files_modified:
  - components/price-book/price-book-list.tsx
  - tests/unit/price-book/price-book-list.test.tsx
---

# Summary: Category select-all is a ListChecks icon button

## What changed

- **price-book-list.tsx**: the category-header select-all control is no longer a Radix Checkbox (which read as a confusing empty box next to the pencil/trash icons — user screenshot) but a ghost icon Button (`h-6 w-6`, same sizing as its neighbors) with the lucide `ListChecks` icon. Behavior: click selects every VISIBLE (search-filtered) item of the category; when all are already selected, click deselects them; a partial selection completes to all (never deselects). State is visible through color (`text-muted-foreground` when nothing selected → `text-primary` when some/all), `aria-pressed`, and a `title` tooltip that flips between "Select all" / "Deselect all" (t()-wrapped, live-translate fallback). Same `data-testid="select-all-folder-*"` and `aria-label` kept, so every existing t7d/d2f test passes unchanged. Per-row checkboxes left of item names are untouched (user explicitly keeps them).
- **tests**: new describe with 3 tests — control is a BUTTON with the Select all label/title; click-click toggles (2 selected → bulk bar gone, aria-pressed/title flip); partial selection + click completes to "2 selected".

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean
- `tests/unit/price-book/` — 55/55 green (5 files): 3 new s8a tests + all existing select-all/bulk/dual-function tests unchanged
- Live browser check skipped: price-book is auth-gated and a second `next dev` dies on the shared `.next` dir while another chat's server holds it (same blockers as d2f/h4l); the behavior is fully covered by component tests.
