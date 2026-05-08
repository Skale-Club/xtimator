# Phase 25: Plain Text Tab + Copy UI - Research

**Researched:** 2026-05-08
**Domain:** React client component, clipboard API, pure string utility, props threading
**Confidence:** HIGH

## Summary

Phase 25 delivers a Plain Text card in the Send tab of the project workspace. All the building blocks exist in the codebase and have been deliberately prepared by Phase 24: `resolveTemplate()` is live in `lib/utils/estimate-template.ts`, the 4 template columns are on the `companies` table, and `formatCurrency` is available in `lib/utils/format.ts`. This phase is an assembly and wiring task, not a research-heavy one.

The three new pieces of work are: (1) adding `buildItemsBreakdown(estimate)` to the existing template utility, (2) creating `PlainTextCard` as a new `'use client'` component, and (3) threading company template data from the server component page through `ProjectWorkspace` and `SendTab`. The copy pattern (`navigator.clipboard.writeText` + `setCopied` + `setTimeout(2000)` + `toast.success`) is already established verbatim in `estimate-preview.tsx`. The Tooltip wrapper for the Reset button follows the pattern established in `estimate-tab.tsx`.

The only mildly tricky concern is prop threading: the workspace page currently selects only `name` from the companies table for the Send tab. This must be extended to also select `owner_name` and the four `estimate_template_*` columns, then passed down through `ProjectWorkspace` → `SendTab` → `PlainTextCard`. A test covering `buildItemsBreakdown` must be added to the existing `tests/unit/utils/estimate-template.test.ts` file.

**Primary recommendation:** Implement in two plans — Plan 01 adds `buildItemsBreakdown` + unit tests + prop threading + `PlainTextCard` component; Plan 02 wires the component into `SendTab` and `ProjectWorkspace` with integration smoke checks.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Placement** — Full-width card in Send tab (`components/workspace/send/send-tab.tsx`), below the existing 2-column grid. No structural changes to `EstimatePreview`. Component: `components/workspace/send/plain-text-card.tsx`.
- **D-02: Items Breakdown Format** — Section header as `[Section Title]`, one item per line `Item description: $120`, one blank line between sections. `buildItemsBreakdown(estimate)` added to `lib/utils/estimate-template.ts`. Prices via `formatCurrency` from `lib/utils/format.ts`.
- **D-03: Reset Button** — `RotateCcw` icon (lucide-react), no confirmation modal, tooltip "Reset to generated text". Reverts textarea to `resolveTemplate()` output.
- **D-04: Copy Behavior** — `navigator.clipboard.writeText(text)`. `Copy` icon + label. After click: `Check` icon + "Copied!" for 2 seconds, `toast.success('Copied to clipboard!')`. On failure: `toast.error('Failed to copy')`.
- **D-05: Data Required** — `client_name` (project.client.name), `company_name` (workspace), `owner_name` (extend company select), `total` (formatCurrency(currentEstimate.total)), `items_breakdown` (buildItemsBreakdown), template fields (extend company select). Workspace page company query must add `owner_name` + 4 `estimate_template_*` columns.
- **D-06: Empty State** — If `currentEstimate` is null: muted text "Generate an estimate first — then come back here to copy the plain text version." Same pattern as SendTab empty state.

### Claude's Discretion

- Card header wording: "Plain Text" or "Copy as Text"
- Card description: "Ready to paste into WhatsApp, SMS, or email" (suggested)
- Textarea rows: 14–18 rows
- Character count below textarea (nice-to-have)
- Loading skeleton if template data is loading

### Deferred Ideas (OUT OF SCOPE)

- Markdown variant (`**bold**` for Slack/Discord) — v1.5
- Per-estimate template override — future
- Character count display — Claude's discretion only
- Direct SMS/WhatsApp send integration — explicitly out of scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAINTEXT-01 | User sees the estimate in plain-text format in a "Plain Text" area in the Send tab | PlainTextCard component renders `resolveTemplate()` output in a `<Textarea>` within a `Card` below the Send tab's 2-column grid |
| PLAINTEXT-02 | User copies the estimate text with 1 click; a confirmation toast appears | `navigator.clipboard.writeText()` + `setCopied` + `setTimeout(2000)` + `toast.success` — identical to `handleCopyShareLink` in `estimate-preview.tsx` |
| PLAINTEXT-04 | User can edit the generated text directly in the preview before copying (point override — does not alter the saved template) | `useState<string>` holding local text; `<Textarea>` is uncontrolled only by `resolveTemplate()` output at mount/reset; edits stay in local state and never call a server action |
</phase_requirements>

