# Phase 162: Estimate Document Consolidated Pass - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning
**Mode:** Autonomous (discuss batched into ROADMAP-driven decisions; owner unreachable per no-checkpoint-interruptions memory)

<domain>
## Phase Boundary

Overhaul the estimate-document surface in a single, internally-sequenced pass — the 2018-line `components/workspace/estimate/estimate-document.tsx` file plus the fragmented client-picker components — because 3 of the 4 v4.18 seeds (SEED-042/043/044) touch the same file, and coordinating them as one refactor is materially safer than 3 back-to-back file edits.

Requirements in scope: DOCUX-01, DOCUX-02, DOCUX-03, DOCUX-04, DOCUX-05, DOCUX-06, DOCUX-07.

Non-goals (deferred to Phase 163):
- The Send Hub itself (format-first Online/PDF/Plain-Text tab reorg).
- Threading `resolvePresentationSettings()` into every downstream renderer (classic PDF, modern PDF, share pages, plain-text template, WhatsApp formatter) — Phase 163's job.
- Any changes to `lib/estimate/presentation-settings.ts` (Phase 161 resolver is frozen).

Sub-step sequencing (locked by ROADMAP, not parallelizable):
- **3a** — Client-picker consolidation (one component replacing `LinkClientInline`, `LinkClientButton`, `LinkClientCard`, and the 4th impl inside `estimate-document.tsx`) + full document alignment pass.
- **3b** — Gear-icon settings panel wired to the Phase 161 `UPDATE_PRESENTATION_SETTINGS` reducer action.
- **3c** — Mobile line-item editor rebuilt to match the desktop document-native table language; `section-card.tsx` and `item-row.tsx` deleted with zero remaining imports.

</domain>

<decisions>
## Implementation Decisions

### Locked by the ROADMAP (non-negotiable)

