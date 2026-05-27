---
phase: quick-260527-jhp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/utils/format-date.ts
  - components/workspace/project-metadata-strip.tsx
  - components/projects/project-table.tsx
  - components/dashboard/project-card.tsx
  - components/dashboard/project-table-row.tsx
  - components/notifications/NotificationList.tsx
  - components/notifications/notification-item.tsx
  - lib/utils/relative-time.ts
autonomous: true
requirements: [FIX-REACT418]

must_haves:
  truths:
    - "Project workspace page (renders ProjectMetadataStrip) hydrates with no React #418 error"
    - "Dashboard project list, project tables, and /notifications page hydrate with no React #418 error"
    - "Budget, created date, and 'Paid …' labels render identically (en-US/UTC) to a US user before and after this fix"
    - "Relative-time output ('just now', 'Nm ago', date fallback) produces the same string on the server and on the first client render"
  artifacts:
    - path: "lib/utils/format-date.ts"
      provides: "Shared hydration-safe date formatter pinned to en-US + UTC timezone"
      exports: ["formatDate"]
    - path: "components/workspace/project-metadata-strip.tsx"
      provides: "Budget via formatMoney (USD) + created date via shared formatDate"
    - path: "lib/utils/relative-time.ts"
      provides: "Hydration-safe relative-time helper with pinned-locale date fallback"
  key_links:
    - from: "components/workspace/project-metadata-strip.tsx"
      to: "lib/utils/format-date.ts + lib/money/currency.ts"
      via: "import formatDate + formatMoney"
      pattern: "formatDate|formatMoney"
    - from: "components/notifications/NotificationList.tsx"
      to: "lib/utils/format-date.ts"
      via: "import formatDate for date fallback + mounted guard for relative output"
      pattern: "formatDate"
---

<objective>
Fix React minified error #418 (hydration text mismatch) on SSR-rendered `'use client'` components. The mismatch comes from locale/timezone-dependent text computed during render: locale-less `toLocaleString()` / `toLocaleDateString()` (server "1,000" vs client "1.000", or different month/day near midnight) and `Date.now()`-based relative time (server computes one value, client another).

Purpose: Eliminate the runtime crash users hit on the project workspace page and harden the other confirmed offending call sites so SSR markup matches first client render exactly.

Output:
- New shared helper `lib/utils/format-date.ts` (`formatDate`) pinning locale to `en-US` and `timeZone: 'UTC'`.
- All confirmed offending date/money/relative-time call sites routed through hydration-safe formatting.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<diagnosis>
Root cause is CONFIRMED (do NOT re-investigate). React #418 = hydration text mismatch.
Offending call sites:
1. components/workspace/project-metadata-strip.tsx:26 — `` `$${Number(project.target_budget).toLocaleString()}` `` (no locale)
2. components/workspace/project-metadata-strip.tsx:28 — `new Date(project.created_at).toLocaleDateString()` (no locale/timeZone)
3. components/dashboard/project-table-row.tsx:23 — `` `Paid ${new Date(project.paid_at).toLocaleDateString()}` `` (no locale)
4. components/dashboard/project-card.tsx:28 — same "Paid …" pattern (no locale)
5. components/projects/project-table.tsx:51 — `title={... new Date(project.paid_at).toLocaleDateString() ...}` (no locale)
6. components/dashboard/project-table-row.tsx:46, project-card.tsx:43, projects/project-table.tsx:162 & :295 — pass 'en-US' but rely on runtime timezone (drift near midnight) → add explicit timeZone via shared helper
7. components/notifications/NotificationList.tsx:182-191 `formatRelative` — Date.now()-based + locale-less fallback
8. components/notifications/notification-item.tsx:12-21 `relativeTime` — same Date.now() + locale-less fallback
9. lib/utils/relative-time.ts:1-24 — Date.now() + locale-less fallback

OUT OF SCOPE — do NOT touch: zustand "Default export is deprecated" warning (transitive dep, harmless), and the billing page server-component formatDate (app/(app)/settings/billing/page.tsx — server-only render, not a client hydration boundary).
</diagnosis>