---

## Standard Stack

### Core (all already in the project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React `useState` | (Next.js 14 built-in) | Local editable text state in `PlainTextCard` | Established pattern for inline edits that don't persist |
| `navigator.clipboard.writeText()` | Web API | Clipboard copy | Same pattern as `estimate-preview.tsx` |
| lucide-react | already installed | `RotateCcw`, `Copy`, `Check` icons | Project-wide icon library |
| sonner `toast` | already installed | Copy confirmation and error toasts | Project-wide toast library |
| shadcn/ui `Textarea` | already installed | Editable preview area | Matches project UI system |
| shadcn/ui `Card`, `CardHeader`, `CardContent` | already installed | Card shell for PlainTextCard | Matches all Send-tab card patterns |
| shadcn/ui `Tooltip` / `TooltipProvider` / `TooltipTrigger` / `TooltipContent` | already installed | Reset button tooltip | Established in `estimate-tab.tsx` |

### No New Dependencies

No new `npm install` required. Everything needed is already present.

---

## Architecture Patterns

### Recommended File Structure

```
lib/utils/
└── estimate-template.ts        # EXTEND — add buildItemsBreakdown()

components/workspace/send/
├── plain-text-card.tsx         # NEW — 'use client', full PlainTextCard component
└── send-tab.tsx                # MODIFY — add PlainTextCard below 2-column grid; add new props

components/workspace/
└── project-workspace.tsx       # MODIFY — add estimateTemplate + ownerName props; pass to SendTab

app/(app)/projects/[id]/
└── page.tsx                    # MODIFY — extend company select query

tests/unit/utils/
└── estimate-template.test.ts   # EXTEND — add buildItemsBreakdown() test suite
```

### Pattern 1: buildItemsBreakdown Pure Utility

**What:** A pure function added to `lib/utils/estimate-template.ts` that converts `EstimateWithSections` into a formatted string block.

**When to use:** Called once in `PlainTextCard` to populate `TemplateData.items_breakdown` before passing to `resolveTemplate()`.

**Example:**
```typescript
// Source: CONTEXT.md D-02, SEED-004 reference output
import type { EstimateWithSections } from '@/lib/queries/estimate'
import { formatCurrency } from '@/lib/utils/format'

export function buildItemsBreakdown(estimate: EstimateWithSections): string {
  return estimate.sections
    .map((section) => {
      const header = `[${section.title}]`
      const items = section.items
        .map((item) => `${item.description}: ${formatCurrency(item.total)}`)
        .join('\n')
      return `${header}\n${items}`
    })
    .join('\n\n')
}
```

Expected output for SEED-004 example:
```
[Upholstery Cleaning]
King Mattress: $120.00

[Carpet Cleaning]
Small room: $85.00
```

### Pattern 2: PlainTextCard Component Structure

**What:** A `'use client'` component with local `useState` for the editable textarea, following the exact copy pattern from `estimate-preview.tsx`.

**Key state:**
```typescript
const [text, setText] = useState<string>(() => resolveTemplate(template, data))
const [copied, setCopied] = useState(false)
```

**Reset handler:**
```typescript
function handleReset() {
  setText(resolveTemplate(template, data))
}
```

**Copy handler (mirrors handleCopyShareLink exactly):**
```typescript
async function handleCopy() {
  try {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  } catch {
    toast.error('Failed to copy')
  }
}
```

### Pattern 3: Props Threading

The workspace page only selects `name` from companies today. The select must be extended:

```typescript
// app/(app)/projects/[id]/page.tsx — ProjectTabs function
const { data: company } = await supabase
  .from('companies')
  .select('name, owner_name, estimate_template_greeting, estimate_template_opener, estimate_template_closer, estimate_template_signature')
  .eq('id', project.company_id)
  .single()
```

