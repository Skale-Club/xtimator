---
phase: 93
slug: super-admin-event-log
review_date: 2026-05-29
baseline: 93-UI-SPEC.md (approved, 6/6 dimensions PASS)
screenshots: not captured (no dev server detected)
overall_score: 21/24
blockers_resolved: true
resolved_at: 2026-05-30
resolved_in: c2b30b1
---

# Phase 93 — UI Review

> **Resolution (2026-05-30, commit `c2b30b1`):** All 3 blockers fixed —
> (1) filter-scoped count labels + timeline "Provider" label wrapped in `<T>` (D-10 i18n);
> (2) "Failed at step" now names `events.find(status==='failed')` instead of the last event;
> (3) both empty states now render the `<EmptyState>` component (icon + body copy + Clear-filters link).
> Polish nits (full-mono h1, space-y-6→8, search aria-label, ad-hoc Badge span) left as non-blocking follow-ups.
> `tsc` clean; 62/62 admin tests green post-fix.

**Audited:** 2026-05-29
**Baseline:** 93-UI-SPEC.md (approved design contract)
**Screenshots:** not captured (no dev server at localhost:3000 / 5173 / 8080 — code-only audit)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | 4 hardcoded EN strings not i18n'd; empty-state body copy omitted; "Provider" label raw |
| 2. Visuals | 3/4 | EmptyState component bypassed for inline `<td>` text; `input_type` uses ad-hoc span not Badge; detail h1 full-mono diverges from sibling pattern |
| 3. Color | 4/4 | Status color map implemented exactly per spec; no hardcoded hex/rgb; accent used only on specified elements |
| 4. Typography | 4/4 | Exactly 3 font sizes (xs/sm/lg + clamp h1); 2 declared weights plus font-mono for identifiers; matches spec to the letter |
| 5. Spacing | 4/4 | All values are Tailwind scale multiples; only permitted arbitrary values are fixed-width Select triggers; no rogue rem/px literals |
| 6. Experience Design | 3/4 | No loading.tsx at events route level; "Failed at step" references last event not first-failed event; no Suspense fallback on EventsControls inside page |

**Overall: 21/24**

---

## Top 3 Priority Fixes

1. **Hardcoded count-summary strings (page.tsx L119-123)** — These three strings (`'succeeded'`, `'failed'`, `'in progress'`) are raw JSX string literals, bypassing `<T>`, making the counts summary untranslatable. Impact: PT-BR and ES operators see English status words inline with translated surrounding text — a jarring i18n break on the most-read section of the page. Fix: wrap each label in `<T>`: `<T>succeeded</T>`, `<T>failed</T>`, `<T>in progress</T>`, and add the keys to the translation catalogue.

2. **"Failed at step" uses last event, not the first-failed event (event-step-timeline.tsx L77-80)** — `events[events.length - 1]` is the chronologically last step. In a multi-step attempt where step 2 fails but step 3 is then retried with status `started`, the header will show "Failed at step: step3" (the last row) rather than "Failed at step: step2" (the actual failure). The operator is directed to the wrong step. Fix: replace with `events.find(e => e.status === 'failed')?.step` so the label always names the first-failing step.

3. **EmptyState component not used — body copy and icon dropped (page.tsx L151-160)** — The spec mandates the `EmptyState` component (`components/dashboard/empty-state.tsx`) with `onClearFilter` prop for the no-results state and a full icon+heading+body for the zero-data state. The implementation renders a single-line `<td>` with only the heading text — the body copy ("Recording and estimate attempts will appear here as the pipeline runs. Nothing has been recorded so far."), the `ScrollText` icon, the `Search` icon for no-results, and the "Clear filters" button are all missing. Impact: operators get no guidance on zero-data vs filtered-out states and cannot clear filters inline. Fix: replace the inline `<td>` block with `<EmptyState>` rendered outside the table or in a colSpan row, wiring the `onClearFilter` callback via a client wrapper.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**BLOCKERS (i18n contract violations — D-10):**

- `app/admin/events/page.tsx` L119, L121, L123: The counts-summary line embeds three raw JSX string literals — `{'succeeded'}`, `{'failed'}`, `{'in progress'}` — that are not wrapped in `<T>` or passed through `t()`. The surrounding numeric spans and separators are server-rendered inside a Server Component, so `<T>` is the correct wrapper. Every other string on this page is correctly wrapped; these three are the only misses.