<existing-correct-patterns>
@lib/money/currency.ts
- `formatMoney(value, currencyCode, {minimumFractionDigits, maximumFractionDigits})` — Intl.NumberFormat with PINNED per-currency locale (USD → en-US). Hydration-safe.
- `formatMoneyNumber(value, currencyCode)` — same, no currency symbol.
- `DEFAULT_CURRENCY_CODE = 'USD'`

Reference date formatters (already pass an explicit locale — mirror these):
- components/workspace/estimate/estimate-document.tsx:326-333 `formatDate(dateStr, lang)` → toLocaleDateString(locale, {year:'numeric', month:'long', day:'numeric'})
- components/pdf/estimate-pdf.tsx:191-198 `formatDate(dateStr, locale='en-US')` → same options
</existing-correct-patterns>

<interfaces>
From lib/money/currency.ts:
```typescript
export const DEFAULT_CURRENCY_CODE = 'USD'
export function formatMoney(
  value: number | null | undefined,
  currencyCode: unknown,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string
export function formatMoneyNumber(value: number | null | undefined, currencyCode: unknown): string
```

From lib/queries/project.ts — ProjectDetail has NO `currency_code` field:
```typescript
export interface ProjectDetail {
  id: string; company_id: string; name: string;
  project_type: string | null; status: string;
  target_budget: number | null; total: number; created_at: string;
  client: { id: string; name: string; email: string | null; phone: string | null } | null
}
```
→ For budget in project-metadata-strip, use DEFAULT_CURRENCY_CODE (no currency_code available).

Existing date call-site display shapes to preserve:
- project-metadata-strip created date: currently `toLocaleDateString()` with no options → US default "5/27/2026" style. Keep numeric short form.
- dashboard/project list dates: `{ month: 'short', day: 'numeric', year: 'numeric' }` → "May 27, 2026". Preserve.
- "Paid …" tooltip: currently locale-less default → US numeric "5/27/2026". Preserve numeric short form.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create shared hydration-safe date helper</name>
  <files>lib/utils/format-date.ts, tests/unit/utils/format-date.test.ts</files>
  <behavior>
    - formatDate('2026-05-27T00:00:00.000Z') → returns a string identical across runtime timezones (UTC-pinned), e.g. "5/27/2026" with default numeric options.
    - formatDate('2026-05-27T00:00:00.000Z', { month: 'short', day: 'numeric', year: 'numeric' }) → "May 27, 2026".
    - formatDate of a near-midnight UTC instant returns the SAME calendar date regardless of the host TZ env (assert by formatting one fixed ISO and checking it equals the en-US/UTC expected string — TZ-independent because timeZone:'UTC' is pinned).
    - formatDate('not-a-date') → returns '' (does not throw).
  </behavior>
  <action>
Create `lib/utils/format-date.ts` exporting a single pure function:

```typescript
const FIXED_LOCALE = 'en-US'

/**
 * Hydration-safe date formatter. Pins locale to en-US and timeZone to UTC so
 * the server-rendered string and the first client render are always identical
 * (prevents React #418 hydration text mismatch). Mirror of the pinned-locale
 * pattern in lib/money/currency.ts.
 */
export function formatDate(
  iso: string | number | Date,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric' },
): string {
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(FIXED_LOCALE, { timeZone: 'UTC', ...options }).format(d)
}
```

Notes:
- Default options reproduce the locale-less `toLocaleDateString()` US numeric shape ("5/27/2026") used by project-metadata-strip and the "Paid …" tooltips.
- Callers wanting the "May 27, 2026" shape pass `{ month: 'short', day: 'numeric', year: 'numeric' }`.
- Invalid input returns '' (matches the existing relative-time guards which return '' on NaN).
- Do NOT add a `lang`/locale parameter — locale is intentionally fixed for hydration safety. The estimate-document/estimate-pdf formatters keep their own multi-locale formatters; this helper is only for the hydration-sensitive chrome/list/notification surfaces.

Write `tests/unit/utils/format-date.test.ts` covering the four behaviors above. Import `expect` explicitly from 'vitest' (project convention — tsc fails on globals). Assert against fixed expected strings ("5/27/2026", "May 27, 2026", "") so the test is timezone-independent by construction.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/utils/format-date.test.ts</automated>
  </verify>
  <done>format-date.ts exports formatDate; all four behavior tests pass; tsc has no error for the new file.</done>