Props chain:
```
ProjectTabs (server) → ProjectWorkspace → SendTab → PlainTextCard
```

New props added at each level:
- `ProjectWorkspace`: `ownerName: string`, `estimateTemplate: EstimateTemplate`
- `SendTab`: same two props, passed down
- `PlainTextCard`: `estimate: EstimateWithSections`, `clientName: string`, `companyName: string`, `ownerName: string`, `estimateTemplate: EstimateTemplate`

### Pattern 4: SendTab Structural Change

Current `SendTab` renders a `<div className="grid gap-6 lg:grid-cols-2">` with the two existing cards. The new PlainTextCard goes below that grid, not inside it:

```tsx
// send-tab.tsx
return (
  <div className="space-y-6">
    <div className="grid gap-6 lg:grid-cols-2">
      <EstimatePreview ... />
      <SendForm ... />
    </div>
    <PlainTextCard
      estimate={estimate}
      clientName={clientName}
      companyName={companyName}
      ownerName={ownerName}
      estimateTemplate={estimateTemplate}
    />
  </div>
)
```

### Pattern 5: Tooltip for Reset Button

Follows `estimate-tab.tsx` exactly:

```tsx
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { RotateCcw } from 'lucide-react'

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon" onClick={handleReset}>
        <RotateCcw className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>Reset to generated text</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### Anti-Patterns to Avoid

- **Calling a server action from PlainTextCard on edit:** The textarea edit must only update local React state. No persistence. No `router.refresh()`. No server action.
- **Creating a new utility file for buildItemsBreakdown:** It goes into the existing `lib/utils/estimate-template.ts` (D-02 locked).
- **Duplicating formatCurrency:** Import from `lib/utils/format.ts`. Note: `estimate-preview.tsx` has its own local copy — that is a pre-existing inconsistency; do not replicate it in Phase 25.
- **Adding PlainTextCard inside the 2-column grid:** It is a third full-width card below the grid, not a third grid column.
- **Fetching template data inside PlainTextCard:** Data must be passed as props from the server component page (D-05). No client-side fetching.
- **Using getCachedCompany for the workspace page company query:** Cached company only has `name`. Use the direct `supabase.from('companies').select(...)` pattern already in `ProjectTabs`. (This follows the Phase 24 "Pitfall 2" pattern documented in STATE.md.)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Template variable substitution | Custom replace logic | `resolveTemplate()` in `lib/utils/estimate-template.ts` | Already built in Phase 24, handles NULL defaults, empty-string-as-null, all 5 variables |
| Price formatting | Custom currency string builder | `formatCurrency()` from `lib/utils/format.ts` | Project-wide formatter, handles US locale |
| Clipboard copy | `document.execCommand('copy')` | `navigator.clipboard.writeText()` | Modern async API, already used in `estimate-preview.tsx` |
| Copy feedback | Custom visual indicator | `setCopied` + `setTimeout(2000)` + `toast.success` | Established pattern in the codebase; 2s timeout matches UX convention |
| Toast notifications | Custom notification component | `sonner` (`toast.success`, `toast.error`) | Project-wide toast library |
| Tooltip | Custom hover popup | shadcn/ui `Tooltip` + `TooltipProvider` | Established in `estimate-tab.tsx` |

**Key insight:** Phase 24 was explicitly designed so Phase 25 is pure assembly. The template engine, default values, and variable substitution are complete. This phase's only novel logic is `buildItemsBreakdown`.

---

## Common Pitfalls

### Pitfall 1: getCachedCompany Missing Template Fields

**What goes wrong:** Developer uses `getCachedCompany()` to fetch template data in the workspace page because it is used elsewhere. `getCachedCompany()` does not include the 4 `estimate_template_*` columns or `owner_name` in its select.

**Why it happens:** The `getCachedCompany` function returns a narrow select that was not updated to include Phase 24 columns. STATE.md Phase 24 entry explicitly flags this pitfall.

**How to avoid:** Use the direct `supabase.from('companies').select('name, owner_name, estimate_template_greeting, ...')` query already present in `ProjectTabs`, and extend it inline. Do not use `getCachedCompany` or `getEstimateTemplateSettings` for this use case.

**Warning signs:** TypeScript errors when accessing `company?.estimate_template_greeting` — means the query select string is missing those columns.

### Pitfall 2: useState Initialization Does Not Re-Run on Props Change

**What goes wrong:** `useState(() => resolveTemplate(...))` only runs the initializer once on mount. If `currentEstimate` changes while the component stays mounted (e.g., user generates a new estimate version without navigating away), the textarea will show stale text.

**Why it happens:** React only calls the state initializer function once per mount.

**How to avoid:** Use `useEffect` or `useMemo` to derive the resolved text and keep it in sync if `estimate` prop can change. Alternatively, key the component on `estimate.id` to force remount when the estimate changes:

```tsx
<PlainTextCard key={estimate.id} ... />
```

The `key` approach is simpler and matches the codebase pattern for forcing remount on identity change.

**Warning signs:** Textarea shows old content after regenerating estimate without page reload.

### Pitfall 3: SendTab Must Wrap in space-y-6, Not Extend the Grid

**What goes wrong:** Developer adds `PlainTextCard` as a third child of the `<div className="grid gap-6 lg:grid-cols-2">`. On large screens it becomes a third partial-width column; on small screens it is misaligned.

**Why it happens:** The current `SendTab` returns the grid directly without a wrapping container.

**How to avoid:** Wrap the grid and card in `<div className="space-y-6">` so the grid is one item and `PlainTextCard` is a second full-width sibling below it.

**Warning signs:** PlainTextCard appears at 50% width on desktop or has inconsistent spacing.

### Pitfall 4: Empty Sections or Items in buildItemsBreakdown

**What goes wrong:** An estimate has a section with zero items (empty section object). `buildItemsBreakdown` produces `[Section Title]\n` with no items, resulting in a trailing newline or blank block.

**Why it happens:** `getCurrentEstimate` can return sections with empty `items` arrays if the estimate was generated with blank sections.

**How to avoid:** Filter out sections with no items, or filter out items with no description:

```typescript
return estimate.sections
  .filter((section) => section.items.length > 0)
  .map(...)
  .join('\n\n')
