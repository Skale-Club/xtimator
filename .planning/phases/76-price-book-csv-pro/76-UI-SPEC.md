---
phase: 76
slug: price-book-csv-pro
status: draft
shadcn_initialized: true
preset: new-york (existing, locked)
created: 2026-05-19
inherits: 71-UI-SPEC.md
---

# Phase 76 — UI Design Contract

> 4-step wizard for CSV → Price Book. Mental model: **Stripe Dashboard "Import contacts"** — full-screen-feeling glass dialog, clickable step indicator, every step is a single column of decisions, primary CTA bottom-right always says what happens next.
>
> Inherits Phase 71 tokens. Copy below is the authoritative English source for new `pricebook.import.*` i18n keys (planner adds PT-BR + ES).

---

## Globals

### Container
- `<Dialog>` (glass-strong, inherited), **wider than default**: `sm:max-w-3xl` (768px) on desktop, `max-w-[calc(100%-2rem)]` mobile.
- Height: `max-h-[85vh] flex flex-col` so the preview table scrolls inside, footer stays pinned.
- Padding: `p-6` (existing); inner body uses 24px (`gap-6`) between hero/step indicator/body/footer.
- NOT full-screen sheet — dialog feels lighter and matches existing import baseline.

### Step Indicator (top of dialog, below DialogHeader)
- 4 segments in a horizontal row, equal width, `gap-2`.
- Each segment = 4px-tall bar (`h-1 rounded-full`) + 12px-spacing + step label below.
- States:
  - **Completed** (steps before current): `bg-gradient-brand`, label `text-foreground` weight 500, prefixed with check icon (`Check h-3 w-3`)
  - **Current**: `bg-gradient-brand` with `shadow-glow-brand`, label `text-foreground` weight 600, prefixed with the step number in a 16px circle (`bg-gradient-brand text-white`)
  - **Upcoming**: `bg-muted`, label `text-muted-foreground` weight 400, prefixed with grey number circle
- Label = step name (e.g. "Upload"), Micro 12px.
- **Clickable backtracking only**: completed steps are buttons (`role="button"` + keyboard); upcoming are not interactive (`aria-disabled="true"`). Current is non-interactive.
- Below 640px: bar stays full-width but labels collapse to "Step N of 4" centered above the bar (single label, the active step name only).

### Close Behavior (X button, top-right of Dialog)
- Step 1 with no file picked → close immediately, no confirm.
- Steps 2/3 (mid-progress) or Step 1 with a file already parsed → `<AlertDialog>` confirm:
  - Title: **"Save and close?"**
  - Body: **"We'll keep your progress for 24 hours. Reopen the importer to continue where you left off."**
  - Buttons: `Discard` (ghost destructive) · `Save and close` (primary)
- Step 4 success state → close immediately (import is committed).
- Step 4 importing state → confirm: title **"Stop the import?"**, body **"Rows already imported will stay. You can undo within 5 minutes."**, buttons `Keep importing` (ghost) · `Stop` (destructive).

### Resume Behavior (sessionStorage `xtimator:price-book-import:draft:v1`)
- On dialog open, if draft exists AND `draft.savedAt > now - 24h`:
  - Show `<Alert>` at the top of whichever step is restored:
    - Icon: `History` (lucide), brand-tinted
    - Title: **"Picked up where you left off"**
    - Body: **"Your draft from {relativeTime} is restored. Start over if you'd rather."**
    - Action button (right): **"Start over"** (ghost, small) → clears draft + returns to Step 1.
  - Alert is dismissible (X on right); dismissing only hides the alert, draft stays loaded.
- On successful commit (Step 4), draft is cleared from sessionStorage.

### Footer (every step)
- `<DialogFooter>` already left-aligns Back, right-aligns Next/primary.
- Layout: `[Back ghost] [spacer] [Cancel ghost] [Primary CTA]`
- Back hidden on Step 1; Cancel always visible (= same as X — triggers close behavior).
- Primary CTA uses `variant="primary"` (gradient + shimmer from Phase 71).
- Mobile (<640px): footer stacks (`flex-col-reverse`), primary CTA full-width on top, Back/Cancel below.