</task>

<task type="auto">
  <name>Task 2: Route money + date call sites through hydration-safe formatters</name>
  <files>components/workspace/project-metadata-strip.tsx, components/projects/project-table.tsx, components/dashboard/project-card.tsx, components/dashboard/project-table-row.tsx</files>
  <action>
Replace every locale/timezone-dependent format with a pinned formatter. Preserve the exact en-US/UTC visual output a US user sees today.

**components/workspace/project-metadata-strip.tsx**
- Add imports: `import { formatMoney, DEFAULT_CURRENCY_CODE } from '@/lib/money/currency'` and `import { formatDate } from '@/lib/utils/format-date'`.
- Line ~25-26 budgetLabel: replace
  `` `$${Number(project.target_budget).toLocaleString()}` ``
  with `formatMoney(Number(project.target_budget), DEFAULT_CURRENCY_CODE, { minimumFractionDigits: 0, maximumFractionDigits: 0 })`.
  This yields "$1,000" (symbol + comma grouping, no decimals) — matches the current "$" prefix + grouped output. Keep the `project.target_budget ? ... : null` guard. ProjectDetail has no currency_code, so DEFAULT_CURRENCY_CODE is correct.
- Line ~28 createdLabel: replace `new Date(project.created_at).toLocaleDateString()` with `formatDate(project.created_at)` (default numeric options → "5/27/2026").

**components/dashboard/project-card.tsx**
- Add `import { formatDate } from '@/lib/utils/format-date'`.
- Line ~28 "Paid …" tooltip: replace `new Date(project.paid_at).toLocaleDateString()` with `formatDate(project.paid_at)`.
- Line ~43 created date: replace `new Date(project.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })` with `formatDate(project.created_at, { month: 'short', day: 'numeric', year: 'numeric' })`.

**components/dashboard/project-table-row.tsx**
- Add `import { formatDate } from '@/lib/utils/format-date'`.
- Line ~23 "Paid …" tooltip: replace `new Date(project.paid_at).toLocaleDateString()` with `formatDate(project.paid_at)`.
- Line ~46 created date: replace the `toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })` with `formatDate(project.created_at, { month: 'short', day: 'numeric', year: 'numeric' })`.

**components/projects/project-table.tsx**
- Add `import { formatDate } from '@/lib/utils/format-date'`.
- Line ~51 ProjectPaidBadge tooltip: replace `new Date(project.paid_at).toLocaleDateString()` with `formatDate(project.paid_at)`.
- Line ~162 'date' column cell: replace `new Date(project.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })` with `formatDate(project.created_at, { month: 'short', day: 'numeric', year: 'numeric' })`.
- Line ~295 ProjectTableCard created date: same replacement as line 162.
- Leave the `formatMoney(...)` total cells untouched — they are already hydration-safe.
- Do NOT change the sort comparators that use `new Date(...).getTime()` — `getTime()` is timezone/locale-independent and never rendered, so it cannot cause a text mismatch.

Verify no remaining locale-less or runtime-timezone `toLocaleDateString` / `toLocaleString` calls remain in these four files.
  </action>
  <verify>
    <automated>npx tsc --noEmit; npx eslint components/workspace/project-metadata-strip.tsx components/projects/project-table.tsx components/dashboard/project-card.tsx components/dashboard/project-table-row.tsx</automated>
  </verify>
  <done>All four files import and use formatDate/formatMoney; no locale-less toLocale* calls remain; tsc clean; en-US output unchanged ($1,000 / "5/27/2026" / "May 27, 2026").</done>
</task>

<task type="auto">
  <name>Task 3: Make relative-time helpers hydration-safe</name>
  <files>lib/utils/relative-time.ts, components/notifications/NotificationList.tsx, components/notifications/notification-item.tsx</files>
  <action>
Two problems to fix in each relative-time helper: (a) the locale-less `toLocaleDateString()` fallback, and (b) the `Date.now()`-based relative value that differs between SSR and first client render.