```

**Warning signs:** Plain text output has `[Section Title]` followed by a blank line with no items below it.

### Pitfall 5: Clipboard API Unavailable Without HTTPS

**What goes wrong:** `navigator.clipboard.writeText()` throws or is `undefined` in HTTP-only contexts or when the page lacks focus.

**Why it happens:** Clipboard API requires a Secure Context (HTTPS or localhost).

**How to avoid:** The `try/catch` pattern already accounts for this — `toast.error('Failed to copy')` fires on any rejection. Development on `localhost` (which is a secure context) is fine. No additional guard needed beyond what the copy handler already does.

**Warning signs:** `toast.error` fires unexpectedly in production — indicates missing HTTPS or permissions.

### Pitfall 6: owner_name May Be Null

**What goes wrong:** `company.owner_name` is nullable in the database schema (`owner_name: string | null`). If passed as `null` to `TemplateData`, the signature line renders as a blank instead of `{owner_name}`.

**Why it happens:** Company onboarding does not make `owner_name` required.

**How to avoid:** Fall back to `company_name` or an empty string at the prop site:

```typescript
ownerName: company?.owner_name ?? ''
```

`resolveTemplate()` handles empty string gracefully (substitutes as empty string in the output). This is the correct behavior — the user should configure `owner_name` in settings.

---

## Code Examples

### buildItemsBreakdown (complete implementation)

```typescript
// Source: CONTEXT.md D-02, SEED-004 reference
// Extends lib/utils/estimate-template.ts
import type { EstimateWithSections } from '@/lib/queries/estimate'
import { formatCurrency } from '@/lib/utils/format'

export function buildItemsBreakdown(estimate: EstimateWithSections): string {
  return estimate.sections
    .filter((section) => section.items.length > 0)
    .map((section) => {
      const header = `[${section.title}]`
      const items = section.items
        .map((item) => `${item.description}: ${formatCurrency(item.total)}`)
        .join('\n')
      return `${header}\n${items}`
    })
    .join('\n\n')
}
```

### PlainTextCard skeleton

```tsx
// Source: CONTEXT.md D-01 through D-06, estimate-preview.tsx pattern
'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import { Copy, Check, RotateCcw, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { resolveTemplate, buildItemsBreakdown } from '@/lib/utils/estimate-template'
import { formatCurrency } from '@/lib/utils/format'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'