- **Gear icon placement**: left side of the existing floating `Photos / Send` pill (the one Phase 160's UI polish landed).
- **Settings panel format**: popover on desktop, bottom sheet on mobile — reuses the existing shadcn `Popover` + `Sheet` primitives.
- **Panel contents**: three groups — Pricing (tax/discount/deposit overrides), Document Sections (visibility toggles), Client Presentation (per PRESENT-05 sent/viewed status handling). Every control writes through `UPDATE_PRESENTATION_SETTINGS` — never `UPDATE_TAX_RATE`/`UPDATE_DEPOSIT`/etc. GUARD-03: the panel NEVER calls `recalculate()` or touches totals math on the client.
- **Bill To editing**: in-canvas pencil affordance on hover/focus in edit mode; opens a compact popover using the consolidated client-picker; supports search / switch / unlink.
- **Project name underline**: thin solid `border-b border-foreground/40` (or equivalent) on hover/focus, replacing the current dotted/serrated. `ProjectTitle`'s validation/error-retry behavior is preserved verbatim.
- **Mobile line-item parity**: 360/390/430 px viewports must render the same document-native table language as desktop — no separate glass card, no text clipping, no touch-target regression from the existing implementation.
- **Deletions**: `components/workspace/estimate/section-card.tsx` and `components/workspace/estimate/item-row.tsx` are removed. Zero remaining imports post-phase (grep-verifiable acceptance criterion).

### Claude's Discretion (autonomously chosen; the ROADMAP left these open)

- **Consolidated client-picker file location**: `components/clients/client-picker.tsx` (top-level `components/clients/` so it can be reused everywhere — editor, header, settings — matches the existing `components/projects/` / `components/workspace/` pattern).
- **Panel labelling / iconography**: use existing lucide icons already in the codebase (`Settings`, `Eye`, `EyeOff`, `DollarSign`, `Percent`). No new icon imports if a suitable one already exists.
- **Popover vs Dialog for Bill To edit**: `Popover` (in-canvas, contextual — matches the ROADMAP's "in-canvas pencil affordance" language). Dialog would break the "in-canvas" invariant.
- **Alignment pass tokens**: reuse the existing spacing scale (`px-4`, `py-3`, `gap-3`, etc.) and the `--radius-md` / `--glass-border` tokens Phase 71 established. No new design tokens introduced by this phase.
- **Test strategy for the alignment pass**: visual/behavioral, not pixel-diff. Snapshot the DOM structure (tags + classes) so refactor-caused churn is caught but pixel drift isn't chased.
- **Test strategy for section-card/item-row deletion**: hard grep guard as an acceptance criterion — `grep -r "section-card\|item-row" components/ app/ lib/ | grep -v "\.deleted\|\.bak"` returns zero.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 161 resolver** (`lib/estimate/presentation-settings.ts`): the ONE source of truth for visibility + override math. Every gear-panel control reads via `resolvePresentationSettings()` (never ad-hoc field checks — PRESENT-04) and writes via `UPDATE_PRESENTATION_SETTINGS`.
- **Editor reducer** (`components/workspace/estimate/use-estimate-reducer.ts`, Phase 161-02): `presentation_settings` state field + `UPDATE_PRESENTATION_SETTINGS` action already wired. Phase 162 just consumes it.
- **Floating pill** (`components/workspace/estimate/estimate-floating-actions.tsx`, recently simplified to `Pill { linkClientSlot, onOpenPhotos, onSend }`): the gear icon slots in as a new leftmost affordance in the same `<Pill>`.
- **Existing shadcn primitives**: `Popover`, `Sheet`, `Dialog`, `Command` (for the client picker's search) all already in the codebase.

### Established Patterns
- **Reducer actions**: pure state merge + `isDirty: true`, then optional `recalculate()` for math-affecting actions. GUARD-03: presentation actions NEVER recalculate.
- **In-canvas edit affordance**: pencil-icon-on-hover pattern already exists for the estimate title in `estimate-document.tsx` — Bill To should mirror it.
- **Client resolution**: `getClientById` / `getCompanyClients` queries already exist in `lib/queries/client.ts`. The picker just needs a `Command`-based search UI over `getCompanyClients()`.

### Integration Points
- **`estimate-floating-actions.tsx`**: add a `onOpenSettings` prop next to `onOpenPhotos` — the gear button is a peer of Photos in the pill.
- **`estimate-editor.tsx`**: owns the settings panel state (open/closed); passes `onOpenSettings` down; renders `<PresentationSettingsPanel>` next to the existing `<PhotosDialog>`.
- **`overview-tab.tsx`** and any surface currently importing `LinkClientInline`/`LinkClientButton`/`LinkClientCard`: swap to the new `<ClientPicker>` (single component, prop-driven variants).

</code_context>

<specifics>
## Specific Ideas

- The ROADMAP's exact language on the pill: "gear icon on the left side of the floating `Photos / Send` pill" — order is `[Gear] Photos … Send`. Not `[Photos] [Gear] Send`.
- Bill To pencil affordance appears only in edit mode — read-only/share views never show the pencil (matches how the project-title pencil already behaves).
- Consolidated client-picker replaces FOUR call sites, not three. The 4th is inline inside `estimate-document.tsx` — must be extracted too, then that inline usage swapped to the shared component.

</specifics>

<deferred>
## Deferred Ideas

- Rendering `SectionVisibility` / `TaxOverride` / `DiscountOverride` / `DepositOverride` INSIDE the PDF, share page, and plain-text renderers — Phase 163 (SENDHUB-01..06 milestone slot). Phase 162 only wires the panel that WRITES the settings; the render-side wiring is Phase 163.
- Any change to `lib/estimate/compute-totals.ts` or `lib/estimate/presentation-settings.ts` — frozen by Phase 161.
- Format-first Send Hub tabs (Online / PDF / Plain-Text) — Phase 163.
- Anything the ROADMAP DOCUX-01..07 requirements don't cover (e.g., attachment reordering, item-level notes, etc.) — out of scope; capture as new seeds if surfaced.

</deferred>
