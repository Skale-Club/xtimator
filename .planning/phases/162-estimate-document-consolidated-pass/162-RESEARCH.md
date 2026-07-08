# Phase 162: Estimate Document Consolidated Pass - Research

**Researched:** 2026-07-08
**Domain:** Next.js 14 App Router + TypeScript + shadcn/Radix UI + Tailwind CSS + React 19 — a UI refactor + consolidation phase across `components/workspace/estimate/estimate-document.tsx` (2018 lines) and the fragmented client-picker components.
**Confidence:** HIGH — every finding cites concrete file:line evidence in the current tree.

## Summary

This phase is an internally-sequenced UI refactor of the 2018-line `estimate-document.tsx` and its satellites (`estimate-floating-actions.tsx`, `estimate-editor.tsx`, the three `LinkClient*` components, `item-card-mobile.tsx`, and the confirmed-dead `section-card.tsx`/`item-row.tsx`). Almost none of the plumbing needed by Phase 162 is missing — Phase 161 already landed (a) the `PresentationSettings` type, (b) the `resolvePresentationSettings()` pure resolver, (c) the `UPDATE_PRESENTATION_SETTINGS` reducer action + state field, (d) the `saveEstimate` pass-through, and (e) the `estimates.presentation_settings` JSONB column. Phase 162 only *consumes* this scaffolding: builds the gear-triggered panel that writes through the action, replaces `estimate-document.tsx`'s destructive `isFieldVisible`/`toggleField`/`AddDetailsPopover` mechanism with resolver-driven visibility, extracts the fragmented client-pickers into ONE `components/clients/client-picker.tsx`, adds an in-canvas Bill To pencil affordance, replaces the dotted project-name underline with a thin solid one (while inheriting `ProjectTitle`'s validation/error-retry semantics), does a full spacing/alignment pass across the doc surface, rebuilds the mobile line-item editor to look like a responsive desktop table (no glass card), and deletes the two dead components with grep-verifiable acceptance.

The three riskiest sub-areas are (1) the shared `estimate-document.tsx` render tree, which serves BOTH `mode="edit"` (editor) AND `mode="view"` (classic share page) — every alignment/spacing change ripples into the customer-facing share render, and (2) GUARD-03 discipline in the new settings panel — every control must dispatch `UPDATE_PRESENTATION_SETTINGS`, never `UPDATE_TAX_RATE`/`UPDATE_DISCOUNT`/`UPDATE_DEPOSIT`, because those directly mutate the reducer's `recalculate()`-touching state (client preview only, but still) and would create a two-hiding-mechanism collision with `presentation_settings.tax.mode='off'`. Third (3) the current `isFieldVisible`/`revealed`/`toggleField` mechanism in `estimate-document.tsx:1613-1632` is *destructive* — replacing it means also handling the case where an estimate already has `revealed.has('summary')` state that must be discarded cleanly, and never falling back to the old destructive path.

**Primary recommendation:** Follow the ROADMAP-locked sub-step order 3a → 3b → 3c strictly. Extract `ClientPicker` FIRST (3a-i) as a new file with the union-of-features API (`variant: 'card' | 'button' | 'inline' | 'billTo'`), then swap the four call sites (3a-ii) — the picker's API is the load-bearing contract for the whole phase. Do the alignment pass in the same 3a wave because it lives in the same file. Wire the gear panel in 3b as a **replacement** for `isFieldVisible`/`toggleField`/`AddDetailsPopover`, not a parallel system (PITFALLS.md #2). Do the mobile parity swap last in 3c, verifying against the *final* post-3a-3b desktop state.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Locked by the ROADMAP (non-negotiable):**