- `components/admin/event-step-timeline.tsx` L130: `<span>Provider {ev.provider}</span>` — the label "Provider" is a bare string literal. `Duration` and `Retries` on lines 131 and 133 are correctly wrapped in `<T>`. Fix: `<span><T>Provider</T> {ev.provider}</span>`.

**Polish nits:**

- The spec copywriting contract lists `{n} succeeded · {n} failed · {n} in progress` as the count format. The implementation produces the correct EN output but will not translate. Low code-change risk to fix.
- Empty-state body copy omitted entirely (see Pillar 6 for full discussion). The heading text itself is correctly translated via `<T>`.
- `page.tsx` L205: Pagination indicator uses `<T text={`Page ${page} of ${totalPages}`} />`. The spec specified `Page {n}` (without "of N"), but the extended format is more informative and consistent with standard conventions. Not a contract violation — acceptable deviation.
- "View →" (page.tsx L183) is translated but the spec does not list it explicitly. It is an operator-facing affordance and its i18n wrapper is correct.
- `admin-nav.tsx` L25: `label: 'Event Log'` is a bare string. Nav labels are rendered via `t(label)` in the template (L67: `{t(label)}`), so this is correctly i18n'd at render time. No issue.

---

### Pillar 2: Visuals (3/4)

**BLOCKERS:**

- **EmptyState component not used.** The spec explicitly lists `EmptyState` from `components/dashboard/empty-state.tsx` in the Reuse inventory with the `onClearFilter` prop. Both the zero-data and no-results states are rendered as a bare `<td>` with one line of text. The zero-data state omits: the gradient-brand icon circle, the description body, and visual hierarchy. The no-results state omits: the `Search` icon, the description body, and the "Clear filters" button. The sibling `companies/page.tsx` also uses an inline `<td>` for its empty state (consistent precedent), but the spec for Phase 93 explicitly elevated the requirement by naming `EmptyState onClearFilter` as a required primitive. This is the clearest visual regression from the spec.

- **`input_type` tag in timeline header uses ad-hoc `<span>` not `<Badge>`** (event-step-timeline.tsx L68): `<span className="rounded-full bg-muted px-2 py-0.5 text-xs">`. The spec's Reuse inventory lists `Badge` for "input_type / step tags" and the header spec says "input_type Badge". The ad-hoc span renders visually similar but does not reuse the `Badge` component as contracted.

**Polish nits:**

- **Detail page h1 applies `font-mono` to the full heading** (`[attemptId]/page.tsx` L42: `font-mono` on the `<h1>` element). The sibling pattern `companies/[id]/page.tsx` uses `font-semibold` only on the `<h1>` and applies `font-mono text-xs` only to the ID span inside the subhead (L63). The spec says "Attempt {short-id} (mono)" — meaning the mono treatment applies to the id part, not the word "Attempt". Operator impact is low (the id IS short and the whole title reads fine), but it deviates from the sibling pattern where heading text is Inter sans-serif and IDs are explicitly mono-differentiated.

- **Back-link uses `text-sm` while sibling uses `text-xs`** (`[attemptId]/page.tsx` L36 vs `companies/[id]/page.tsx` L52). Minor but inconsistent with the established pattern. Additionally the sibling uses `inline-flex` while this uses `flex` — functionally identical but worth aligning for consistency.