**lib/utils/relative-time.ts**
- Add `import { formatDate } from '@/lib/utils/format-date'`.
- Replace the final `return new Date(dateString).toLocaleDateString()` with `return formatDate(dateString)` (pinned locale/timeZone). Keep all the relative bucket logic unchanged.
- This file is a pure helper; the SSR-vs-client `Date.now()` divergence is fixed at the render sites (below), not here.

**components/notifications/notification-item.tsx**
- This component renders inside the notification bell/panel which fetches client-side (useState([]) then fetch in useEffect) — items do NOT SSR here. Still harden for correctness and the /notifications surface:
- Add `import { formatDate } from '@/lib/utils/format-date'`.
- In `relativeTime`, replace `return new Date(iso).toLocaleDateString()` with `return formatDate(iso)`. Leave the Date.now() buckets as-is (no SSR for this surface).

**components/notifications/NotificationList.tsx**  (this DOES SSR real items on /notifications)
- Add `import { formatDate } from '@/lib/utils/format-date'` and `import { useEffect, useState } from 'react'` (extend existing react import — file already imports useMemo/useState/useTransition).
- In `formatRelative`, replace `return new Date(iso).toLocaleDateString()` with `return formatDate(iso)`.
- Make the Date.now()-based output hydration-safe with a mounted guard so the first client render matches SSR exactly. Implement the lightest correct approach:
  - Add a module-scope or component-level mounted flag using `const [mounted, setMounted] = useState(false)` in NotificationList and `useEffect(() => setMounted(true), [])`. Pass `mounted` down to each `NotificationRow`.
  - In `NotificationRow`, render the `<time>` element with `suppressHydrationWarning` AND render a stable, time-independent value on the server / first paint, upgrading to the relative value after mount:
    ```tsx
    <time className="..." dateTime={row.created_at} suppressHydrationWarning>
      {mounted ? formatRelative(row.created_at) : formatDate(row.created_at)}
    </time>
    ```
    The SSR + first-client value is `formatDate(row.created_at)` (deterministic, pinned). After mount, it upgrades to the live relative string ("3m ago"). `suppressHydrationWarning` covers the intentional post-mount text swap.
  - Thread `mounted` through: `NotificationList` maps items → `<NotificationRow key={n.id} row={n} mounted={mounted} />`; update the `NotificationRow` signature to `({ row, mounted }: { row: NotificationRow; mounted: boolean })`.
- Do not change filtering/search/loadMore logic.

CONSTRAINT: TypeScript strict must compile. Keep visual output for an active user identical (after mount they still see "3m ago" etc.).
  </action>
  <verify>
    <automated>npx tsc --noEmit; npx vitest run tests/unit/notifications/notifications-page.test.tsx tests/unit/notifications/notification-bell.test.tsx</automated>
  </verify>
  <done>relative-time.ts, notification-item.tsx, NotificationList.tsx use formatDate for date fallback; NotificationList renders a deterministic value on SSR/first paint then upgrades after mount with suppressHydrationWarning; tsc clean; existing notification tests still pass.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` is clean (TypeScript strict).
- `npx vitest run tests/unit/utils/format-date.test.ts tests/unit/notifications/` passes.
- Manual: load the project workspace page and /notifications in the browser dev build with React in development mode — no hydration warning in console; rendered budget/date/relative strings look identical to before for a US (en-US/UTC) user.
- Grep confirms zero remaining locale-less `toLocaleDateString()` / `toLocaleString()` calls in the eight touched files (the sort comparators using `.getTime()` are intentionally retained).
</verification>

<success_criteria>
- React #418 no longer fires on the project workspace page or /notifications (the confirmed crash surfaces).
- A single shared `formatDate` helper (en-US + UTC pinned) is the home for hydration-safe date formatting; the budget uses `formatMoney`.
- SSR markup and first client render produce byte-identical text for all eight touched call sites.
- Existing en-US/UTC visual output is preserved ($1,000 / "5/27/2026" / "May 27, 2026").
- No out-of-scope changes (zustand warning untouched; billing server page untouched).
</success_criteria>

<output>
After completion, create `.planning/quick/260527-jhp-fix-react-418-hydration-text-mismatch-fr/260527-jhp-SUMMARY.md`
</output>