### Mobile Considerations (375px)
- Dialog uses `max-w-[calc(100%-2rem)]` — already 343px usable on iPhone SE.
- Step indicator collapses to "Step N of 4 — {name}" centered.
- Step 2 mapping table → stacks each column as a card row (label + Select), no 2-col grid.
- Step 3 preview table → horizontal scroll inside the table container (`overflow-x-auto`), sticky first column (row number).
- Step 4 summary card → all stat rows stack; CTAs full-width.

---

## Step 1 — Upload

### Layout
- Single centered column, `space-y-6`.
- **Drop zone**: 320px-tall on desktop, 240px mobile. `border-2 border-dashed border-[var(--glass-border)] rounded-[var(--radius-lg)] bg-[var(--glass-bg-light)]`. Centered icon + copy + button stack with `gap-4`.
  - Hover/dragover state: `border-[#406EF1] bg-[rgba(64,110,241,0.04)]` + scale 1.005 transform.
- **Below drop zone**: helper row (Micro 12px, muted) listing constraints, with template download link inline.
- **Locale auto-detect chip** appears AFTER file is parsed (before transitioning to Step 2): inline preview `<Alert>` showing detected locale + sample value, with **Looks right / Override** buttons.

### Components
- `<Card variant="glass">` wraps the drop zone (no shadow override).
- `Upload` lucide icon, 32px, brand gradient via `text-transparent bg-clip-text bg-gradient-brand`.
- `<Button variant="outline">` for "Select file" (NOT primary — primary lives in footer).
- Native `<input type="file" hidden>` + ref pattern (preserve existing).
- `<Alert>` (shadcn) for fatal errors and locale chip.

### Copy