- **"Failed at step" references last event not first-failed event** (see Top 3 Fix #2). Visual consequence: the header may name the wrong step in multi-step-failure scenarios.

- Visual hierarchy of the list page (title block → controls → table → pagination in `space-y-8`) matches the spec exactly. The table header style (`bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground`) is verbatim from the spec and matches `companies/page.tsx`. Row hover `hover:bg-muted/20` consistent with sibling.

---

### Pillar 3: Color (4/4)

The color contract is implemented correctly and precisely:

- Status color map follows the spec exactly: `succeeded → bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]`, `failed → bg-[hsl(var(--danger)/0.15)] text-[hsl(var(--danger))]`, `started → bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]`. This is the TierBadge idiom bound to semantic status tokens, exactly as specified.
- Timeline left-rail dot colors (`bg-[hsl(var(--success))]`, `bg-[hsl(var(--danger))]`, `bg-[hsl(var(--warning))]`) match the spec's dot color table.
- Error block background `bg-[hsl(var(--danger)/0.08)]` is within the spec's `--danger` semantic token family.
- Accent (`--primary`) appears only on: deep-link "View →" (L181 `text-[hsl(var(--primary))]`), pagination links (L198, L207). Both are in the spec's reserved list. No accent used on status, decorative borders, or generic text.
- No hardcoded hex or rgb values found in any Phase 93 file.
- Counts summary uses semantic tokens for the numeric figures (`text-[hsl(var(--success))]`, `text-[hsl(var(--danger))]`, `text-[hsl(var(--warning))]`) — correct per spec.
- `input_type` tag uses `bg-muted` (neutral) — correct; it is not a status signal so it does not use the status palette.

---

### Pillar 4: Typography (4/4)

Font size distribution across all Phase 93 files (page.tsx, events-controls.tsx, event-step-timeline.tsx, [attemptId]/page.tsx):

| Size | Count | Role |
|------|-------|------|
| `text-[clamp(28px,3.5vw,40px)]` | 2 | Page h1 (list + detail) |
| `text-lg` | 1 | "Step timeline" section h2 |
| `text-sm` | 13 | Body text, controls, step name |
| `text-xs` | 20 | Table cells, meta, timestamps, badges, IDs |

This is exactly 4 roles (clamp heading + lg + sm + xs) — the spec's declared typography scale. No additional sizes introduced.

Font weights: `font-semibold` (h1, step name in timeline), `font-medium` (table headers, badge labels, count figures), `font-mono` (all opaque identifiers). The `font-medium` occurrences come from within existing primitives (`Badge`, table header pattern) which the spec explicitly permits as a "third" weight from primitives. No new weight declarations on authored content.

Monospace application: `attempt_id` (truncated, L164), `step_reached` (L171), `total_duration_ms` (L175), `user_id` / `company_id` / `project_id` / `estimate_id` slices in timeline header, `error_code` in error block, `created_at` timestamp in step card. Every opaque identifier is correctly tagged `font-mono text-xs`. Table header style `text-xs uppercase tracking-wide text-muted-foreground font-medium` is verbatim from the spec (mirroring `companies/page.tsx` L55).

No typography issues.

---

### Pillar 5: Spacing (4/4)

Spacing values across Phase 93 files:

| Class | Count | Maps to |
|-------|-------|---------|
| `px-4 py-3` | dominant | Table cells — matches spec "md" token |
| `px-2 py-0.5` | badge/pill padding | matches spec "sm/xs" token |
| `gap-2` | 4 | Controls row — matches spec "sm" token |
| `gap-6` | 1 | Timeline step gap — matches spec "lg" token |
| `space-y-8` | 2 | Page section stack — matches spec "xl" token |
| `space-y-2/4/6` | stack variations | Within cards — within spec range |
| `p-6` | timeline header card | matches spec "p-6 space-y-4" for header card |
| `p-4` | step cards | matches spec "p-4 space-y-2" for step cards |

Arbitrary values: `min-w-[200px]`, `w-[130px]`, `w-[140px]`, `w-[170px]` in events-controls.tsx for the search input minimum width and Select trigger fixed widths. These are fixed-width sizing constraints for form controls — not spacing tokens — and are standard practice for `Select` triggers (the spec does not prescribe fixed Select widths). No arbitrary spacing values (e.g., `[17px]`, `[1.3rem]`) found.

Detail page root uses `space-y-6` (L32 of `[attemptId]/page.tsx`) rather than `space-y-8`. The spec says "page root container: `className='space-y-8'`" for the section stack. The detail page has only three direct children (back-link, h1, EventStepTimeline) and `EventStepTimeline` itself opens with `space-y-8` internally, so the visual rhythm is correct even with the tighter outer gap. The sibling `companies/[id]/page.tsx` uses `space-y-8` for its root. This is a minor spec deviation at low visual impact — scored in Pillar 2 (Visuals consistency), not as a spacing token violation.

No non-standard spacing tokens introduced. All values are Tailwind 4px-base multiples.

---

### Pillar 6: Experience Design (3/4)

**BLOCKERS:**

- **No `loading.tsx` at the events route level.** The admin shell has `app/admin/loading.tsx` which provides a Skeleton fallback for the admin root. However there is no `app/admin/events/loading.tsx` or `app/admin/events/[attemptId]/loading.tsx`. For a data-heavy page that runs server-side search + 4 concurrent count queries, a per-route loading UI is the correct UX pattern. The spec's sibling references (`companies/page.tsx`) similarly lack their own `loading.tsx` — so this is a consistent gap in the admin area, not unique to Phase 93. Severity: medium (users see a blank white space during navigation rather than a skeleton).

- **"Failed at step" uses `events[events.length - 1].step` instead of the first-failed step.** (event-step-timeline.tsx L77.) When events are ordered ASC and more than one step exists, the last step in the array is the chronologically final step — which may not be the step that failed. Correct logic: `events.find(e => e.status === 'failed')?.step`. In the common case where only one step fails and it is the last, this produces the same output and the bug is invisible. In retry or multi-step scenarios it will mislead the operator. This is an interaction correctness issue (the diagnostic UI gives wrong data in some failure modes).

**Interaction/affordance correct:**

- Search input: Enter key and blur both fire `pushParam('q', ...)`. Leading `Search` icon correctly placed with `absolute left-3 top-1/2 -translate-y-1/2` and `pl-8` offset on Input. Pattern matches `data-table.tsx` reference.
- Three Select filters with correct option sets. All fire `pushParam()` on change, reset `page` to 1. All `placeholder` values are `t()`-wrapped.
- Refresh button: `variant="outline" size="sm"` with `RefreshCw` icon, `ml-auto` right-aligned — matches spec Discretion #3 exactly. `router.refresh()` called on click.
- Back-link navigation: ChevronLeft icon + "All attempts" text, correct `href="/admin/events"` — functional deep-link pattern mirrors `companies/[id]`.
- `notFound()` guard on the detail page prevents blank renders for invalid `attemptId` values.
- `useSearchParams()` in `EventsControls` is safe: `app/admin/layout.tsx` wraps all admin children in `<Suspense>` (L57), which satisfies the Next.js 14 App Router requirement for client components using `useSearchParams`. No additional Suspense needed at the page level.

**WCAG / accessibility:**

- Status conveyed by BOTH color AND text label in all pills (the status word is always rendered inside the pill span) — WCAG 1.4.1 satisfied.
- Left-rail dots and connector lines carry `aria-hidden="true"` — correct, decorative elements do not pollute screen-reader tree.
- `AdminNav` has `aria-label` for the nav element. Active nav item has `aria-current="page"`.
- Search `Input` has no `aria-label` or associated `<label>` — it relies solely on the `placeholder` attribute. A `placeholder` alone is not a sufficient ARIA label (it disappears on input). Recommendation: add `aria-label={t('Search attempts')}` to the `Input` or wrap in a visually-hidden `<label>`. Low severity for an operator-only surface.
- Select triggers rely on Radix UI's accessible Select implementation (role="combobox", aria-expanded, etc.) — no additional a11y work needed.

---

## Registry Safety

shadcn initialized (`components.json` present). UI-SPEC.md Registry Safety table declares no third-party registries — all blocks are shadcn official, pre-existing, locally vendored. Registry vetting gate: not triggered. No third-party blocks to audit.

---

## Files Audited

| File | Role |
|------|------|
| `app/admin/events/page.tsx` | List page (Server Component) |
| `app/admin/events/[attemptId]/page.tsx` | Detail page (Server Component) |
| `app/admin/events/events-controls.tsx` | Client controls (search / filter / refresh) |
| `components/admin/event-step-timeline.tsx` | Net-new timeline component |
| `components/admin/admin-nav.tsx` | Nav integration |
| `lib/admin/events-helpers.ts` | SafeEvent type, search OR builder, terminalStatus, formatDuration |
| `app/admin/companies/page.tsx` | Sibling reference — list pattern |
| `app/admin/companies/[id]/page.tsx` | Sibling reference — detail/back-link pattern |
| `app/admin/billing/billing-table.tsx` | Sibling reference — TierBadge idiom |
| `components/dashboard/empty-state.tsx` | Required primitive (not used in Phase 93) |
| `app/admin/layout.tsx` | Admin shell — Suspense gate, data-theme scope |
| `.planning/phases/93-super-admin-event-log/93-UI-SPEC.md` | Approved design contract |
| `.planning/phases/93-super-admin-event-log/93-CONTEXT.md` | D-01..D-10 decisions |