- **Gear icon placement**: left side of the existing floating `Photos / Send` pill (the one Phase 160's UI polish landed). Order = `[Gear] Photos … Send`, not `[Photos] [Gear] Send`.
- **Settings panel format**: popover on desktop, bottom sheet on mobile — reuses the existing shadcn `Popover` + `Sheet` primitives.
- **Panel contents**: three groups — Pricing (tax/discount/deposit overrides), Document Sections (visibility toggles), Client Presentation (per PRESENT-05 sent/viewed status handling). Every control writes through `UPDATE_PRESENTATION_SETTINGS` — never `UPDATE_TAX_RATE`/`UPDATE_DEPOSIT`/etc. GUARD-03: the panel NEVER calls `recalculate()` or touches totals math on the client.
- **Bill To editing**: in-canvas pencil affordance on hover/focus in edit mode; opens a compact popover using the consolidated client-picker; supports search / switch / unlink.
- **Project name underline**: thin solid `border-b border-foreground/40` (or equivalent) on hover/focus, replacing the current dotted/serrated. `ProjectTitle`'s validation/error-retry behavior is preserved verbatim.
- **Mobile line-item parity**: 360/390/430 px viewports must render the same document-native table language as desktop — no separate glass card, no text clipping, no touch-target regression from the existing implementation.
- **Deletions**: `components/workspace/estimate/section-card.tsx` and `components/workspace/estimate/item-row.tsx` are removed. Zero remaining imports post-phase (grep-verifiable acceptance criterion).

### Claude's Discretion

- **Consolidated client-picker file location**: `components/clients/client-picker.tsx` (top-level `components/clients/` so it can be reused everywhere — editor, header, settings — matches the existing `components/projects/` / `components/workspace/` pattern).
- **Panel labelling / iconography**: use existing lucide icons already in the codebase (`Settings`, `Eye`, `EyeOff`, `DollarSign`, `Percent`). No new icon imports if a suitable one already exists.
- **Popover vs Dialog for Bill To edit**: `Popover` (in-canvas, contextual — matches the ROADMAP's "in-canvas pencil affordance" language). Dialog would break the "in-canvas" invariant.
- **Alignment pass tokens**: reuse the existing spacing scale (`px-4`, `py-3`, `gap-3`, etc.) and the `--radius-md` / `--glass-border` tokens Phase 71 established. No new design tokens introduced by this phase.
- **Test strategy for the alignment pass**: visual/behavioral, not pixel-diff. Snapshot the DOM structure (tags + classes) so refactor-caused churn is caught but pixel drift isn't chased.
- **Test strategy for section-card/item-row deletion**: hard grep guard as an acceptance criterion — `grep -r "section-card\|item-row" components/ app/ lib/ | grep -v "\.deleted\|\.bak"` returns zero.

### Deferred Ideas (OUT OF SCOPE)

- Rendering `SectionVisibility` / `TaxOverride` / `DiscountOverride` / `DepositOverride` INSIDE the PDF, share page, and plain-text renderers — **Phase 163** (SENDHUB-01..06 milestone slot). Phase 162 only wires the panel that WRITES the settings; the render-side wiring is Phase 163.
- Any change to `lib/estimate/compute-totals.ts` or `lib/estimate/presentation-settings.ts` — frozen by Phase 161.
- Format-first Send Hub tabs (Online / PDF / Plain-Text) — Phase 163.
- Anything the ROADMAP DOCUX-01..07 requirements don't cover (e.g., attachment reordering, item-level notes, etc.) — out of scope; capture as new seeds if surfaced.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **DOCUX-01** | Gear icon on LEFT of the floating `Photos / Send` pill opens a settings panel (desktop popover / mobile bottom sheet) exposing Pricing, Document Sections, Client Presentation controls from PRESENT-01/03. | Q2 answers panel wiring; Phase 161's `UPDATE_PRESENTATION_SETTINGS` + state field already exist and are consumed here verbatim. |
| **DOCUX-02** | Bill To block editable in-place — hover/focus in edit mode reveals a pencil icon; click opens a compact popover to search/switch or unlink the linked client. | Q1 documents the four client-picker impls; unlink helper `unlinkProjectFromClient` already exists at `lib/actions/project.ts:272`. |
| **DOCUX-03** | Existing client-picker implementations (`LinkClientInline`, `LinkClientButton`, `LinkClientCard`, plus the inline impl in `estimate-document.tsx`) consolidated into ONE shared component reused everywhere. | Q1 shape survey + shared prop union. |
| **DOCUX-04** | Project name inline-edit shows a thin solid underline on hover/focus (replacing dotted/serrated) and reconciles with `ProjectTitle`'s validation/error-retry behavior. | Q4 documents both components verbatim; the reconciliation is: replace `InlineProjectName` with a version that adopts `ProjectTitle`'s validation/error-retry contract while keeping the doc-native `text-2xl font-bold` styling and the thin solid underline. |
| **DOCUX-05** | Full alignment pass removes accidental spacing/offset inconsistencies across company header, estimate title band, project/bill-to grid, summary, section headers, and line-item table — verified on desktop and mobile against the same estimate. | Q3 lists exact `px-*`/`py-*`/`gap-*` mismatches with line references. |
| **DOCUX-06** | Mobile line-item editor visually matches desktop document-native table language (same density, hierarchy, document surface) instead of standalone glass card — verified at 360/390/430px with no text clipping and no regression to existing touch targets. | Q5 documents `ItemCardMobile`'s `<Card variant="glass">` shell and `SortableDocumentItemRow`'s desktop language; consolidation strategy = ONE component built out of transparent inputs on the paper surface, no glass card. |
| **DOCUX-07** | Confirmed-dead components (`section-card.tsx`, `item-row.tsx`) removed. | Grep confirms `section-card.tsx` has zero external importers; `item-row.tsx` is only imported by the dead `section-card.tsx` (transitively dead). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech Stack**: Next.js 14+ (App Router), TypeScript strict, Tailwind CSS, shadcn/ui, Zustand or React Context, react-hook-form + zod.
- **Mobile**: audio recording and camera capture must work on iOS Safari + Android Chrome — this phase touches the mobile line-item editor, so the 360/390/430 px verification is a first-class success criterion.
- **Security — no secrets in git**: this is a UI-only phase, but any docs/comments/planning artifacts must use placeholders like `whsec_<your-secret>` / `sk_live_<your-key>` — never real keys. Gitleaks pre-commit hook enforces this.
- **GSD workflow**: all work goes through `/gsd:execute-phase`; no direct edits outside a GSD command.
- **Style token discipline** (Phase 71 established): reuse `--radius-md` / `--glass-border` and the existing spacing scale — do NOT invent new design tokens for the alignment pass.

## Standard Stack

Everything this phase needs is already installed and already used in this exact tree. No new dependencies.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `radix-ui` | `^1.4.3` | Popover + Sheet + Dialog primitives (unified umbrella package) | Already the source of `components/ui/popover.tsx` and `components/ui/sheet.tsx` — proven in production |
| `cmdk` | `^1.1.1` | Command-palette search UX inside the client picker | Already used by `LinkClientButton` + `LinkClientCard` via `components/ui/command.tsx` — the exact consolidation target |
| `lucide-react` | `^1.8.0` | Icons (`Settings`, `Pencil`, `UserPlus`, `X`, `Eye`, `EyeOff`, `DollarSign`, `Percent`) | Already the codebase's icon set — no new icon library |
| `tailwindcss` | `^4` (postcss `@tailwindcss/postcss`) | Utility classes for the alignment pass | Already the styling system; the alignment pass is Tailwind classes only |
| `sonner` | pinned via `toast` in `estimate-editor.tsx` | Toast notifications for the client-picker unlink / project-rename validation errors | Already used across the codebase |
| `next/navigation` | Next.js 16.2.6 built-in | `useRouter().refresh()` after `linkProjectToClient`/`unlinkProjectFromClient` | Existing pattern — all three current client-pickers already use this |
| `react` | 19 | `useReducer` (`useEstimateReducer`), `useState`, `useEffect`, `useRef` | Already used; `UPDATE_PRESENTATION_SETTINGS` action + state field landed in Phase 161-02 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@testing-library/react` | `^16.3.2` | Render tests for `PresentationSettingsPanel`, `ClientPicker`, updated `InlineProjectName`, mobile-parity checks | Every DOCUX requirement has a Vitest + RTL test |
| `vitest` | `^4.1.4` | Test runner | Config: `vitest.config.ts`. Command: `npx vitest run <file>`. |
| `@playwright/test` | `^1.59.1` | Manual visual UAT at 360/390/430 px (DOCUX-05/06) — optional if we add screenshot tests to `tests/e2e/visual/workspace.spec.ts` | The Nyquist gate for visual work is manual; a Playwright snapshot pass is a stretch goal. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Popover` + `Sheet` with a `matchMedia` toggle | `vaul` (drawer library) | `vaul` not installed; gains swipe-to-dismiss but adds ~40 KB and is not needed to meet the seed's "bottom sheet on mobile" goal (STACK.md L63) |
| One responsive `<Popover>` / `<Sheet>` toggled by `matchMedia` | Render both, gate by Tailwind `hidden sm:block` / `sm:hidden` | Rendering both keeps state in one place BUT double-mounts the panel content; `matchMedia` approach used in `components/app-shell/sidebar.tsx:53,148` is the codebase precedent — reuse it |
| Extracting client-picker to `components/workspace/client-picker.tsx` | `components/clients/client-picker.tsx` | CONTEXT.md locked `components/clients/` (top-level, reusable outside workspace) — mirrors `components/projects/`/`components/workspace/` split already in tree |
| A new `useIsMobile()` hook | Inline `window.matchMedia('(min-width: 768px)')` | Only one component consumes it today (`sidebar.tsx`); extracting a ~10-line hook is fine but not required. Discretion: extract `useIsMobile()` in `lib/hooks/use-is-mobile.ts` if the panel + Bill To popover both need it. |

**Installation:** None — every dep already present in `package.json`.

**Version verification:** Not applicable; no new packages proposed.

## Architecture Patterns

### Recommended Project Structure

```
components/
├── clients/
│   ├── client-picker.tsx          # NEW — the ONE shared picker (DOCUX-03)
│   └── ... existing files
├── workspace/
│   ├── estimate/
│   │   ├── estimate-document.tsx  # MODIFIED — alignment pass, resolver-driven visibility,
│   │   │                          #            Bill To pencil affordance, InlineProjectName
│   │   │                          #            replacement, mobile branch overhaul
│   │   ├── estimate-editor.tsx    # MODIFIED — owns `settingsOpen` state + renders panel
│   │   ├── estimate-floating-actions.tsx  # MODIFIED — Gear button + onOpenSettings prop
│   │   ├── presentation-settings-panel.tsx  # NEW — the gear-triggered panel
│   │   ├── item-card-mobile.tsx   # REBUILT or REPLACED — no glass card
│   │   ├── section-card.tsx       # DELETED (DOCUX-07)
│   │   └── item-row.tsx           # DELETED (DOCUX-07)
│   ├── link-client-button.tsx     # DELETED or refactored → thin wrapper around ClientPicker
│   ├── link-client-card.tsx       # DELETED or refactored → thin wrapper around ClientPicker
│   ├── overview-tab.tsx           # MODIFIED — swap LinkClientButton for ClientPicker variant
│   ├── client-tab.tsx             # MODIFIED — swap LinkClientCard for ClientPicker variant
│   └── project-title.tsx          # READ-ONLY REFERENCE (the validation/error-retry contract)
lib/hooks/
└── use-is-mobile.ts               # OPTIONAL — extract if reused ≥2x
```

### Pattern 1: Reducer state ← panel controls (Phase 161 seam)

**What:** Every gear-panel control dispatches ONE action:
```ts
dispatch({
  type: 'UPDATE_PRESENTATION_SETTINGS',
  presentation_settings: {
    ...current, // (from resolver defaults)
    sections: { ...current.sections, summary: false }, // hide summary
  }
})
```

**When to use:** Every toggle, every RadioGroup option, every number input in the panel. NEVER `dispatch({ type: 'UPDATE_TAX_RATE', ... })` from the panel — that's a different action for a different field on the reducer state (`tax_rate` typed column) and would collide with `presentation_settings.tax.mode/customRate`.

**Example (verified from Phase 161-02):**
```ts
// use-estimate-reducer.ts:465-466 (already exists)
case 'UPDATE_PRESENTATION_SETTINGS':
  return { ...state, presentation_settings: action.presentation_settings, isDirty: true }
```

The action is pure state merge + `isDirty: true`, no `recalculate()` call — matches GUARD-03 (visibility state never affects totals math on the client; server is authoritative via `computeEstimateTotals`).

### Pattern 2: Popover on desktop / Sheet on mobile (single `open` state)

**What:** ONE `open: boolean` state in `estimate-editor.tsx`, ONE `<PresentationSettingsPanel open onOpenChange settings onChange>` render, internally branches on `matchMedia('(min-width: 768px)')`.

**When to use:** The gear panel + the Bill To pencil popover both need mobile-safe presentation. Consider extracting `useIsMobile()` to `lib/hooks/use-is-mobile.ts` if both consume it.

**Example (mirror `components/app-shell/sidebar.tsx:53-148`):**
```tsx
const DESKTOP_BREAKPOINT = '(min-width: 768px)'

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_BREAKPOINT)
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isDesktop
}

// In PresentationSettingsPanel:
const isDesktop = useIsDesktop()
if (isDesktop) return <Popover open={open} onOpenChange={onOpenChange}>{...}</Popover>
return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="bottom">{...}</SheetContent></Sheet>
```

### Pattern 3: Shared client-picker — variant prop, single fetch/select flow

**What:** ONE component with a discriminated `variant` prop. Each variant produces a different trigger; all share `PopoverContent` → `Command` → `CommandInput` → `ClientList` internals and the same `linkProjectToClient` / `unlinkProjectFromClient` server actions.

**When to use:** All four current call sites (overview pill, client tab, Bill To pencil, no-client-linked doc affordance).

**Example (the minimum unified API — see Q1 for full rationale):**
```tsx
// components/clients/client-picker.tsx
export interface ClientPickerProps {
  projectId: string
  currentClientId: string | null  // null = no client linked; enables "unlink" only when set
  variant: 'card' | 'button' | 'inline' | 'billTo'
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  onLinked?: (clientId: string) => void
  onUnlinked?: () => void
  className?: string
}
```

### Anti-Patterns to Avoid

- **Two hide mechanisms living side-by-side.** DO NOT keep `AddDetailsPopover` + `toggleField` + `revealed: Set` alongside the new gear-panel `presentation_settings.sections`. Retire the local `revealed`/`toggleField` fully; render visibility SOLELY off `resolvePresentationSettings(state.presentation_settings).sections[...]`. PITFALLS.md #2 flags this as the single most likely regression bug class.
- **Client picker variant escape hatches.** DO NOT expose a `renderTrigger?: (props) => ReactNode` render-prop that would let one call site sprout capabilities the others don't test. Enumerate variants explicitly; add new capabilities to the shared API surface, not per-call-site. (PITFALLS.md #7.)
- **Rendering `<Card variant="glass">` inside the paper document.** The doc surface pins `--glass-*` tokens light (`estimate-document.tsx:1691-1694`), but the card still adds shadow + rounded chrome that visually breaks with the paper. Replace with `<div className="...border-b border-border/50...">`.
- **Panel calls to `dispatch({ type: 'UPDATE_TAX_RATE'|'UPDATE_DISCOUNT'|'UPDATE_DEPOSIT' })`.** Those are the LEGACY document-inline controls' actions. The new panel only writes `UPDATE_PRESENTATION_SETTINGS`. GUARD-03.
- **Reflowing the classic PDF renderer via alignment changes.** `EstimateDocument` renders BOTH `mode="edit"` (editor) AND `mode="view"` (share page classic template). Anything you change to the doc shell also affects the share/classic-PDF DOM shape. The alignment pass MUST render byte-identically in `mode="view"` for existing e2e visual baselines under `tests/e2e/visual/share.spec.ts` — audit the classic PDF template (`components/pdf/estimate-pdf.tsx`) and note that its layout is a separate `@react-pdf/renderer` tree not affected by the alignment pass, but the classic share page IS the same `EstimateDocument` component (see `components/share/estimate-view.tsx`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Search/filter over clients | Custom `<input>` + custom filter/dropdown | `Command` + `CommandInput` + `CommandItem` (from `components/ui/command.tsx`) | `cmdk` handles keyboard nav, focus management, and empty states; already used by 2 of 4 pickers |
| Desktop popover / mobile sheet | Two components with a media query in between | ONE `<PresentationSettingsPanel>` with an internal `useIsDesktop()` branch | Existing pattern: `components/app-shell/sidebar.tsx:53-148` uses `window.matchMedia` for the exact same "responsive component" need |
| Toast on success/error | Custom toast/banner | `toast.success('Client linked')` / `toast.error('Failed to unlink')` (from `sonner`) | Already the codebase's toast layer; every existing picker + `renameProjectAction` call already uses this |
| Optimistic-concurrency handling on `linkProjectToClient` | Manual `updated_at` check | Just call `linkProjectToClient(projectId, clientId)` — it doesn't need optimistic concurrency (project-level, not estimate-level) | The `expectedUpdatedAt` field only guards `saveEstimate` (estimates row); project renames/relinks don't collide with estimate saves |
| Debounce/persistence for the panel | Custom debounce on every toggle | Dispatch → `isDirty: true` → the editor's existing 3000ms autosave (`estimate-editor.tsx:339-349`) picks it up | Autosave debounce already exists; no new persistence machinery needed |
| Media-query hook | Install `usehooks-ts` or `@uidotdev/usehooks` | Inline `window.matchMedia` OR extract a ~10-line `useIsMobile()` locally | STACK.md L103: full utility-hooks package is unjustified for one breakpoint |
| Section visibility check inside renderers | `if (data.summary != null && data.summary.trim())` | `isSectionVisible(resolved, 'summary')` (from Phase 161's resolver) | PRESENT-04: the resolver is the ONE place; PITFALLS.md #1 (settings-drift) flags this as the highest-severity risk |

**Key insight:** Phase 162 is refactoring + consolidating existing behaviors, not building new ones. Every capability it needs (popover, sheet, command, toast, `linkProjectToClient`, `unlinkProjectFromClient`, `renameProjectAction`, `matchMedia`, `resolvePresentationSettings`, `UPDATE_PRESENTATION_SETTINGS`, `saveEstimate` pass-through, GUARD-03 reducer discipline) already exists and is proven in production. Hand-rolling any of them re-introduces divergence the milestone is explicitly closing.

## Common Pitfalls

### Pitfall 1: Two hide mechanisms fighting each other

**What goes wrong:** The gear panel writes `presentation_settings.sections.summary = false` (non-destructive — the underlying text stays intact) BUT the existing `AddDetailsPopover` still lets the owner "hide Summary" via `dispatch({ type: 'UPDATE_FIELD', field: 'summary', value: null })`, which DELETES the summary text. Two paths to "hide," different destructive/non-destructive semantics, guaranteed user confusion.

**Why it happens:** `AddDetailsPopover`'s `toggleField` was the pre-Phase 161 mechanism; a naive Phase 162 execution leaves it in and adds the gear panel alongside it.

**How to avoid:** The plan MUST fully retire the local `revealed: Set<OptionalField>` state, the `toggleField` function, `isFieldVisible`, AND `AddDetailsPopover` in one pass. Section visibility reads ONLY through `isSectionVisible(resolvePresentationSettings(state.presentation_settings), 'summary')`. The `Plus + "Add details"` UX moves INTO the gear panel as toggles (i.e., adding a section = toggling its visibility ON, generating any missing text is a separate future flow but not part of this phase — the toggles just hide/show whatever content exists, which is fine because summary/notes/etc. are already generated at AI time).

**Warning signs:** After the swap, grep for `revealed`, `toggleField`, `isFieldVisible`, `AddDetailsPopover` in `estimate-document.tsx` — all must return zero hits.

### Pitfall 2: Panel controls dispatch the wrong action (GUARD-03 collision)

**What goes wrong:** A panel Tax control dispatches `dispatch({ type: 'UPDATE_TAX_RATE', tax_rate: 0 })` when "Off" is picked, mutating the typed `tax_rate` column to 0 — destroying the original rate, so toggling back to "Default" no longer restores it. Directly contradicts CONTEXT.md's "Tax Off preserves the default rate" contract.

**Why it happens:** `UPDATE_TAX_RATE` is the pre-existing action used by the DocumentTotals inline tax control (`estimate-document.tsx:1094-1101`); a plan that treats the panel as "just another tax control" reaches for the same action.

**How to avoid:** The panel writes ONLY `UPDATE_PRESENTATION_SETTINGS`. Tax mode 'off' persists as `{ tax: { mode: 'off', preservedRate: <original> } }` in JSONB; the typed `tax_rate` column is left alone. Phase 163 will later wire the resolver into `computeEstimateTotals`'s input path so `mode='off'` produces an effective `taxRate=0` at compute time WITHOUT mutating the persisted rate.

**Warning signs:** Static grep on the new panel file: `grep -c "UPDATE_TAX_RATE\|UPDATE_DISCOUNT\|UPDATE_DEPOSIT" components/workspace/estimate/presentation-settings-panel.tsx` returns exactly 0.

### Pitfall 3: `EstimateDocument` alignment change breaks the customer-facing share page

**What goes wrong:** The alignment pass tightens `px-*`/`py-*` on the section header bar. The classic share page (`components/share/estimate-view.tsx`) renders the exact same `<EstimateDocument mode="view">`. Existing Playwright visual baselines under `tests/e2e/visual/share.spec.ts` (12 baselines: 3 viewports × 3 langs + brand override + stripe success/canceled) diff-fail against the reflowed layout.

**Why it happens:** `EstimateDocument` is the shared classic renderer for BOTH `mode="edit"` (editor) AND `mode="view"` (share page classic template). Any structural change ripples.

**How to avoid:** (a) Enumerate the current `px-*`/`py-*` inventory (see Q3 below) and PROPOSE the target values BEFORE editing. (b) After the alignment pass, deliberately regenerate the Playwright share visual baselines and diff-review the change — either accept the improvement (they should look BETTER, since the current layout has visible mismatches) or revert. (c) Do NOT touch the `@react-pdf/renderer` PDF template — that's `components/pdf/estimate-pdf.tsx`, a completely separate tree.

**Warning signs:** After 3a, run `npx playwright test tests/e2e/visual/share.spec.ts --update-snapshots=false` and inspect the diffs — every diff should be an INTENTIONAL alignment improvement, never an accidental blank-space explosion.

### Pitfall 4: Consolidated client-picker re-forks in 6 months

**What goes wrong:** The picker is extracted; six months later someone needs "allow creating a new client inline" for the Bill To only (SEED-044 open decision #5) and bolts it on via a special prop only that call site sets. The fork starts.

**Why it happens:** Feature accretion — the shared component's public API doesn't have a hook for the new capability, so the temptation is to add a `renderExtraFooter?: () => ReactNode` or a `showCreateNew?: boolean` prop that only one site sets.

**How to avoid:** The plan's `ClientPicker` API MUST enumerate the variants explicitly (`'card' | 'button' | 'inline' | 'billTo'`) and any variant-specific features MUST be a first-class prop testable in isolation. The v1 API MAY include `showUnlink?: boolean` (defaults `true` when `currentClientId` is set, only used in `billTo` variant today) but must NOT include an escape-hatch render prop. v2 features (like inline client creation, DOCUXX-01) get added to the shared API as new opt-in props with their own tests, never as call-site-specific escape hatches.

**Warning signs:** Any prop on `ClientPickerProps` that ends in `?render` or takes a `ReactNode`/`children` slot for arbitrary content is suspicious.

### Pitfall 5: The reconciled InlineProjectName silently drops ProjectTitle's validation

**What goes wrong:** The plan replaces `InlineProjectName`'s dotted underline with a solid one, but the naive rewrite doesn't port over `ProjectTitle`'s (a) empty-string validation with i18n toast, (b) 200-char limit, (c) error-retry loop (stay in edit mode on server error), (d) autofocus + select-all, (e) i18n `t()`-based toast text. Result: doc surface's project-name edit becomes worse than the header's.

**Why it happens:** `InlineProjectName` (`estimate-document.tsx:1421-1467`) is only ~46 lines and looks simple; `ProjectTitle` (`components/workspace/project-title.tsx`, 127 lines) has the full contract. A "just replace the underline" edit misses the surrounding validation.

**How to avoid:** The plan MUST specify: reconciled InlineProjectName inherits ProjectTitle's validation contract verbatim (imported from a shared helper OR merged into the component). Preferably extract the validation to `lib/hooks/use-inline-project-rename.ts` and consume it in BOTH `InlineProjectName` and `ProjectTitle`, so there's ONE validation contract for project renames.

**Warning signs:** After the reconciliation, `InlineProjectName` must exhibit: (a) empty submit → toast error → stays in edit mode; (b) >200 chars → toast error → stays in edit mode; (c) server error → toast + revert draft + stay in edit mode.

### Pitfall 6: Mobile parity rebuild silently regresses touch targets

**What goes wrong:** The rebuild swaps `<Card variant="glass">` for a doc-native row, but in tightening the visual density loses the `min-h-[44px] min-w-[44px]` on the trash button and the Switch toggle. Now the delete-item and taxable-toggle no longer meet WCAG 2.5.5 44px touch target.

**Why it happens:** `ItemCardMobile:132-142,145-162` currently has `min-h-[44px]` on both. A visual "density pass" reads that as "too tall" and removes it.

**How to avoid:** The plan MUST preserve `min-h-[44px] min-w-[44px]` on every touch-driven interactive element in the mobile branch. Density comes from removing chrome (shadow, card border, extra padding), NOT from shrinking interactive elements below the WCAG floor.

**Warning signs:** `grep "min-h-\[44px\]\|min-w-\[44px\]" components/workspace/estimate/estimate-document.tsx` after 3c must still show hits on trash + Switch.

### Pitfall 7: The 4th client-picker impl is a phantom

**What goes wrong:** The plan chases a 4th client-picker implementation that doesn't exist as a distinct code artifact. CONTEXT.md says "LinkClientInline, LinkClientButton, LinkClientCard, and the 4th (inline) implementation inside estimate-document.tsx" — but grep + code review shows only THREE code implementations: `LinkClientButton`, `LinkClientCard`, and `LinkClientInline` (declared at `estimate-document.tsx:1383-1415`, currently unused in the JSX tree). The "4th" language in PITFALLS.md L152 was actually renaming `LinkClientInline` as the "undocumented 4th" (unnamed in code review), then CONTEXT.md tallied the three named ones + LinkClientInline = 4.

**Why it happens:** Reading CONTEXT/PITFALLS/SEED-044 side-by-side, "the 4th" refers to the *inline* nature of `LinkClientInline` — it's declared inside `estimate-document.tsx`, not in its own file. There is no separate 4th picker; the phrase was double-counting.

**How to avoid:** Acknowledge in the plan that consolidation replaces THREE code impls (LinkClientButton, LinkClientCard, LinkClientInline). The four *call sites* the CONTEXT alludes to are: (a) overview-tab.tsx `linkClientSlot`; (b) client-tab.tsx no-client card; (c) Bill To pencil affordance (new, does not exist today); (d) LinkClientInline is technically dead code today — no JSX renders it — so treat it as "extracted logic to fold into the shared picker" rather than "an active 4th usage to swap." Grep evidence: `grep "LinkClientInline" -r components/` shows only its declaration site.

**Warning signs:** A plan task titled "swap the 4th call site" with no identified line range is chasing the phantom.

### Pitfall 8: The gear-panel replacement leaves `revealed: Set` stale in memory

**What goes wrong:** The refactor removes `AddDetailsPopover`'s trigger but leaves the `revealed` React state around (perhaps because `isFieldVisible` still references it). On mount, `revealed` is empty; the doc looks at `data.summary != null` to decide visibility (the old code), ignoring `presentation_settings.sections.summary`. Net: gear toggle appears to do nothing.

**Why it happens:** `estimate-document.tsx:1613-1632` reads BOTH `data[field] != null` AND `revealed.has(field)`. A partial refactor that only touches one side leaves the other stale.

**How to avoid:** Delete `revealed`, `setRevealed`, and `toggleField` in ONE atomic edit. Reroute EVERY caller of `isFieldVisible(field)` to `isSectionVisible(resolvedSettings, mapField(field))`. Every place `data[field] != null` gates a section render is a candidate — audit the JSX tree top-to-bottom.

**Warning signs:** After 3b, grep for `revealed` in the file must return 0. Section-toggle e2e (toggle Summary off, refresh, see the summary hidden even though `data.summary` is non-null in the persisted row) must pass.

## Code Examples

### Consolidated ClientPicker (rough shape, from cross-analysis of the 3 impls)

```tsx
// components/clients/client-picker.tsx (NEW)
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { linkProjectToClient, unlinkProjectFromClient } from '@/lib/actions/project'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Command, CommandInput, CommandGroup, CommandItem, CommandList, CommandEmpty } from '@/components/ui/command'
import { useTranslation } from '@/lib/i18n/use-translation'

type Variant = 'card' | 'button' | 'inline' | 'billTo'

export interface ClientPickerProps {
  projectId: string
  currentClientId: string | null
  variant: Variant
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  onLinked?: (clientId: string) => void
  onUnlinked?: () => void
  className?: string
}

interface ClientSearchItem { id: string; name: string; email: string | null; phone: string | null }

export function ClientPicker(props: ClientPickerProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  function handleLink(clientId: string) {
    startTransition(async () => {
      const result = await linkProjectToClient(props.projectId, clientId)
      if ('error' in result) { toast.error(result.error); return }
      toast.success(t('Client linked'))
      setOpen(false)
      props.onLinked?.(clientId)
      router.refresh()
    })
  }

  function handleUnlink() {
    startTransition(async () => {
      const result = await unlinkProjectFromClient(props.projectId)
      if ('error' in result) { toast.error(result.error); return }
      toast.success(t('Client unlinked'))
      setOpen(false)
      props.onUnlinked?.()
      router.refresh()
    })
  }

  const trigger = (() => {
    switch (props.variant) {
      case 'card':
        return (
          <Card variant="glass">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{t('Link a Client')}</CardTitle>
                <UserPlus className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full">
                  <UserPlus className="mr-2 h-4 w-4" />{t('Link Client')}
                </Button>
              </PopoverTrigger>
            </CardContent>
          </Card>
        )
      case 'button':
        return (
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="rounded-full gap-1.5 text-foreground">
              <UserPlus className="h-3.5 w-3.5" />{t('Link Client')}
            </Button>
          </PopoverTrigger>
        )
      case 'inline':
        return (
          <PopoverTrigger asChild>
            <button className="flex items-center gap-1.5 text-lg text-muted-foreground italic hover:text-foreground transition-colors">
              <UserPlus className="h-4 w-4" /><span>{t('No client linked')}</span>
            </button>
          </PopoverTrigger>
        )
      case 'billTo':
        return (
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('Change client')}
              className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </PopoverTrigger>
        )
    }
  })()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {trigger}
      <PopoverContent
        align={props.align ?? 'start'}
        side={props.side ?? 'bottom'}
        className="w-[320px] p-0"
      >
        <Command>
          <CommandInput placeholder={t('Search clients…')} value={search} onValueChange={setSearch} />
          <ClientList search={search} onSelect={handleLink} />
          {props.currentClientId && (
            <div className="border-t border-border px-2 py-1">
              <button
                type="button"
                onClick={handleUnlink}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                {t('Unlink client')}
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ClientList({ search, onSelect }: { search: string; onSelect: (id: string) => void }) {
  const { t } = useTranslation()
  const [clients, setClients] = useState<ClientSearchItem[] | null>(null)
  const [loaded, setLoaded] = useState(false)

  if (!loaded && clients === null) {
    setLoaded(true)
    fetch('/api/clients').then((r) => r.json()).then((d) => setClients(Array.isArray(d) ? d : [])).catch(() => setClients([]))
  }
  if (clients === null) return <CommandEmpty>{t('Loading clients…')}</CommandEmpty>
  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  )
  if (filtered.length === 0) return <CommandEmpty>{t('No clients found.')}</CommandEmpty>
  return (
    <CommandList>
      <CommandGroup>
        {filtered.map((c) => (
          <CommandItem key={c.id} value={c.id} onSelect={() => onSelect(c.id)}>
            <div className="flex flex-col">
              <span>{c.name}</span>
              {c.email && <span className="text-xs text-muted-foreground">{c.email}</span>}
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  )
}
```

### Gear button in the floating pill (DOCUX-01)

```tsx
// components/workspace/estimate/estimate-floating-actions.tsx (MODIFIED)
import { Send, Camera, Settings } from 'lucide-react'

interface EstimateFloatingActionsProps {
  // ...existing props
  onOpenSettings?: () => void  // NEW
}

export function EstimateFloatingActions({ isCurrent, status, onSend, onOpenPhotos, onOpenSettings, linkClientSlot }: EstimateFloatingActionsProps) {
  if (!isCurrent) return null
  const isSaving = status === 'saving'
  return (
    <Pill>
      {onOpenSettings && (
        <Button size="sm" variant="ghost" onClick={onOpenSettings} aria-label="Settings" className="rounded-full text-foreground">
          <Settings className="h-3.5 w-3.5" />
        </Button>
      )}
      {linkClientSlot}
      {onOpenPhotos && (
        <Button size="sm" variant="ghost" onClick={onOpenPhotos} className="rounded-full gap-1.5 text-foreground">
          <Camera className="h-3.5 w-3.5" />Photos
        </Button>
      )}
      <Button size="sm" onClick={onSend} disabled={isSaving} className="rounded-full gap-1.5">
        <Send className="h-3.5 w-3.5" />Send
      </Button>
    </Pill>
  )
}
```

### Resolver-driven section visibility (replaces `isFieldVisible`/`revealed`/`toggleField`)

```tsx
// components/workspace/estimate/estimate-document.tsx — replace lines 1613-1632
import { resolvePresentationSettings, isSectionVisible } from '@/lib/estimate/presentation-settings'

// Inside EstimateDocument:
const resolved = resolvePresentationSettings(data.presentation_settings)  // data type extended in Phase 162 to carry the field through

// Replace every `isFieldVisible('summary')` with:
isSectionVisible(resolved, 'summary')  // for the 'summary' section
isSectionVisible(resolved, 'payment_terms')
// ...etc for all 7 sections

// Delete: `revealed`, `setRevealed`, `toggleField`, `AddDetailsPopover` component + import
```

### Thin solid underline for InlineProjectName (DOCUX-04)

```tsx
// Replace estimate-document.tsx:1459-1467 (the p tag)
<p
  className="text-2xl font-bold cursor-pointer transition-colors border-b border-transparent hover:border-foreground/40 focus-visible:border-foreground/40"
  tabIndex={0}
  onClick={() => { setDraft(name); setEditing(true) }}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDraft(name); setEditing(true) } }}
>
  {name}
</p>
```

Plus port `ProjectTitle`'s validation contract (empty-string + 200-char + i18n toast + error-retry) into `InlineProjectName`.

### Bill To pencil affordance (DOCUX-02)

```tsx
// Replace estimate-document.tsx:1809-1829 (the client && block)
{client && (
  <div className="group">  {/* group needed for opacity-0 group-hover:opacity-100 on the pencil */}
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground select-none">{L.billTo}</p>
      {isEditable && projectId && (
        <ClientPicker
          projectId={projectId}
          currentClientId={client.id ?? null}  // NOTE: DocumentClient currently lacks `id` — see Q1
          variant="billTo"
          align="end"
        />
      )}
    </div>
    <div className="space-y-0.5">
      <p className="text-2xl font-bold">{client.name}</p>
      {/* ...rest unchanged */}
    </div>
  </div>
)}
```

**Caveat:** `DocumentClient` (`estimate-document.tsx:294-302`) does NOT currently carry a client `id`. The Bill To pencil affordance needs the current `client.id` to render the "Unlink" action correctly. Solution: extend `DocumentClient` with `id: string | null` in the same phase; plumb it through `stateToDocumentData()` (`estimate-editor.tsx:35-87`) and `overview-tab.tsx`'s client mapping (line 123-131 currently maps `{name, email, phone, address, city, state, zip}` but omits `id` — add it).

## Q1 — Client-picker consolidation (DOCUX-02, DOCUX-03)

### Current shapes

**LinkClientInline** (`components/workspace/estimate/estimate-document.tsx:1336-1415`)
- Props: `{ projectId: string }`
- Trigger: bare button "No client linked" + UserPlus icon (italic muted-foreground text)
- Content: `Popover` → `PopoverContent w-[280px] p-0 align="start"` → `Command` → `CommandInput placeholder="Search clients…"` → `ClientSearchList`
- Data path: `fetch('/api/clients')` → client-side filter by name/email → `linkProjectToClient(projectId, clientId)` → `toast.success('Client linked')` → `router.refresh()`
- **Status: DEAD CODE** — grep shows only its declaration; nothing renders it in the current JSX tree of `estimate-document.tsx` (the "No client linked" affordance today lives elsewhere or is missing — the doc only renders the Bill To block when `client` is non-null, and doesn't render an inline "add client" prompt inside the paper).

**LinkClientButton** (`components/workspace/link-client-button.tsx:44-95`)
- Props: `{ projectId: string }`
- Trigger: `Button size="sm" variant="ghost"` with UserPlus icon + "Link Client" text, `rounded-full` (fits the floating pill)
- Content: `Popover` → `PopoverContent w-[320px] p-0 align="end" side="top"` → `Command` → `ClientList` (near-identical to LinkClientInline's `ClientSearchList`)
- Data path: same as above (fetch/filter/link)
- Used by: `components/workspace/overview-tab.tsx:77` (in the pill's `linkClientSlot` when no client is linked but an estimate exists)

**LinkClientCard** (`components/workspace/link-client-card.tsx:39-92`)
- Props: `{ projectId: string }`
- Trigger: `<Card variant="glass"><CardHeader> "Link a Client" + UserPlus </CardHeader><CardContent>` explanatory text `<Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="w-full">` UserPlus + "Link Client" `</Button></PopoverTrigger>...` — heavier chrome for the empty-state "no client at all" surface
- Content: `Popover` → `PopoverContent w-[350px] p-0 align="start"` → same `Command` + `ClientList`
- Used by: `components/workspace/client-tab.tsx:52` (rendered when the project has no client)

### The 4th impl (or lack thereof)

CONTEXT.md and SEED-044 both name "the 4th (inline) implementation inside `estimate-document.tsx`." Cross-checked against PITFALLS.md L152 ("3 named candidates + the undocumented 4th"), this refers to `LinkClientInline` itself. There is NO separate 4th picker file/function. Total = 3 code implementations; the "4th" in the spec conflates the anonymous inline placement of `LinkClientInline` with the three named files. **The plan should say "consolidating 3 implementations across 4 call sites" (with 1 call site being NEW: the Bill To pencil).**

### Minimum unified API (variants that cover all call sites)

```ts
interface ClientPickerProps {
  projectId: string
  currentClientId: string | null
  variant: 'card' | 'button' | 'inline' | 'billTo'
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  onLinked?: (clientId: string) => void
  onUnlinked?: () => void
  className?: string
}
```

- `variant='card'` — covers `LinkClientCard` (empty-state, wide, glass card chrome)
- `variant='button'` — covers `LinkClientButton` (floating pill, rounded-full)
- `variant='inline'` — covers `LinkClientInline` (no client linked prompt) — if ever wired
- `variant='billTo'` — NEW — the in-canvas pencil affordance for editing the linked client from inside the doc

**Unlink action:** rendered inside the popover footer ONLY when `currentClientId !== null`. All three current pickers lack this; the shared API adds it as a first-class capability. `unlinkProjectFromClient(projectId)` already exists at `lib/actions/project.ts:272` and is uncalled today — this consolidation makes it live.

### Existing primitives to reuse

- `components/ui/popover.tsx` (Radix Popover) — already used by all 3
- `components/ui/command.tsx` (`cmdk` wrapper) — already used by all 3
- `components/ui/card.tsx` — for `variant='card'` only
- `components/ui/button.tsx` — for `variant='button'` trigger
- Icons: `Pencil`, `UserPlus`, `X` — all already imported elsewhere from `lucide-react`

### Queries needed

- **Existing (reused):** `GET /api/clients` (`app/api/clients/route.ts:7-30`) — returns `{ id, name, email, phone }[]` filtered by active company_id (RLS-safe via `getActiveCompanyId()`). All 3 pickers already consume this.
- **Existing server actions (reused):** `linkProjectToClient(projectId, clientId)` (`lib/actions/project.ts:256`) and `unlinkProjectFromClient(projectId)` (`lib/actions/project.ts:272`). No new actions needed.
- **No additional queries needed** — this is a UI consolidation, not a data layer change. `getCompanyClients` / `getClientById` (mentioned in the questions but named after non-existent functions in the current tree) are covered by the existing `getClients(supabase, companyId)` (`lib/queries/clients.ts:23`) + `getClientById(supabase, clientId)` (`lib/queries/clients.ts:57`) — neither is called by the picker (the picker uses the `/api/clients` route instead).

### DocumentClient extension (required for Bill To variant)

`DocumentClient` (`estimate-document.tsx:294-302`) currently omits `id`. To render the "Unlink" action correctly in the Bill To pencil popover, extend it:

```ts
export interface DocumentClient {
  id: string  // NEW
  name: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}
```

Update `overview-tab.tsx:123-131` and `estimate-editor.tsx` to plumb `id` through. This is a small, contained change but MUST be part of the 3a plan or the Bill To pencil ships without unlink.

## Q2 — Settings panel wiring (DOCUX-01)

### Where panel state lives

**`estimate-editor.tsx` owns `settingsOpen: boolean`.** Mirrors the existing `sendOpen` state pattern in `estimate-tab.tsx:71`:

```tsx
// estimate-editor.tsx (MODIFIED)
export function EstimateEditor({ ... }: EstimateEditorProps) {
  const [state, dispatch] = useEstimateReducer(estimate)
  // ...existing code
  const [settingsOpen, setSettingsOpen] = useState(false)  // NEW

  return (
    <div className="space-y-3">
      <EstimateDocument mode="edit" data={stateToDocumentData(state)} ... dispatch={dispatch} />
      {/* ...existing IssuedInvoicesPanel + GenerateInvoiceDialog */}
      <EstimateFloatingActions
        isCurrent={isCurrent}
        status={slotSaveStatus}
        onSend={handleSend}
        onOpenPhotos={onOpenPhotos}
        onOpenSettings={() => setSettingsOpen(true)}  // NEW
        linkClientSlot={linkClientSlot}
      />
      <PresentationSettingsPanel  // NEW
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={state.presentation_settings}
        onChange={(next) => dispatch({ type: 'UPDATE_PRESENTATION_SETTINGS', presentation_settings: next })}
        estimateSentOrViewed={hasEstimateBeenSentOrViewed({ sent_at: estimate.sent_at, viewed_at: estimate.viewed_at })}
      />
    </div>
  )
}
```

### Exact prop threading

- `EstimateFloatingActions`: gains `onOpenSettings?: () => void` prop (add alongside `onOpenPhotos`, same shape).
- `EstimateEditor`: renders `<PresentationSettingsPanel>` right next to the existing floating actions render. Panel state (`settingsOpen`) lives here.
- No changes needed to `estimate-tab.tsx` — `EstimateEditor` self-owns the panel exactly like it self-owns `saveStatus` and `sendOpen`.
- `hasEstimateBeenSentOrViewed` (from `lib/estimate/presentation-settings.ts:116`) is called at the boundary to feed the PRESENT-05 non-blocking inline notice to the panel.

### Panel content — Pricing section (Tax / Discount / Deposit)

**Tax mode: RadioGroup (Default / Custom / Off) + conditional numeric input for Custom.**
- Rationale: RadioGroup is the most idiomatic shadcn primitive for 3-way exclusive choice. `Select` is fine but less scannable at 3 options; RadioGroup makes the three modes visible at once.
- The Custom input shows only when `mode === 'custom'`, uses `MoneyInput`-style layout OR a percentage number input with `%` suffix.
- Persistence: `mode === 'off'` writes `{ tax: { mode: 'off', preservedRate: <current tax_rate> } }` — captured at the moment 'off' is set (see Phase 161 resolver's `TaxOverride.preservedRate` semantics).

```tsx
<RadioGroup value={settings.tax?.mode ?? 'default'} onValueChange={(mode) => onChange({ ...settings, tax: { ...settings.tax, mode: mode as 'default' | 'custom' | 'off' } })}>
  <RadioGroupItem value="default" id="tax-default" /> <Label htmlFor="tax-default">Default</Label>
  <RadioGroupItem value="custom" id="tax-custom" /> <Label htmlFor="tax-custom">Custom</Label>
  <RadioGroupItem value="off" id="tax-off" /> <Label htmlFor="tax-off">Off</Label>
</RadioGroup>
{settings.tax?.mode === 'custom' && (
  <Input type="number" step="0.01" value={(settings.tax?.customRate ?? 0) * 100} onChange={...} />
)}
```

**Discount: RadioGroup (None / Percent / Amount) + conditional numeric input.** Same shape as Tax; writes `settings.discount = { enabled: !== 'none', type: 'percent'|'amount', value }`.

**Deposit: RadioGroup (None / Percent / Amount) + conditional numeric input.** Same shape as Tax/Discount; writes `settings.deposit = { enabled: !== 'none', type: 'percent'|'amount', value }`.

Alternative: for extreme space savings on mobile, use `Select` instead of `RadioGroup` for the three-mode picker. Not recommended — the panel is already a Sheet on mobile, room is not tight.

### Panel content — Document Sections (visibility toggles)

Seven toggles, one per section, in a two-column grid at wider viewports:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
  {(['summary', 'sections', 'payment_terms', 'timeline', 'warranty_terms', 'notes', 'photos'] as const).map((key) => (
    <div key={key} className="flex items-center justify-between">
      <Label htmlFor={`section-${key}`}>{L[key]}</Label>
      <Switch
        id={`section-${key}`}
        checked={isSectionVisible(resolvePresentationSettings(settings), key)}
        onCheckedChange={(checked) => onChange({
          ...settings,
          sections: { ...settings?.sections, [key]: checked }
        })}
      />
    </div>
  ))}
</div>
```

### Panel content — Client Presentation (PRESENT-05 notice)

A non-blocking inline banner at the top of the panel when the estimate is already sent/viewed:

```tsx
{estimateSentOrViewed && (
  <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
    <Eye className="h-4 w-4 inline mr-1.5" />
    {t('This estimate has already been seen by the client. Changes here will affect the next view.')}
  </div>
)}
```

### GUARD-03 discipline (critical)

Every panel handler dispatches `UPDATE_PRESENTATION_SETTINGS` and nothing else. NEVER:

- `dispatch({ type: 'UPDATE_TAX_RATE', ... })` — would mutate the typed `tax_rate` column (that's the DocumentTotals inline control's job; the panel is separate)
- `dispatch({ type: 'UPDATE_DISCOUNT', ... })` — likewise
- `dispatch({ type: 'UPDATE_DEPOSIT', ... })` — likewise
- Call `recalculate()` directly — the reducer's action already skips it for `UPDATE_PRESENTATION_SETTINGS`

Structural test (see Validation Architecture below): grep the panel file for those action types → must be zero.

### PRESENT-05 signal

`hasEstimateBeenSentOrViewed(estimate)` (`lib/estimate/presentation-settings.ts:116`) is the ONE predicate — takes `{ sent_at, viewed_at }` and returns bool. Phase 161 exposes this; Phase 162 consumes it verbatim. No new tracking infrastructure needed.

## Q3 — Alignment pass (DOCUX-04, DOCUX-05)

### Current inventory (verified line-by-line)

| Region | Line | Padding / spacing / border | Notes |
|--------|------|----------------------------|-------|
| Outer wrapper | 1678 | `rounded-3xl border-4 shadow-lg overflow-hidden` | Uses `borderColor: '#3f3f46'` (hardcoded zinc-700) — not a token |
| Company header | 1702 | `p-4 sm:p-6 border-b border-border` + `borderTopWidth: 3, borderTopStyle: solid, borderTopColor: brandColor` | Only region using `sm:p-6` |
| ESTIMATE title band | 1746 | `py-6 px-6 sm:px-10 text-center` | brandColor fill |
| Info grid (PROJECT / BILL TO) | 1758 | `grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 px-6 sm:px-10 pt-8 sm:pt-10 pb-5 border-b border-border/50` | `pt-8 sm:pt-10 pb-5` is the ONLY place using these top/bottom values |
| Summary block | 1834 | `px-6 sm:px-10 py-4 border-b border-border/50` | `py-4` |
| Section header bar | 723 | `flex items-center gap-2 px-3 py-2 group/header` | **`px-3` breaks alignment with the doc's `px-6 sm:px-10`** |
| Line-item table cells | 523-666 | `py-1 px-1` on every cell | **Tight; no `px-6 sm:px-10` alignment with surrounding sections** |
| Section subtotal footer | 899 | `px-3 py-2 border-t border-border/50 bg-muted/10` | `px-3` again — mismatched with `px-6 sm:px-10` elsewhere |
| Add-item row | 887 | `px-3 py-1.5 border-t border-dashed border-border/50` | `px-3` |
| Mobile stacked-item row | 791 | `px-3 py-2.5 border-b border-border/50 last:border-b-0 even:bg-muted/20` | `px-3` on mobile row (the read-only branch) |
| DocumentTotals | 998 | `flex justify-end px-6 sm:px-10 py-5 border-t border-border/50` | `py-5` |
| Grand-total row | 1133 | `flex justify-between items-baseline pt-3 border-t-2 border-foreground` | Fine as-is |
| Add section / details row | 1907 | `px-6 sm:px-10 py-3 border-t border-dashed border-border/50 flex items-center gap-2` | `py-3` |
| Terms section | 1945 | `px-6 sm:px-10 pb-6 pt-4 border-t border-border/50 space-y-4` | `pb-6 pt-4` |
| Attached photos | 1997 | `px-6 sm:px-10 pb-6 pt-4 border-t border-border/50` | `pb-6 pt-4` |

### Specific inconsistencies to fix

1. **Section header + item table + subtotal footer + add-item + mobile row all use `px-3`** while every other doc surface uses `px-6 sm:px-10`. Fix: bring all section-scoped rows to `px-6 sm:px-10` (or extract a `SECTION_PX = "px-6 sm:px-10"` constant). This is the highest-impact one-line fix.
2. **Info grid uses `pt-8 sm:pt-10 pb-5`** — inconsistent with the doc's other vertical rhythm (mostly `py-4`/`py-5`/`pt-4 pb-6`). Fix: choose ONE vertical rhythm and apply it — recommend `py-6 sm:py-8` for the info grid, matching the doc's other "opening" sections.
3. **DocumentTotals uses `py-5`** but Terms uses `pt-4 pb-6` — different top/bottom asymmetry. Fix: unify — e.g., `py-6` for both, or `pt-5 pb-6` for both.
4. **Hardcoded `borderColor: '#3f3f46'`** on the outer wrapper (line 1696) instead of a token. Fix: use `--border` token or accept the zinc-700 as a light-mode-fixed "paper" border color and add a comment.
5. **Line-item table cells `py-1 px-1`** are ALIGNED HORIZONTALLY with the table, but the TABLE itself sits at `px-3` (or should sit at `px-6 sm:px-10` after fix #1). The `py-1` is fine (compact table row) but the `px-1` on individual cells is the table's internal padding — that's OK to leave.

### Which are one-line fixes vs which need structural change

- **One-line fixes:** #1 (SECTION_PX constant + swap), #4 (border-color token), #5 (leave `py-1 px-1` as table cell padding, no change).
- **Structural change:** #2 and #3 require choosing a single vertical rhythm and applying it uniformly — a design decision, not just a class swap. Recommend `py-6` as the canonical vertical for major sections (opening: Summary/Info Grid/Terms) and `py-4` for tight sections (add-item/add-section rows).

### Naive alignment pass risks to the classic-PDF renderer

The `mode="view"` branch of `EstimateDocument` powers the classic share page (`components/share/estimate-view.tsx`). Existing Playwright visual baselines under `tests/e2e/visual/share.spec.ts` (12 baselines) will diff-fail on any layout change.

**Mitigation:** (a) Enumerate the intended `px-*`/`py-*` changes in the plan BEFORE editing. (b) Regenerate `share.spec.ts` visual baselines as an intentional artifact of Phase 162 (documented in the SUMMARY), then diff-review the new baselines to confirm every diff is an alignment IMPROVEMENT, not an accidental regression. (c) The `@react-pdf/renderer` PDF template (`components/pdf/estimate-pdf.tsx`) is a SEPARATE component tree — untouched by the alignment pass. Confirmed by grep: `components/pdf/*.tsx` never imports from `components/workspace/estimate/estimate-document.tsx`.

## Q4 — Project-name underline (DOCUX-04)

### Current dotted/serrated affordance

**`InlineProjectName`** (`estimate-document.tsx:1421-1467`, ~46 lines)

```tsx
// L1459-1466
<p
  className="text-2xl font-bold cursor-pointer hover:underline decoration-dotted underline-offset-2"
  onClick={() => { setDraft(name); setEditing(true) }}
>
  {name}
</p>
```

- Uses Tailwind `decoration-dotted underline-offset-2` — the "serrated" look the seed complains about.
- Enter/exit edit via local `useState<boolean>('editing')` + `onBlur` commits.
- Validation: `trimmed.length === 0 || trimmed === name` → silently exits edit mode. **NO toast on empty submit. No 200-char check. No error-retry.**
- Server call: `onRename(trimmed)` (delegates to `handleRenameProject` in `estimate-editor.tsx:262-267` which calls `renameProjectAction`).
- On error: `finally { setPending(false); setEditing(false) }` — exits edit mode ON ERROR, losing the user's draft. **This is a UX regression the seed asks us to fix.**

### `ProjectTitle`'s more complete contract

**`components/workspace/project-title.tsx`** (127 lines) — used in the project header chrome (above the estimate document).

Behaviors we must preserve verbatim in the reconciled `InlineProjectName`:

1. **Empty-string validation with i18n toast:** `if (trimmed.length === 0) { toast.error(t('Project name is required')); return }` (L57-60)
2. **200-char limit with i18n toast:** `if (trimmed.length > 200) { toast.error(t('Name must be 200 characters or less')); return }` (L61-64)
3. **Error-retry loop:** on server error, revert `draft` to `name` but **keep editing mode open** so user can retry (L67-73)
4. **Autofocus + select-all:** `inputRef.current?.focus(); inputRef.current?.select()` on enter-edit (L26-31)
5. **No-op if unchanged:** `if (trimmed === name) { setEditing(false); return }` — close without server call (L48-53)
6. **Escape cancels:** `if (e.key === 'Escape') { e.preventDefault(); handleCancel() }` (L91-94)
7. **maxLength on input:** `maxLength={200}` (L99)
8. **aria-label:** `aria-label={t('Project name')}` (L100)
9. **Double-submit guard:** `if (isPending) return` at top of `handleSubmit` (L45)

### Recommended reconciliation

Option A (recommended): **Rewrite `InlineProjectName` to inline ProjectTitle's validation contract, adapting the styling** — thin solid underline via `border-b border-transparent hover:border-foreground/40 focus-visible:border-foreground/40`, keep `text-2xl font-bold` doc-native size.

Option B: **Extract a shared hook** `useInlineProjectRename(projectId, initialName)` returning `{ editing, draft, setDraft, enterEdit, handleSubmit, handleCancel, isPending, inputProps }` and consume it in both `InlineProjectName` and `ProjectTitle`. Higher initial cost but eliminates future drift. Recommend for the plan if the sub-step budget allows; otherwise Option A is fine.

## Q5 — Mobile parity (DOCUX-06, DOCUX-07)

### What `section-card.tsx` + `item-row.tsx` render on mobile

**`section-card.tsx`** (`components/workspace/estimate/section-card.tsx`, 224 lines)
- Renders `<Card>` (default, non-glass) with a `<CardHeader>` containing a section-title `<Input>` + trash button, and a `<CardContent>` with a mobile branch (`sm:hidden space-y-3`) that renders `<ItemCardMobile>` per item and a desktop branch (`hidden sm:block overflow-x-auto`) with a `<table>` of `<SortableItemRow>` (which itself renders `<ItemRow>`, defined in `item-row.tsx`).
- **Status: DEAD** — grep shows only `section-card.tsx` importing `item-row.tsx`. Nothing imports `section-card.tsx`.

**`item-row.tsx`** (`components/workspace/estimate/item-row.tsx`, 113 lines)
- Renders a `<tr>` with `<Input>` for description, `<Input type="number">` for quantity, `<Input>` for unit, `<MoneyInput>` for unit price, a price-source `<Badge>`, formatted total, and trash button.
- **Only imported by `section-card.tsx`** — transitively dead.

**Grep verification:**
```
$ grep -rn "from '.*section-card\|section-card" components/ app/ lib/
components/workspace/estimate/section-card.tsx:24:import { ItemRow } from './item-row'
```
That's the ONLY hit — the file only self-imports. Safe to delete both.

### How desktop renders the same rows (`SortableDocumentItemRow` in `estimate-document.tsx:490-669`)

- `<tr>` with `border-b border-border/50 group even:bg-muted/20`
- Cells use `py-1 px-1` for tight vertical density
- Description: `<PriceBookCombobox>` with `INLINE_INPUT_CLS = 'w-full bg-transparent text-base p-1 focus:outline-none focus:bg-muted/30 focus:rounded-sm hover:bg-muted/20 hover:rounded-sm transition-colors'`
- Qty: `<input type="number">` with `INLINE_INPUT_CLS` + `text-center tabular-nums`
- Unit: `<Select>` with `bg-transparent border-0 shadow-none text-base px-1 hover:bg-muted/20 focus:ring-1 focus:ring-primary/30`
- Unit price: `<MoneyInput>` with `bg-transparent border-0 shadow-none text-right text-base tabular-nums`
- Discount: `<MoneyInput>` (same transparent style)
- Taxable: `<Switch>` (compact)
- Total: `formatMoney(...)` right-aligned tabular-nums
- Trash: `opacity-0 group-hover:opacity-100 ... min-h-[32px] min-w-[32px]`

**Key style: TRANSPARENT INPUTS on the paper document surface.** No `<Card>`, no shadow, no rounded chrome — the input IS the document cell.

### Current mobile branch (`estimate-document.tsx:766-806`)

```tsx
<div className="sm:hidden">
  {section.items.map((item) =>
    isEditable && dispatch ? (
      <ItemCardMobile ... />
    ) : (
      /* view-mode fallback: same paragraph-based render */
    )
  )}
</div>
```

**`ItemCardMobile`** (`item-card-mobile.tsx`, 166 lines)
- Renders `<Card variant="glass" className="p-3 space-y-2">` — the offending glass card
- Standard `<Input>`, `<Select>`, `<MoneyInput>`, `<Switch>` — all default heights (~36px), all with visible borders/backgrounds
- Grid-based layout: `grid grid-cols-[1fr,1fr,1.4fr] gap-2` for qty/unit/price + `grid grid-cols-2 gap-2` for discount/taxable
- Touch targets: `min-h-[44px]` on the taxable Switch row (L134) and `min-h-[44px] min-w-[44px]` on trash (L156)
- Price-source badge visible at the bottom

### Minimum change to unify

**Recommended approach: single component, TWO responsive branches (mobile stacked / desktop table row), same input primitives.**

Because a `<tr>` can't render `<div>`s cleanly, the responsive split is at the ROW LEVEL:

Option A (recommended): **Refactor `ItemCardMobile` to a `<div>`-based document-native row** using the SAME `INLINE_INPUT_CLS`, `bg-transparent`, no `<Card>`, no shadow. Keep it as a separate mobile component but styled to match desktop:

```tsx
// components/workspace/estimate/item-card-mobile.tsx (REBUILT)
export function ItemCardMobile({ item, onUpdate, onRemove, isReadOnly, currencyCode, unitOptions }: ItemCardMobileProps) {
  // ...
  return (
    <div className="border-b border-border/50 last:border-b-0 even:bg-muted/20 px-3 py-2">
      <PriceBookCombobox
        value={item.description}
        onChange={(next) => onUpdate('description', next)}
        className={INLINE_INPUT_CLS}
        // ...
      />
      <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 mt-1 text-sm">
        <span className="text-muted-foreground">Qty</span>
        <input type="number" value={item.quantity} onChange={...} className={`${INLINE_INPUT_CLS} text-right tabular-nums`} />
        <span className="text-muted-foreground">Unit</span>
        <Select value={item.unit ?? ''} onValueChange={...}>
          <SelectTrigger className="h-8 bg-transparent border-0 shadow-none text-right">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>{unitOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-muted-foreground">Unit Price</span>
        <MoneyInput value={item.unit_price} currencyCode={currencyCode} onValueChange={...} className="h-8 bg-transparent border-0 shadow-none text-right text-base tabular-nums" />
        <span className="text-muted-foreground">Discount</span>
        <MoneyInput value={item.discount ?? 0} currencyCode={currencyCode} onValueChange={...} className="h-8 bg-transparent border-0 shadow-none text-right text-base tabular-nums" />
        <span className="text-muted-foreground flex items-center">Taxable</span>
        <div className="flex items-center justify-end min-h-[44px]">
          <Switch checked={item.taxable ?? true} onCheckedChange={...} aria-label="Taxable" />
        </div>
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
        <span className="text-sm font-semibold tabular-nums">{formatMoney(item.total, currencyCode)}</span>
        {!isReadOnly && (
          <button
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Remove item"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
```

Key changes from current `ItemCardMobile`:
- `<Card variant="glass">` → `<div>` with `border-b border-border/50 last:border-b-0 even:bg-muted/20 px-3 py-2`
- Default inputs → `INLINE_INPUT_CLS`-based transparent inputs
- No shadow, no rounded chrome
- Keep 44px touch targets on Switch container + trash button
- Price-source badges MOVE to a smaller inline metadata (or drop — mobile has less horizontal space; the seed's own open decision #5 explicitly asks whether to hide them; recommend hiding on mobile, showing on desktop only)

Option B: **Alternative — extract a shared component** `<DocumentItemFields>` that renders inputs+their inline styling identically for both branches; the mobile branch wraps them in `<div>` stacks, the desktop branch wraps them in `<td>` cells. Higher effort but zero drift risk. Recommend Option A for phase-scope, Option B if drift becomes a problem later.

### Touch targets to preserve

- `min-h-[44px] min-w-[44px]` on trash button (mobile + desktop's is `min-h-[32px] min-w-[32px]` — mobile MUST stay at 44)
- `min-h-[44px]` on Switch container (WCAG 2.5.5 Level AA)

### Deletion candidates (grep list)

Files to delete:
- `components/workspace/estimate/section-card.tsx` — grep across `components/`, `app/`, `lib/` returns zero external importers (only self)
- `components/workspace/estimate/item-row.tsx` — imported only by `section-card.tsx` (transitively dead)

Grep-verifiable acceptance:
```bash
grep -rE "section-card|item-row" components/ app/ lib/ | grep -v "\.deleted\|\.bak"
```
Must return zero after the deletion. If ANY hit remains, the deletion is incomplete.

Additional grep to run: ensure no test file references them:
```bash
grep -rE "section-card|item-row|SectionCard|ItemRow" tests/
```

## Q6 — File contention and parallelization within sub-steps

### Line ranges by sub-step

**3a — Client-picker consolidation + alignment pass**
- NEW: `components/clients/client-picker.tsx` (entire new file)
- `components/workspace/link-client-button.tsx` (entire file, either delete or refactor to `export function LinkClientButton(props) { return <ClientPicker variant="button" {...props} /> }`)
- `components/workspace/link-client-card.tsx` (entire file, likewise)
- `components/workspace/overview-tab.tsx`: L5 (import swap), L77 (JSX swap)
- `components/workspace/client-tab.tsx`: L13 (import swap), L52 (JSX swap)
- `components/workspace/estimate/estimate-document.tsx`:
  - L1336-1415 (`LinkClientInline` + `ClientSearchList` deletion — logic folds into ClientPicker)
  - L1421-1467 (`InlineProjectName` reconciliation — thin solid underline + ProjectTitle validation)
  - L1808-1830 (Bill To block gains pencil affordance)
  - Alignment pass: L1700-2016 doc-shell paddings (section-scoped changes; ~15-25 class updates)
- `components/workspace/estimate/estimate-editor.tsx`: `stateToDocumentData` extension for `DocumentClient.id` field (L58-87)
- `components/workspace/overview-tab.tsx`: client mapping extension for `id` (L123-131)

**3b — Gear-icon settings panel wired to `UPDATE_PRESENTATION_SETTINGS`**
- NEW: `components/workspace/estimate/presentation-settings-panel.tsx` (entire new file)
- NEW (optional): `lib/hooks/use-is-mobile.ts`
- `components/workspace/estimate/estimate-floating-actions.tsx`: L1-71 (add `onOpenSettings` prop + Gear button)
- `components/workspace/estimate/estimate-editor.tsx`: L195-441 (add `settingsOpen` state + `<PresentationSettingsPanel>` render + `hasEstimateBeenSentOrViewed` call)
- `components/workspace/estimate/estimate-document.tsx`:
  - L1470-1522 (`AddDetailsPopover` deletion)
  - L1613-1632 (`revealed`, `setRevealed`, `toggleField`, `isFieldVisible` deletion — replace with resolver-driven `isSectionVisible`)
  - L1833-2015 (rewire section-render gates to consume `isSectionVisible(resolved, key)` instead of local `isFieldVisible`)
  - Add import: `import { resolvePresentationSettings, isSectionVisible } from '@/lib/estimate/presentation-settings'`
  - Add prop passthrough: `EstimateDocumentData` gains `presentation_settings?: PresentationSettings | null` — MUST be extended AND threaded from `estimate-editor.tsx:stateToDocumentData()`

**3c — Mobile line-item editor rebuild + section-card/item-row deletion**
- DELETED: `components/workspace/estimate/section-card.tsx`
- DELETED: `components/workspace/estimate/item-row.tsx`
- REBUILT: `components/workspace/estimate/item-card-mobile.tsx` (entire file — new document-native shape per Q5)
- `components/workspace/estimate/estimate-document.tsx`: L766-806 (mobile branch — verify `<ItemCardMobile>` still renders correctly; may need class tweaks)

### Can 3a-i (picker component creation) and 3a-ii (call-site swap) parallelize?

Yes, WITH a caveat:
- 3a-i writes a new file `components/clients/client-picker.tsx`. Nothing depends on it until it exists AND its `ClientPickerProps` API is locked.
- 3a-ii swaps existing imports at 4 call sites (`overview-tab.tsx`, `client-tab.tsx`, `link-client-button.tsx`, `link-client-card.tsx`, `estimate-document.tsx` Bill To). It needs the `ClientPickerProps` shape decided.

**Parallelization strategy:** Lock the `ClientPickerProps` interface in the plan as a first-class artifact BEFORE 3a-i and 3a-ii task assignment. Then:
- 3a-i implements the new file
- 3a-ii swaps call sites, importing the yet-to-be-implemented picker (TS may complain until 3a-i lands; that's OK)
- Merge order: 3a-i first, 3a-ii second (or same wave if the runner supports staged commits)

Alternatively (safer): sequence 3a-i → 3a-ii → alignment pass. Since 3a-i is small (~200 lines new file) and 3a-ii is trivial mechanical swap (~5 files × 2 lines), the sequential wave still fits.

### Can 3c internally parallelize?

Yes, LOW risk:
- Deleting `section-card.tsx` + `item-row.tsx` is independent of rebuilding `item-card-mobile.tsx`.
- Both should be in the same 3c wave; the deletion can happen as its own task (single commit, grep-verifiable) before or after the mobile-editor rebuild.
- The mobile-editor rebuild touches the mobile branch inside `estimate-document.tsx:766-806` — this branch already imports `ItemCardMobile`, so as long as the rebuild preserves the `<ItemCardMobile>` JSX signature (same prop names), no changes needed in `estimate-document.tsx`.

### Sequencing summary

- 3a and 3b share `estimate-document.tsx` heavily; MUST be sequential (3a → 3b) per ROADMAP.
- 3c shares `estimate-document.tsx`'s mobile branch (small, isolated) + deletes 2 dead files. Sequenced after 3b so mobile parity is verified against the FINAL post-3a-3b desktop state.
- Within 3a: creation + call-site swap CAN parallelize once the picker API is locked.
- Within 3b: no internal parallelization (single new file + integrated `estimate-document.tsx` rewire).
- Within 3c: deletion + mobile rebuild CAN parallelize.

## Runtime State Inventory

> Skipped — Phase 162 is a pure UI/component refactor within the running app. No rename/rebrand/data-migration; no external database seeds/collections/user_ids named after removed components; no service-side configuration references. The two dead-code deletions (`section-card.tsx`, `item-row.tsx`) leave no runtime state behind (they were unused; nothing calls them).
>
> Explicit checks:
> - **Stored data:** None. `estimates.presentation_settings` was landed dormant-first in Phase 161; no legacy rows carry references to `section-card`/`item-row`/`LinkClient*`.
> - **Live service config:** None. n8n/Datadog/Cloudflare have no service names or dashboards referencing these UI components.
> - **OS-registered state:** None. No launchd/systemd/pm2 processes named after these components.
> - **Secrets/env vars:** None. No SOPS/`.env` keys reference them.
> - **Build artifacts:** After deletion, run `npm run build` to confirm no stale `.next/` chunks reference removed modules. Standard cleanup.

## Environment Availability

> Skipped — Phase 162 is code/config-only. No external CLI tools, databases, or services need to be probed. The phase runs entirely inside the existing Next.js dev/build/test pipeline that Phase 161 already exercised.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.4` + `@testing-library/react` `^16.3.2` (unit/component) + `@playwright/test` `^1.59.1` (visual/e2e) |
| Config file | `vitest.config.ts` (unit) + `playwright.config.ts` (e2e) |
| Quick run command | `npx vitest run tests/unit/components/presentation-settings-panel.test.tsx` |
| Full suite command | `npm test` (unit) + `npm run test:e2e -- tests/e2e/visual/share.spec.ts` (visual, on demand) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **DOCUX-01** | Gear button renders on left of the pill; click opens `<PresentationSettingsPanel>` | unit (RTL) | `npx vitest run tests/unit/components/estimate-floating-actions.test.tsx -t "gear opens settings"` | ❌ Wave 0 |
| **DOCUX-01** | Panel toggle → `dispatch({ type: 'UPDATE_PRESENTATION_SETTINGS', ... })` (mocked) | unit (RTL) | `npx vitest run tests/unit/components/presentation-settings-panel.test.tsx -t "dispatches UPDATE_PRESENTATION_SETTINGS"` | ❌ Wave 0 |
| **DOCUX-01** | Panel NEVER dispatches `UPDATE_TAX_RATE`/`UPDATE_DISCOUNT`/`UPDATE_DEPOSIT` (GUARD-03) | unit (static grep) | `test -z "$(grep -E 'UPDATE_TAX_RATE\|UPDATE_DISCOUNT\|UPDATE_DEPOSIT' components/workspace/estimate/presentation-settings-panel.tsx)"` | ❌ Wave 0 |
| **DOCUX-01** | Panel is `Popover` on ≥768px viewport, `Sheet side="bottom"` on <768px | unit (RTL with `matchMedia` mock) | `npx vitest run tests/unit/components/presentation-settings-panel.test.tsx -t "responsive branch"` | ❌ Wave 0 |
| **DOCUX-01** | PRESENT-05 notice renders when `sent_at` OR `viewed_at` non-null | unit (RTL) | `npx vitest run tests/unit/components/presentation-settings-panel.test.tsx -t "sent or viewed notice"` | ❌ Wave 0 |
| **DOCUX-02** | Bill To pencil affordance hidden by default, revealed on hover/focus of the block | unit (RTL) | `npx vitest run tests/unit/estimate/document-bill-to.test.tsx -t "pencil hover"` | ❌ Wave 0 |
| **DOCUX-02** | Click Bill To pencil opens `<ClientPicker variant="billTo">` popover | unit (RTL) | `npx vitest run tests/unit/estimate/document-bill-to.test.tsx -t "opens picker"` | ❌ Wave 0 |
| **DOCUX-02** | Selecting a client in the popover dispatches `linkProjectToClient` (mocked); refreshes | unit (RTL, mock server-action) | `npx vitest run tests/unit/estimate/document-bill-to.test.tsx -t "linkProjectToClient"` | ❌ Wave 0 |
| **DOCUX-02** | "Unlink" footer button in `variant='billTo'` calls `unlinkProjectFromClient` | unit (RTL, mock server-action) | `npx vitest run tests/unit/clients/client-picker.test.tsx -t "unlink"` | ❌ Wave 0 |
| **DOCUX-03** | Grep-verifiable: NO `LinkClientInline`/`LinkClientButton`/`LinkClientCard` references outside the picker file itself | unit (static grep) | `test -z "$(grep -rE 'LinkClientInline\|LinkClientButton\|LinkClientCard' components/ app/ lib/ \| grep -v client-picker.tsx)"` | ❌ Wave 0 |
| **DOCUX-03** | `<ClientPicker variant="button">` renders in overview pill; passes `linkClientSlot` shape | unit (RTL) | `npx vitest run tests/unit/clients/client-picker.test.tsx -t "button variant"` | ❌ Wave 0 |
| **DOCUX-03** | `<ClientPicker variant="card">` renders in no-client client-tab | unit (RTL) | `npx vitest run tests/unit/clients/client-picker.test.tsx -t "card variant"` | ❌ Wave 0 |
| **DOCUX-04** | `InlineProjectName` DOM does NOT contain `decoration-dotted`; contains `border-b` | unit (RTL, class assertion) | `npx vitest run tests/unit/estimate/inline-project-name.test.tsx -t "solid underline"` | ❌ Wave 0 |
| **DOCUX-04** | Empty submit → `toast.error` called; stays in edit mode | unit (RTL, mock toast) | `npx vitest run tests/unit/estimate/inline-project-name.test.tsx -t "empty validation"` | ❌ Wave 0 |
| **DOCUX-04** | >200 char submit → `toast.error`; stays in edit mode | unit (RTL, mock toast) | `npx vitest run tests/unit/estimate/inline-project-name.test.tsx -t "200 char limit"` | ❌ Wave 0 |
| **DOCUX-04** | Server error → toast + revert draft + stay in edit mode | unit (RTL, mock action) | `npx vitest run tests/unit/estimate/inline-project-name.test.tsx -t "error retry"` | ❌ Wave 0 |
| **DOCUX-05** | Section-scoped surfaces use `px-6 sm:px-10` (not `px-3`) | unit (RTL, class assertion) | `npx vitest run tests/unit/estimate/document-alignment.test.tsx -t "section padding"` | ❌ Wave 0 |
| **DOCUX-05** | DOM structure snapshot of `mode="view"` render matches (or intentionally diffs) baseline | unit (RTL toMatchSnapshot) | `npx vitest run tests/unit/estimate/document-alignment.test.tsx -t "view mode DOM"` | ❌ Wave 0 |
| **DOCUX-05** | Playwright visual: `mode="view"` share page renders at 3 viewports × 3 langs = 9 baselines | e2e visual | `npx playwright test tests/e2e/visual/share.spec.ts` | ⚠️ manual review — baselines regenerated intentionally as artifact of Phase 162 |
| **DOCUX-05** | Mobile branch at 360/390/430px doesn't introduce text clipping | e2e visual | `npx playwright test tests/e2e/visual/workspace.spec.ts -g "estimate mobile"` | ⚠️ MANUAL (visual UAT) |
| **DOCUX-06** | `<Card variant="glass">` is GONE from the mobile line-item path | unit (RTL, class assertion) | `npx vitest run tests/unit/estimate/mobile-line-item.test.tsx -t "no glass card"` | ❌ Wave 0 |
| **DOCUX-06** | Mobile row uses `INLINE_INPUT_CLS`-style transparent inputs | unit (RTL, class assertion) | `npx vitest run tests/unit/estimate/mobile-line-item.test.tsx -t "transparent inputs"` | ❌ Wave 0 |
| **DOCUX-06** | Touch targets preserved: `min-h-[44px]` on Switch container + trash | unit (RTL, class assertion) | `npx vitest run tests/unit/estimate/mobile-line-item.test.tsx -t "touch targets"` | ❌ Wave 0 |
| **DOCUX-06** | 360/390/430px visual UAT — no clipping, no touch regression | e2e visual OR manual | `npx playwright test tests/e2e/visual/workspace.spec.ts` | ⚠️ MANUAL (visual UAT) |
| **DOCUX-07** | `section-card.tsx` + `item-row.tsx` files do not exist | unit (static file check) | `test ! -f components/workspace/estimate/section-card.tsx && test ! -f components/workspace/estimate/item-row.tsx` | ❌ Wave 0 |
| **DOCUX-07** | Grep-verifiable: NO `section-card`/`item-row` references in `components/`, `app/`, `lib/`, `tests/` | unit (static grep) | `test -z "$(grep -rE 'section-card\|item-row' components/ app/ lib/ tests/ \| grep -v '\.deleted\|\.bak')"` | ❌ Wave 0 |

### Hidden Regressions to Guard

1. **Classic PDF/share renderer DOM stability** (DOCUX-05):
   - `EstimateDocument mode="view"` powers the classic share page (`components/share/estimate-view.tsx`) AND is referenced by classic-PDF (`components/pdf/estimate-pdf.tsx` — verify independence).
   - Guard: DOM snapshot test on `mode="view"` render (`toMatchSnapshot()` — new baseline captured after Phase 162's alignment pass). If Phase 163 or later inadvertently changes the doc shell, the snapshot flags it.
   - Additionally regenerate `tests/e2e/visual/share.spec.ts` baselines as an intentional artifact of Phase 162; document in SUMMARY.md.

2. **GUARD-03 boundary** (DOCUX-01):
   - Static grep on `presentation-settings-panel.tsx`: NO occurrence of `UPDATE_TAX_RATE`, `UPDATE_DISCOUNT`, `UPDATE_DEPOSIT`, `recalculate`, or any direct `state.tax_rate =` mutation.
   - Static grep on `presentation-settings-panel.tsx`: NO import of `compute-totals.ts` (the pure resolver is the ONLY math seam).

3. **Client-picker consolidation completeness** (DOCUX-03):
   - Grep: `LinkClientInline\|LinkClientButton\|LinkClientCard` returns hits ONLY inside `components/clients/client-picker.tsx` (as a thin export re-map) OR in NEW test files. Anywhere else = fork risk.

4. **Reducer state / server pass-through** (Phase 161-02 seam):
   - Extend `EstimateDocumentData` (`estimate-document.tsx:343-368`) with `presentation_settings?: PresentationSettings | null`.
   - Extend `stateToDocumentData()` (`estimate-editor.tsx:35-87`) to thread `state.presentation_settings` through.
   - Assert `stateToSavePayload()` includes `presentation_settings` — already added in Phase 161-02, verify with unit test.

5. **DocumentClient.id plumbing** (DOCUX-02):
   - `overview-tab.tsx:123-131` currently omits `id` when mapping `project.client` → `DocumentClient`. Extend to include `id`.
   - Assert via unit test that a linked client's `id` reaches `<ClientPicker variant="billTo">` prop.

### Sampling Rate

- **Per task commit:** `npx vitest run <specific test file>` — expected <10s per file
- **Per wave merge (end of 3a / 3b / 3c):** `npm test` — full unit suite, expected 60-120s
- **Phase gate (before `/gsd:verify-work`):** `npm test` GREEN + intentional regenerate of `tests/e2e/visual/share.spec.ts` baselines + manual visual UAT at 360/390/430 px

### Wave 0 Gaps

- [ ] `tests/unit/clients/client-picker.test.tsx` — covers DOCUX-02, DOCUX-03 (all 4 variants)
- [ ] `tests/unit/components/presentation-settings-panel.test.tsx` — covers DOCUX-01 (panel behavior + GUARD-03)
- [ ] `tests/unit/components/estimate-floating-actions.test.tsx` — covers DOCUX-01 (gear button placement + onOpenSettings trigger)
- [ ] `tests/unit/estimate/document-bill-to.test.tsx` — covers DOCUX-02 (pencil affordance + picker interaction)
- [ ] `tests/unit/estimate/inline-project-name.test.tsx` — covers DOCUX-04 (underline + validation + error-retry)
- [ ] `tests/unit/estimate/document-alignment.test.tsx` — covers DOCUX-05 (padding assertions + DOM snapshot)
- [ ] `tests/unit/estimate/mobile-line-item.test.tsx` — covers DOCUX-06 (no glass card + touch targets)
- [ ] Optional Wave 0: `lib/hooks/use-is-mobile.ts` + `tests/unit/hooks/use-is-mobile.test.ts` — IF extracted

*Framework install:* none needed — Vitest + @testing-library/react are already in place.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Destructive `toggleField()` clearing `data.summary = null` to hide | Non-destructive `presentation_settings.sections.summary = false` (content preserved) | This phase (Phase 162) | Owner can hide/re-show sections without regenerating the text |
| 3 separate client-picker files with duplicated fetch/filter/link logic | ONE `<ClientPicker variant="...">` | This phase | Future features (unlink, inline-create) added once |
| Dotted/serrated project-name underline (`decoration-dotted`) with no validation | Thin solid `border-b` underline with `ProjectTitle`'s validation/error-retry contract | This phase | Consistent app-wide UX; better error handling |
| Standalone `<Card variant="glass">` mobile line-item editor | Document-native transparent-input row matching desktop table language | This phase | Feels like one product on mobile + desktop |
| Two-hide-mechanism collision (`AddDetailsPopover.toggleField` + gear panel) | ONE hiding mechanism (`presentation_settings` via gear panel) | This phase | No user confusion, no data loss |
| `revealed: Set<OptionalField>` in-memory only visibility | Persisted `presentation_settings.sections` via `resolvePresentationSettings` | This phase | Visibility survives page refresh, applies to share/PDF (Phase 163) |

**Deprecated/outdated:**
- `components/workspace/estimate/section-card.tsx` — dead, deleted
- `components/workspace/estimate/item-row.tsx` — dead (only used by section-card.tsx), deleted
- `components/workspace/link-client-button.tsx` — replaced by `<ClientPicker variant="button">` (delete OR keep as re-export shim; recommend delete + swap call sites)
- `components/workspace/link-client-card.tsx` — replaced by `<ClientPicker variant="card">` (likewise)
- `LinkClientInline` + `ClientSearchList` (dead code inside `estimate-document.tsx:1336-1415`) — replaced by `<ClientPicker variant="inline">`; delete inline definitions
- `AddDetailsPopover` (`estimate-document.tsx:1470-1522`) + `revealed`/`toggleField`/`isFieldVisible` (L1613-1632) — replaced by resolver-driven visibility; delete all four

## Open Questions

1. **Should `InlineProjectName`'s validation logic be extracted to a shared hook (`lib/hooks/use-inline-project-rename.ts`) or inlined into `InlineProjectName` alongside `ProjectTitle`'s existing implementation?**
   - What we know: `ProjectTitle` is 127 lines with full validation; `InlineProjectName` is 46 lines with none. Both need the same server-action + validation contract.
   - What's unclear: whether the plan's scope allows a shared-hook extraction, or whether inlining is cheaper and acceptable.
   - Recommendation: Inline into `InlineProjectName` for this phase (Option A in Q4). Extract to a shared hook only if `ProjectTitle` ALSO gets touched (which is not planned in Phase 162). Defer the shared-hook refactor to a future quick task if drift becomes a problem.

2. **Should `link-client-button.tsx` / `link-client-card.tsx` files be deleted outright OR kept as thin re-export shims for the transition?**
   - What we know: Both currently have 2 external call sites (`overview-tab.tsx` uses `LinkClientButton`; `client-tab.tsx` uses `LinkClientCard`). Once swapped to `<ClientPicker variant="...">`, the two files have no consumers.
   - What's unclear: whether preserving them as shims (`export const LinkClientButton = (props) => <ClientPicker variant="button" {...props} />`) gives us any benefit vs a clean delete.
   - Recommendation: DELETE outright. Grep-verifiable acceptance of DOCUX-03 requires zero external references anyway; a shim just delays the cleanup.

3. **Should the alignment pass regenerate Playwright share visual baselines (`tests/e2e/visual/share.spec.ts`)?**
   - What we know: The 12 existing baselines will diff-fail on any doc-shell padding change. `mode="view"` is the same `EstimateDocument` component.
   - What's unclear: whether visual regeneration is treated as an intentional Phase 162 artifact (documented in SUMMARY.md + committed) or as out-of-scope drift.
   - Recommendation: Regenerate as an intentional artifact. The alignment pass is EXPECTED to change the share page's visual layout (that's the point — the share page should be as aligned as the editor). Update baselines, diff-review, commit.

4. **Should `DocumentClient` gain `id` in Phase 162 or is it acceptable to plumb the current `client.id` via a separate prop to `<ClientPicker variant="billTo" currentClientId={project.client?.id ?? null}>`?**
   - What we know: `DocumentClient` (`estimate-document.tsx:294-302`) currently lacks `id`. The Bill To pencil's ClientPicker needs `currentClientId` for the Unlink action.
   - What's unclear: whether extending `DocumentClient` with `id` is cleaner OR adding a separate `currentClientId` prop to `EstimateDocument` bypasses the type extension.
   - Recommendation: Extend `DocumentClient` with `id: string` — it's a natural field of a client and future-proofs downstream renderers (PDF, share) if they ever need to link to a client detail page. Small, contained change.

5. **Does 3b's `AddDetailsPopover` deletion break any UX flow that today lets an owner "add a Summary/Timeline/etc. section from scratch"?**
   - What we know: `AddDetailsPopover` (L1475-1522) offers a `[+] Add details` dropdown listing Summary/Payment Terms/Timeline/Warranty/Notes. Clicking one either adds it to `revealed` (if `data.field == null`) or destructively removes it (if `data.field != null`).
   - What's unclear: without `AddDetailsPopover`, how does an owner ADD a Summary/Notes section that was never generated (e.g. an estimate created via `createBlankEstimate` where `summary` is `null`)?
   - Recommendation: The gear panel's Document Sections toggles serve as the show/hide control. If a section is ON but its content field is `null`, render an empty placeholder textarea inline (mirrors today's `revealed` state semantics). If the section is OFF, don't render at all. This preserves the "add details" UX without a separate popover.

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `components/workspace/estimate/estimate-document.tsx` (full 2018 lines, sampled at all critical regions: SortableDocumentItemRow L490-669, DocumentSectionBlock L675-907, DocumentTotals L964-1228, TermsBlock L1275-1333, LinkClientInline L1336-1415, InlineProjectName L1421-1467, AddDetailsPopover L1475-1522, main render L1585-2018)
- `components/workspace/estimate/estimate-editor.tsx` (full 441 lines)
- `components/workspace/estimate/estimate-floating-actions.tsx` (full 71 lines)
- `components/workspace/estimate/use-estimate-reducer.ts` (full 562 lines — confirms `UPDATE_PRESENTATION_SETTINGS` action + state field already exist)
- `components/workspace/estimate/estimate-tab.tsx` (full 210 lines)
- `components/workspace/estimate/item-card-mobile.tsx` (full 166 lines)
- `components/workspace/estimate/section-card.tsx` (full 224 lines, confirmed dead)
- `components/workspace/estimate/item-row.tsx` (full 113 lines, confirmed dead)
- `components/workspace/link-client-button.tsx` (full 150 lines)
- `components/workspace/link-client-card.tsx` (full 145 lines)
- `components/workspace/overview-tab.tsx` (full 143 lines)
- `components/workspace/client-tab.tsx` (full 129 lines)
- `components/workspace/project-title.tsx` (full 127 lines — the reference contract for DOCUX-04)
- `components/workspace/project-workspace.tsx` (relevant slice L60-93)
- `components/app-shell/sidebar.tsx` (relevant slice L53-164 — the `matchMedia` precedent)
- `components/ui/popover.tsx` (full 90 lines)
- `components/ui/sheet.tsx` (relevant slice L1-50)
- `components/ui/command.tsx` (referenced via existing pickers)
- `lib/estimate/presentation-settings.ts` (full 130 lines — Phase 161's resolver + `hasEstimateBeenSentOrViewed`)
- `lib/actions/project.ts` (L256-286 — `linkProjectToClient` + `unlinkProjectFromClient`)
- `lib/queries/clients.ts` (full 92 lines)
- `app/api/clients/route.ts` (full 30 lines)
- `.planning/phases/162-estimate-document-consolidated-pass/162-CONTEXT.md`
- `.planning/REQUIREMENTS.md` (v4.18 milestone)
- `.planning/ROADMAP.md` (Phase 162 slice L2540-2577)
- `.planning/phases/161-presentation-settings-data-model-persistence/161-RESEARCH.md` (context for what Phase 161 landed)
- `.planning/phases/161-presentation-settings-data-model-persistence/161-VALIDATION.md` (validation-arch pattern to mirror)
- `.planning/research/ARCHITECTURE.md` (v4.18 cross-seed architecture)
- `.planning/research/PITFALLS.md` (v4.18 cross-seed pitfalls — pitfalls 2, 7 directly relevant)
- `.planning/research/STACK.md` (v4.18 stack decisions — L55-63, L84-91, L107-108 directly relevant)
- `.planning/seeds/SEED-041-estimate-settings-control-panel.md` (full)
- `.planning/seeds/SEED-043-mobile-estimate-line-item-editor-parity.md` (full)
- `.planning/seeds/SEED-044-estimate-document-alignment-and-client-editing.md` (full)
- `CLAUDE.md` (project-level instructions)
- `.planning/config.json` (Nyquist validation `true`, so `## Validation Architecture` included)

### Secondary (MEDIUM confidence — supporting)

- `package.json` (dependency versions — vitest ^4.1.4, radix-ui ^1.4.3, cmdk ^1.1.1, @testing-library/react ^16.3.2, @playwright/test ^1.59.1)
- `tests/unit/estimate/document-totals-view.test.tsx` (existing RTL test pattern to mirror)
- `tests/unit/estimate/presentation-settings.test.ts` (Phase 161 resolver test — pattern reference)

### Tertiary (LOW confidence — none used)

- No unverified web sources — this phase is a pure codebase refactor.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dep already in `package.json`, every UI primitive already in `components/ui/`
- Architecture: HIGH — file-by-file line-range verification of what changes where
- Client-picker consolidation: HIGH — read all 3 impls verbatim + confirmed the "4th" is not a distinct code artifact
- Alignment pass: MEDIUM-HIGH — inventoried existing padding/spacing values; the "target" values are recommendations that need visual review at plan-check time
- Panel wiring: HIGH — Phase 161's `UPDATE_PRESENTATION_SETTINGS` action + state field are landed and consumable; the panel is pure UI on top of an existing seam
- Mobile parity: HIGH — the two dead-code files verified dead by grep + line-by-line reading of `ItemCardMobile` vs `SortableDocumentItemRow`
- Validation: HIGH — Vitest + @testing-library/react are the codebase's established test stack; test files can grep-verify GUARD-03 discipline

**Research date:** 2026-07-08
**Valid until:** 2026-08-07 (30 days — the codebase is under active development; Phase 163 is likely to touch some of the same files)