interface PlainTextCardProps {
  estimate: EstimateWithSections
  clientName: string
  companyName: string
  ownerName: string
  estimateTemplate: EstimateTemplate
}

export function PlainTextCard({
  estimate, clientName, companyName, ownerName, estimateTemplate
}: PlainTextCardProps) {
  function generateText(): string {
    return resolveTemplate(estimateTemplate, {
      client_name: clientName,
      company_name: companyName,
      owner_name: ownerName,
      total: formatCurrency(estimate.total),
      items_breakdown: buildItemsBreakdown(estimate),
    })
  }

  const [text, setText] = useState<string>(generateText)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  function handleReset() {
    setText(generateText())
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Plain Text</CardTitle>
            <CardDescription>Paste into WhatsApp, SMS, or email</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleReset}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset to generated text</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button onClick={handleCopy}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={16}
          className="font-mono text-sm resize-none"
        />
      </CardContent>
    </Card>
  )
}
```

### Company select extension (workspace page)

```typescript
// Source: CONTEXT.md D-05, app/(app)/projects/[id]/page.tsx
const { data: company } = await supabase
  .from('companies')
  .select('name, owner_name, estimate_template_greeting, estimate_template_opener, estimate_template_closer, estimate_template_signature')
  .eq('id', project.company_id)
  .single()
```

### Empty state in SendTab when estimate is null

```tsx
// Source: CONTEXT.md D-06 — applies inside PlainTextCard when SendTab passes null estimate
// OR handled at the SendTab level: only render PlainTextCard when estimate !== null
<Card>
  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
    <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
    <p className="text-sm text-muted-foreground">
      Generate an estimate first — then come back here to copy the plain text version.
    </p>
  </CardContent>
</Card>
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `document.execCommand('copy')` | `navigator.clipboard.writeText()` | Async, no flash, works in iframes, already used in project |
| Separate template table | 4 columns on `companies` | No join needed; Phase 24 decision (D-01) |
| Defaults stored in DB | Defaults in pure function (`TEMPLATE_DEFAULTS`) | DB stays clean; future default changes need no migration |

---

## Open Questions

1. **Should `PlainTextCard` be rendered at the `SendTab` level even when estimate is null, showing an empty state — or should `SendTab` conditionally not render it?**
   - What we know: `SendTab` already has its own null-estimate empty state that renders a single card with "No estimate available". That card would conflict visually with a separate `PlainTextCard` empty state.
   - What's unclear: Does the user want to see the PlainTextCard empty state separately from the main empty state, or should the entire tab remain in the current "no estimate" single-card view?
   - Recommendation: Only render `PlainTextCard` when `estimate !== null` (inside the non-null branch of `SendTab`). This matches the intent of D-06 and avoids two competing empty states.

2. **Does `ProjectWorkspace` need a `key` on `PlainTextCard` or `SendTab` to handle estimate version changes?**
   - What we know: The estimate editor allows switching between estimate versions. `currentEstimate` prop changes without unmounting the workspace.
   - What's unclear: Whether `SendTab` / `PlainTextCard` re-derive `text` state when `currentEstimate` prop changes or retain stale state.
   - Recommendation: Add `key={estimate.id}` to `PlainTextCard` in `SendTab` to force remount when the estimate changes. This is the simplest solution and avoids a `useEffect` that could cause a flash.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 25 is a pure code/component change with no external tool, CLI, or service dependencies beyond the existing Next.js + Supabase stack (already available).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (with jsdom environment) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/utils/estimate-template.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAINTEXT-01 | Plain Text card is visible in Send tab | Manual smoke (visual) | — | N/A |
| PLAINTEXT-02 | Copy button writes text to clipboard + shows toast | Unit (mock clipboard) | `npx vitest run tests/unit/utils/estimate-template.test.ts` | Wave 0 gap (add to existing file) |
| PLAINTEXT-04 | Edited textarea text does not affect saved template | Unit (pure state test) | `npx vitest run tests/unit/utils/estimate-template.test.ts` | Wave 0 gap |
| `buildItemsBreakdown` | Correct section header + item format + blank line separator | Unit | `npx vitest run tests/unit/utils/estimate-template.test.ts` | Wave 0 gap |
| `buildItemsBreakdown` | Empty sections filtered out | Unit | `npx vitest run tests/unit/utils/estimate-template.test.ts` | Wave 0 gap |

