---
id: SEED-041
status: dormant
planted: 2026-07-08
planted_during: v4.17 shipped / no active milestone
trigger_when: When polishing the estimate editor, estimate template system, or per-estimate document customization.
scope: Medium
---

# SEED-041: Per-Estimate Settings Control Panel

Add a settings control to the floating estimate action pill: a gear button on the left side of the existing `Photos / Send` controls. Clicking it opens estimate-specific configuration options for the current estimate's calculation and document presentation.

The goal is to let a business owner shape a specific estimate without digging through global company settings or manually deleting document text. The panel should feel like "settings for this estimate", not a separate Settings page.

## Why This Matters

The estimate document already has several editable parts: tax, discount, deposit, summary, line sections, payment terms, timeline, warranty, notes, photos, and company/default overrides. Right now those controls are scattered inside the document or hidden behind inline editing. That makes simple decisions feel harder than they are:

- "Do I want to charge tax on this one?"
- "Should this estimate show a summary?"
- "Do I want payment terms/timeline/warranty/notes visible?"
- "Should I ask for an initial deposit?"
- "Should the client see section subtotals or just the final total?"

A small gear on the floating pill gives owners one obvious place to configure the document before sending it. It also makes the current `Send` button safer: before sending, the owner can quickly confirm what the client will see.

## Proposed UX

The current floating pill near the bottom of the estimate contains `Photos` and `Send`. Add a left-side icon-only gear button:

```text
[ gear ] [ Photos ] [ Send ]
```

Clicking the gear should open a compact popover or bottom sheet, depending on viewport:

- Desktop: anchored popover above the pill.
- Mobile: bottom sheet / drawer so controls do not overflow.

The panel should use dense operational UI, not a marketing-style modal. Suggested sections:

1. **Pricing**
   - Tax: `Default`, `Custom`, `Off`
   - Discount: `None`, `Percent`, `Fixed amount` (can deep-link/focus existing discount control)
   - Deposit: `None`, `Percent`, `Fixed amount`
   - Balance due display: auto-enabled when deposit is active

2. **Document Sections**
   - Summary
   - Line item sections / scope details
   - Payment terms
   - Timeline
   - Warranty
   - Notes
   - Attached photos

3. **Client Presentation**
   - Show section subtotals
   - Show quantities and unit prices
   - Show estimate number/date
   - Show payment link / accepted payment callout when enabled
   - Require signature / acceptance when company delivery features allow it

4. **Defaults**
   - Apply company defaults
   - Save this layout as a reusable template preset (future)
   - Reset this estimate's presentation settings

## Product Rules

- Separate **calculation settings** from **display settings**.
  - Turning Tax off changes calculation for this estimate (`tax_rate = 0` or equivalent persisted override).
  - Hiding Summary/Timeline/Warranty/Notes should only affect document presentation unless the user deletes content.

- Preserve historical estimates.
  - Settings must be persisted per estimate and used consistently by editor, share page, PDF, send dialog, and plain-text/WhatsApp outputs.

- Keep server-side math authoritative.
  - Tax, discount, deposit, total, and balance due must still be computed through existing deterministic server logic. The settings panel only changes inputs/preferences.

- Avoid destructive hiding.
  - If a section has generated text and the owner toggles it off, retain the text so it can be toggled back on.

- Keep the button visually subordinate to `Send`.
  - The gear is a utility action, icon-only with tooltip/aria-label, not a third primary CTA.

## Scope Estimate

**Medium**. Likely 2-3 focused phases:

1. **Settings Model + Persistence**
   - Decide whether presentation settings live in new typed columns, `estimates.metadata`, or a dedicated JSONB field such as `presentation_settings`.
   - Add a typed schema with retrocompat defaults.
   - Ensure share/PDF/send paths read the same settings snapshot.

2. **Floating Gear UI**
   - Add the gear to `EstimateFloatingActions`.
   - Build a responsive settings popover/sheet.
   - Wire controls to existing reducer/save flow where possible.
   - Keep the `Photos / Send` pill stable and mobile-safe.

3. **Renderer Application + Tests**
   - Apply visibility settings in `EstimateDocument`, PDF, modern share renderer, and send/plain-text output.
   - Add unit tests for default retrocompat, toggle persistence, and hidden-section rendering.

## Breadcrumbs

- [`components/workspace/estimate/estimate-floating-actions.tsx`](components/workspace/estimate/estimate-floating-actions.tsx) — current floating pill; add the left gear button here.
- [`components/workspace/estimate/estimate-editor.tsx`](components/workspace/estimate/estimate-editor.tsx) — renders `EstimateFloatingActions` and owns save/send flow.
- [`components/workspace/estimate/estimate-tab.tsx`](components/workspace/estimate/estimate-tab.tsx) — opens `SendDialog` after `onSend`.
- [`components/workspace/estimate/estimate-document.tsx`](components/workspace/estimate/estimate-document.tsx) — renders Summary, sections, totals, payment terms, timeline, warranty, notes, and photos.
- [`components/workspace/estimate/estimate-totals.tsx`](components/workspace/estimate/estimate-totals.tsx) — current discount/tax UI; deposit currently appears in document totals/edit surface.
- [`lib/actions/estimate.ts`](lib/actions/estimate.ts) — save path and deterministic total recomputation.
- [`lib/estimate/compute-totals.ts`](lib/estimate/compute-totals.ts) — server-side tax/discount/deposit math authority.
- [`lib/estimate/profile-field-map.ts`](lib/estimate/profile-field-map.ts) — existing map of company defaults vs per-estimate fields; useful for deciding defaults/inheritance.
- [`components/share/estimate-document-modern.tsx`](components/share/estimate-document-modern.tsx) and [`components/pdf/estimate-pdf-modern.tsx`](components/pdf/estimate-pdf-modern.tsx) — presentation settings must affect share/PDF variants too.
- Related: [`SEED-032-advanced-pricing-model-tax-discount-deposit.md`](SEED-032-advanced-pricing-model-tax-discount-deposit.md) — pricing model foundation already exists in large part; this seed is about per-estimate configuration UX and presentation control.

## Decisions to Lock Before Planning

1. Should hidden sections be stored as a single `presentation_settings` JSONB field, explicit nullable columns, or estimate metadata?
2. Is the settings panel per estimate only, or can the user save a preset as a reusable estimate template?
3. Does "Tax Off" mean `tax_rate = 0` on this estimate, or a separate tax-enabled boolean that preserves the default rate for later re-enable?
4. Should "show quantities/unit prices" be allowed to hide pricing detail while still showing totals, or is that too risky for estimate transparency?
5. Which channels must honor hidden sections on day one: editor only, share/PDF, email/plain text, WhatsApp/SMS?

## Notes

This should not become a global Settings page. The mental model is: "I am about to send this estimate; let me quickly choose how this estimate behaves and what it shows."

The UI should be compact and professional, with toggles, segmented controls, and selects. Avoid explanatory text inside the app; use labels/tooltips where needed.