| Element | Copy |
|---------|------|
| DialogTitle | **Import items from CSV** |
| DialogDescription | *Upload a spreadsheet exported from QuickBooks, Excel, or Google Sheets. We'll handle the mess.* |
| Drop zone headline | **Drop your CSV here** |
| Drop zone sub | *or click to browse — max 1 MB, max 1000 rows* |
| Drop zone button | `Select file` |
| Template link | *New here? [Download our template](#)* |
| Locale chip title (US) | **US number format detected** (`$1,234.56`) |
| Locale chip title (BR) | **Brazilian format detected** (`R$ 1.234,56`) |
| Locale chip title (plain) | **Plain numbers detected** (`1234.56`) |
| Locale chip primary | `Looks right` |
| Locale chip secondary | `Override` |
| Footer primary CTA | `Next: map columns` |

### Validation messages (inline `<Alert variant="destructive">` under drop zone)

| Code | Copy |
|------|------|
| too_large | **File is over 1 MB.** Try splitting it into smaller batches. |
| too_many_rows | **More than 1000 rows.** Split your file and import in batches. |
| wrong_type | **We need a `.csv` file.** Save your spreadsheet as CSV from Excel or Sheets. |
| parse_error | **Couldn't read that file.** {detail} — try re-saving it from your spreadsheet app. |
| empty_file | **Looks empty.** Make sure your CSV has a header row and at least one item. |

### State inventory

| State | Visual |
|-------|--------|
| idle | Drop zone with default border, helper copy visible |
| dragover | Border + bg brand-tinted, copy unchanged |
| parsing | Drop zone disabled, centered spinner replaces icon + "Reading your file…" copy |
| fatal_error | Drop zone re-enabled, destructive Alert appears below |
| parsed | Locale chip appears below drop zone; footer primary CTA enables |

### Accessibility
- Drop zone is a `<label>` wrapping the hidden input → click + Enter/Space trigger file picker.
- `aria-describedby` links drop zone to the helper paragraph.
- Drag events announce status to a visually-hidden `role="status"` live region: "File dropped. Reading…" / "File read. 47 valid rows."
- Locale chip: `role="status"`, polite live region.
- Errors: `role="alert"`, focus moves to the alert on appearance.

---

## Step 2 — Map columns

### Layout
- Two-column grid on desktop (`grid-cols-[1fr_1fr] gap-x-6 gap-y-4`); single column < 768px.
- Each row = one detected CSV column:
  - **Left**: CSV header name (mono 13px) + 3-value sample preview underneath (Micro 12px, muted, comma-separated, truncated to 40 chars per value).
  - **Right**: `<Select>` showing the auto-detected target field + alternatives + `— Skip this column —`.
- Header above grid: `<Card variant="glass">` containing summary line: "**We auto-matched {n} of {total} columns.** Review and adjust if needed."
- Required-field warning banner (`<Alert variant="warning">`) below header if `name` or `unit_price` is unmapped.

### Components
- `<Card variant="glass">` wraps the whole mapping area.
- `<Select>` (shadcn) per column.
- Required fields get a Micro 12px label "**Required**" next to the select.
- Skipped columns render the select with `text-muted-foreground` and a `EyeOff` icon inline.

### Copy

| Element | Copy |
|---------|------|
| DialogTitle | **Match your columns** |
| DialogDescription | *Tell us which spreadsheet column maps to which field. We've guessed where we can.* |
| Summary line | **{matched} of {total} columns auto-matched.** Adjust below if anything looks off. |
| Sample row prefix | *Sample:* {value1}, {value2}, {value3} |
| Select placeholder | *Choose a field…* |
| Skip option | *— Skip this column —* |
| Required label | **Required** |
| Warning banner | **Name and price are required.** Map them or fix your file before continuing. |
| Footer back | `Back` |
| Footer primary CTA | `Next: preview` |

### Target field labels (Select options)

| Value | Label |
|-------|-------|
| name | **Item name** *(required)* |
| unit_price | **Unit price** *(required)* |
| folder | **Folder / category** |
| unit | **Unit of measure** *(ea, hr, sqft…)* |
| notes | **Notes** |
| _skip | *— Skip this column —* |

### State inventory

| State | Visual |
|-------|--------|
| auto-matched | Select shows guess, normal styling |
| user-overridden | Select shows user choice, small brand-colored dot indicator next to select |
| skipped | Select styled muted with EyeOff icon |
| required-missing | Warning banner active, primary CTA disabled with tooltip "Map name and price to continue" |
| duplicate-target | Inline error below select: "Already mapped to {other CSV column}. Pick a different field or skip one." |

### Accessibility
- Each Select labeled via `<Label htmlFor>`.
- Sample preview is `aria-describedby` of the select.
- Warning banner is `role="alert"`; primary CTA `aria-disabled` when blocked, with the disabled reason in `aria-describedby`.
- Keyboard: Tab moves Select → Select; Shift+Tab reverses; Space opens Select (radix default).

---

## Step 3 — Preview & edit

### Layout
- Vertical stack: summary banner → dedupe strategy bar → table → row error helper.
- Body uses remaining height: `flex flex-col gap-4 min-h-0 flex-1` so table scrolls.

#### Summary banner (top)
- Horizontal flex row in a `<Card variant="glass">` with `p-4`:
  - `{valid} ready` — gradient-success text + Check icon
  - `{withErrors} need fixing` — destructive text + AlertTriangle (clickable → scrolls to first errored row)
  - `{duplicates} duplicates` — warning text + Copy icon (clickable → scrolls to first dupe)
  - Right side: search input (`<Input>` with `Search` icon, placeholder "Filter rows…")

#### Dedupe strategy bar
- Horizontal `<RadioGroup>` with 3 options as cards (`<Card variant="glass">` per option, ring on selected):
  - Skip / Update / Import as new
- Caption below: "**{count} duplicates** matched against your existing Price Book"

#### Preview table
- `<Table>` inside scrollable `<div className="overflow-auto flex-1 rounded-md border border-[var(--glass-border)]">`.
- Columns: `#` (sticky left, 48px) | Folder | Name | Unit | Price | Status (40px) | Actions (40px)
- Each cell with a mapped field is **inline-editable** via click-to-edit pattern:
  - Display mode: plain text, hover shows pencil icon right-aligned.
  - Edit mode: cell becomes `<Input>` (or `<Select>` for folder), Enter commits, Esc cancels.
- Row states:
  - **valid**: normal
  - **invalid**: `bg-destructive/10`, AlertTriangle in status col, tooltip lists error reasons
  - **duplicate (in-file)**: `opacity-60`, "dup" pill in status col
  - **duplicate (existing PB)**: warning-tinted left border (3px `border-l-warning`), per-row override Select in actions col: `Use global (skip) / Skip / Update / Import as new`
  - **edited**: small brand-colored dot before the row number indicating user-modified
- Table is virtualized if >100 rows (use `@tanstack/react-virtual` — planner picks).
- Empty filter state (search returns 0): centered helper "No rows match `{query}`. Clear filter to see all."

### Components
- `<Card variant="glass">` for summary + dedupe strategy.
- `<RadioGroup>` (shadcn) for dedupe strategy with custom card-style rendering.
- `<Table>` primitive.
- `<Input>` for inline editing, `<Select>` per-row dedupe override.
- `<Tooltip>` on AlertTriangle for error reasons.

### Copy

| Element | Copy |
|---------|------|
| DialogTitle | **Review your items** |
| DialogDescription | *Click any cell to fix it. Choose how to handle duplicates below.* |
| Summary: valid | **{n} ready** |
| Summary: errors | **{n} need fixing** |
| Summary: duplicates | **{n} duplicates** |
| Filter placeholder | *Filter rows…* |
| Dedupe section title | **When an item already exists in your Price Book** |
| Dedupe: skip title | **Skip** |
| Dedupe: skip body | *Keep the existing item. Safe default.* |
| Dedupe: update title | **Update** |
| Dedupe: update body | *Overwrite price, unit, and notes on the existing item.* |
| Dedupe: new title | **Import as new** |
| Dedupe: new body | *Add as "{name} (2)" alongside the existing one.* |
| Inline edit placeholder | *Enter value…* |
| Inline edit hint (Micro) | *Enter to save · Esc to cancel* |
| Row error: missing_name | *Name is required* |
| Row error: missing_unit_price | *Price is required* |
| Row error: invalid_unit_price | *Price isn't a number — remove commas or symbols* |
| Row error: negative_unit_price | *Price can't be negative* |
| Row dupe pill | *dup in file* |
| Row dupe (PB) pill | *exists in Price Book* |
| Empty filter | *No rows match "{query}".* [Clear filter] |
| Footer back | `Back` |
| Footer primary CTA | `Next: confirm` |

### State inventory

| State | Visual |
|-------|--------|
| populated | Full table, summary counts, dedupe bar |
| filtering | Table renders subset; summary counts NOT recalculated (stay global) |
| editing-cell | Single cell becomes input, others stay text |
| validating-edit | Cell border tints destructive immediately if invalid; row recalculates valid/invalid count |
| empty-after-filter | Table replaced by centered helper, dedupe bar stays |
| all-invalid | Primary CTA disabled with helper "Fix at least one row to continue" |

### Accessibility
- Click-to-edit cells: `role="button"` + Enter key opens edit mode.
- Inline input: auto-focus + select-all on open; Esc returns focus to the cell button.
- AlertTriangle icons: wrap in `<span aria-label="Errors: {reasons}">`.
- Table row dedupe override Select labeled "Duplicate strategy for {item name}".
- Live region announces summary count changes after each edit ("47 ready, 2 need fixing").
- Sticky `#` column ensures keyboard users navigating long rows always see row context.

---

## Step 4 — Confirm & result

### Layout (two sub-states: pre-commit summary vs post-commit result)

#### Pre-commit (default on enter)
- Single centered column, `max-w-md mx-auto`, `space-y-6`.
- **Hero stat block** (`<Card variant="stat">` with gradient top border):
  - Big Display 32px number: total items to import
  - Micro label above: **TOTAL ITEMS**
  - Delta row below: breakdown chips (insert/update/skip counts)
- **Breakdown list** (`<Card variant="glass">`): 4 rows, each `flex justify-between items-center` with Micro label + Body number:
  - New items
  - Updates to existing items
  - Duplicates skipped
  - Rows with errors (will be skipped)
- **Source line**: Micro 12px muted, "From: `{filename}` · `{locale}` format"
- Footer primary CTA: `Import {n} items` (uses `variant="primary"` gradient + shimmer)

#### Importing (during commit, large files)
- Replaces breakdown card with **progress card** (`<Card variant="glass">`):
  - H3: **Importing your items…**
  - Progress bar (`<Progress>` shadcn) `h-2 rounded-full`, gradient-brand fill
  - Below bar: "**{done} of {total}** items imported" + ETA Micro
  - Cancel button (`<Button variant="outline" size="sm">`) right-aligned
- Footer CTAs hidden; only Cancel inside the card.

#### Result — success (replaces everything)
- `<EmptyState>`-style pattern from Phase 71 catalog:
  - 48px gradient-success circle with `Check` icon
  - H2: **Done! {n} items imported**
  - Body: *We added {newCount} new items{updateClause}{errorClause}. You can undo this within the next 5 minutes.*
- Card with two buttons:
  - `View Price Book` (primary)
  - `Download error report ({n} skipped)` (outline, only if any errors) — triggers CSV blob download
- Auto-redirect to `/price-book` after 6s if untouched (the Price Book page surfaces the Undo toast on arrival).

#### Result — partial failure / server error
- Same layout, gradient-danger circle + `AlertTriangle`.
- H2: **Import didn't finish**
- Body: *We imported {done} items before hitting an error. {message}*
- Buttons: `Try the rest again` (primary, retries from `done + 1`) · `Download error report` · `Close`

### Copy

| Element | Copy |
|---------|------|
| DialogTitle (pre) | **Ready to import** |
| DialogDescription (pre) | *Final check before we add these to your Price Book.* |
| Stat label | **TOTAL ITEMS** |
| Breakdown: new | *New items* |
| Breakdown: update | *Updates to existing items* |
| Breakdown: skip | *Duplicates skipped* |
| Breakdown: errors | *Rows with errors (will be skipped)* |
| Source line | *From: `{filename}` · `{locale}` format* |
| CTA: commit | `Import {n} items` |
| CTA: importing | `Importing… {done}/{total}` (disabled state of CTA) |
| Progress headline | **Importing your items…** |
| Progress sub | **{done} of {total}** items imported · {eta} |
| Cancel button | `Cancel` |
| Cancel confirm title | **Stop the import?** |
| Cancel confirm body | *Rows already imported will stay. You can undo within 5 minutes.* |
| Success H2 | **Done! {n} items imported** |
| Success body | *We added {newCount} new and updated {updateCount}. You can undo this within the next 5 minutes.* |
| Success primary | `View Price Book` |
| Success error report btn | `Download error report ({n} skipped)` |
| Failure H2 | **Import didn't finish** |
| Failure body | *We imported {done} items before hitting an error. {serverMessage}* |
| Failure primary | `Try the rest again` |
| Undo toast (on PB page) | **{n} items imported.** [Undo] *(disappears in 5 min)* |

### State inventory

| State | Visual |
|-------|--------|
| pre-commit | Stat hero + breakdown card + source line; primary CTA enabled |
| importing-small (<200 rows) | CTA shows inline spinner + "Importing…"; no progress card |
| importing-large (>200 rows) | Stat hero stays; breakdown card swapped for progress card; Cancel visible |
| success | Full replacement layout (gradient-success circle + buttons) |
| partial-failure | Full replacement layout (gradient-danger circle + retry/download/close) |
| network-error (pre-commit) | Inline `<Alert variant="destructive">` above CTA: "Couldn't reach the server. Try again." with retry button |

### Accessibility
- Progress bar: `role="progressbar"` with `aria-valuenow/min/max`, label "Import progress".
- Status changes ("X of Y imported") announced via `aria-live="polite"`.
- Success state: focus moves to H2 on render; first interactive button (`View Price Book`) is the second focus stop.
- Cancel confirm uses `<AlertDialog>` — focus trapped, Esc dismisses.
- Auto-redirect: respect `prefers-reduced-motion` and provide visible countdown ("Redirecting in 6s — [Stay here]") for users who need more time.

---

## Component Inventory (planner reference)

| Pattern | Primitive | Phase 71 variant | Where used |
|---------|-----------|------------------|------------|
| Wizard container | `<Dialog>` | glass-strong (inherited) | All steps |
| Step indicator | custom div + gradient bar | uses `bg-gradient-brand` + `shadow-glow-brand` | Top of dialog |
| Drop zone | `<Card>` + native input | `glass` + dashed border | Step 1 |
| Locale chip | `<Alert>` | default | Step 1 |
| Mapping select | `<Select>` | shadcn default | Step 2 |
| Dedupe option | `<RadioGroup>` + `<Card variant="glass">` | glass with ring on selected | Step 3 |
| Preview table | `<Table>` | flat (no glass — performance) | Step 3 |
| Inline edit cell | `<Input>` | shadcn default + gradient focus (inherited) | Step 3 |
| Total stat | `<Card variant="stat">` | stat (3px gradient top) | Step 4 |
| Breakdown card | `<Card variant="glass">` | glass | Step 4 |
| Progress | `<Progress>` | bar uses `bg-gradient-brand` fill | Step 4 importing |
| Result hero | custom (Empty State pattern) | gradient circle from Phase 71 catalog | Step 4 result |
| Confirm-close | `<AlertDialog>` | shadcn default (glass inherited) | Cross-cutting |
| Toasts | sonner | Phase 71 toast variant (glass + colored left bar) | Success / undo |

---

## Performance & Snapshot Notes

- Preview table (Step 3) is **flat, NOT glass** — per Phase 71 performance gate (no blur on list rows). Container border + transparent bg only.
- Virtualize when >100 rows. Inline edit must not trigger full table re-render (cell-local state).
- Step transitions: 200ms fade between steps; respect `prefers-reduced-motion` (instant swap).
- Streaming progress UI updates at most every 100ms (debounce server callbacks) — avoid layout thrash.
- New Playwright snapshot for each step on `/price-book` with the wizard open (5 snapshots: step1, step2, step3, step4-pre, step4-success).

## Accessibility Gates (HARD)

- WCAG AA contrast on every glass surface — test step indicator labels (smallest text in the wizard) most carefully.
- Focus management on step transition: focus moves to the new DialogTitle, NOT the primary CTA (so screen readers announce the context first).
- All errors `role="alert"` with `aria-live="assertive"`.
- All count summaries `aria-live="polite"`.
- Keyboard-only walkthrough must complete a full happy-path import without mouse.
- Inline-edit cells must announce edit mode entry ("editing {field} for row {n}") via live region.

## i18n Gate

- All copy above maps to a new namespace `pricebook.import.*` (planner adds keys in 76-03).
- PT-BR + ES strings written alongside EN; tested on Step 4 success body (longest string).
- Number-format chips (`$1,234.56` etc.) are NOT translated — they're sample displays.

## Copywriting Contract Summary

- **Voice**: Direct, second-person, no jargon. ("Drop your CSV here." not "Please select a file for upload.")
- **Buttons**: verb + noun, sentence case. ("Import 47 items", not "IMPORT" or "Submit".)
- **Errors**: state the problem, then the fix. ("Price isn't a number — remove commas or symbols.")
- **Destructive confirms**: question form + clear stakes. ("Stop the import? Rows already imported will stay.")
- **Time references**: relative + concrete duration. ("within the next 5 minutes", "draft from 2 hours ago")

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | dialog, alert-dialog, card, table, input, select, radio-group, alert, button, progress, tooltip — all already installed (progress + alert-dialog confirm with planner) | not required |
| third-party | none | not applicable |

If `progress` or `alert-dialog` is not yet installed, planner runs `npx shadcn add progress alert-dialog` in plan 76-03 setup task.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS (full English contract above; PT-BR + ES added in plan)
- [ ] Dimension 2 Visuals: PASS (table stays flat per perf gate; glass restricted to container + summary/dedupe/breakdown cards)
- [ ] Dimension 3 Color: PASS (gradient-brand on indicator + CTA only; success/danger/warning reserved for result + dedupe + alert)
- [ ] Dimension 4 Typography: PASS (inherits 71 scale; no new sizes)
- [ ] Dimension 5 Spacing: PASS (4-base scale; `gap-2/4/6` only)
- [ ] Dimension 6 Registry Safety: PASS (no third-party)

**Approval:** pending (checker validates)