**Note:** PLAINTEXT-01 (visual tab placement) and PLAINTEXT-02 / PLAINTEXT-04 (clipboard + local state) are best covered by unit tests on the pure utility and manual smoke inspection of the component. The clipboard interaction and component behavior are not tested with JSDOM-based vitest (clipboard is not available in jsdom by default without a mock); unit coverage of `buildItemsBreakdown` is the highest-value automated test.

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/utils/estimate-template.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/utils/estimate-template.test.ts` — add `buildItemsBreakdown` test suite (file exists; extend it)

No new test file creation needed. The existing `estimate-template.test.ts` is the right home for `buildItemsBreakdown` tests.

---

## Project Constraints (from CLAUDE.md)

- **Framework:** Next.js 14+ App Router, TypeScript strict
- **UI:** Tailwind CSS + shadcn/ui (New York style, neutral base, CSS variables — STATE.md D-09)
- **State:** React `useState` / Zustand / React Context — this phase uses `useState` only
- **Forms:** react-hook-form + zod — not applicable to PlainTextCard (no form submission)
- **Security:** Service role key never in browser; all AI calls server-side. PlainTextCard is a pure client component with no AI calls.
- **Mobile:** Components must work on iOS Safari and Android Chrome. `navigator.clipboard.writeText()` works on modern iOS Safari (14.5+) and Android Chrome (66+). The `try/catch` fallback already covers failure.
- **No new installs:** All required libraries are already in the project.

---

## Sources

### Primary (HIGH confidence)

- Codebase direct read: `lib/utils/estimate-template.ts` — `resolveTemplate()`, `TemplateData`, `EstimateTemplate`, `TEMPLATE_DEFAULTS` — current implementation confirmed
- Codebase direct read: `components/workspace/send/estimate-preview.tsx` — `navigator.clipboard.writeText` + `setCopied` + `setTimeout(2000)` + `toast.success` pattern — confirmed exact implementation
- Codebase direct read: `components/workspace/send/send-tab.tsx` — current props interface and grid layout — confirmed
- Codebase direct read: `components/workspace/project-workspace.tsx` — props chain and SendTab render site — confirmed
- Codebase direct read: `app/(app)/projects/[id]/page.tsx` — current company select (`name` only) — confirmed
- Codebase direct read: `lib/queries/company.ts` — `CompanySettings` interface with all 4 `estimate_template_*` columns confirmed present
- Codebase direct read: `lib/queries/estimate.ts` — `EstimateWithSections`, `EstimateSection`, `EstimateItem` types confirmed
- Codebase direct read: `lib/utils/format.ts` — `formatCurrency()` confirmed
- Codebase direct read: `components/workspace/estimate/estimate-tab.tsx` — `TooltipProvider` / `TooltipTrigger` / `TooltipContent` pattern confirmed
- Codebase direct read: `tests/unit/utils/estimate-template.test.ts` — existing test file confirmed; extend, don't create
- Codebase direct read: `.planning/seeds/SEED-004-plain-text-estimate-output.md` — reference output format confirmed
- CONTEXT.md: Locked decisions D-01 through D-06

### Secondary (MEDIUM confidence)

- STATE.md Phase 24 entry — "Use getEstimateTemplateSettings not getCachedCompany" (Pitfall 2) — relevant to data fetching approach confirmed by codebase inspection

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries confirmed in codebase, no new installs
- Architecture: HIGH — patterns read directly from existing components, CONTEXT.md fully specifies structure
- Pitfalls: HIGH — derived from direct codebase reading and STATE.md accumulated decisions
- buildItemsBreakdown: HIGH — straightforward pure function, format specified verbatim in CONTEXT.md D-02 and SEED-004

**Research date:** 2026-05-08
**Valid until:** 2026-06-07 (stable codebase; re-verify if Phase 24 artifacts change)
