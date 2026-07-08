---
id: SEED-043
status: dormant
planted: 2026-07-08
planted_during: v4.17 shipped / no active milestone
trigger_when: When polishing the estimate editor mobile experience, line item editing, or estimate document visual parity.
scope: Medium
---

# SEED-043: Mobile Estimate Line Item Editor Parity

Rework the mobile line item editing region inside the estimate document so it feels like the same product and same document as desktop.

Desktop is close to the intended direction: compact, document-native, table-like, restrained, and professional. The current mobile line item editor feels like a separate mobile design inserted into the document. It uses large shadcn input fields, standalone glass/card styling, rounded corners, extra whitespace, and a visible bottom shadow that does not match the desktop estimate surface.

The goal is not to make mobile identical to the desktop table. The goal is visual and behavioral parity: same density, same document language, same hierarchy, adapted to a narrow viewport.

## Why This Matters

The estimate editor is the core workspace. On mobile, owners may be reviewing and adjusting line items right after a job-site capture. If this region feels oversized or visually disconnected, the estimate stops feeling like a polished document and starts feeling like a generic form.

Current problems from the mobile screenshot:

- Line item fields are visually too tall and too form-like.
- The item uses a separate card/glass surface with rounded corners and shadow.
- The bottom of the item has an awkward shadow/blank area.
- The layout feels heavier than the desktop table and consumes too much vertical space.
- The mobile layout does not visually inherit the desktop line-item language.
- The section header is strong and document-like, but the item body below it feels like another component family.

The mobile editor should feel like "editing a line inside the estimate", not "filling out a detached mobile form".

## Current State

The active estimate document path renders mobile edit items through `ItemCardMobile`:

- `EstimateDocument` imports `ItemCardMobile`.
- `DocumentSectionBlock` has a mobile branch: `sm:hidden`.
- In edit mode, each item is rendered as `ItemCardMobile`.
- Desktop edit mode renders `SortableDocumentItemRow`, a compact table row with transparent inline controls.
- `ItemCardMobile` renders a standalone `<Card variant="glass">` with normal `Input`, `MoneyInput`, `Select`, `Switch`, badges, and a bottom total/delete row.

There is also a separate `SectionCard` path that imports `ItemCardMobile`, but the primary document editor appears to render through `estimate-document.tsx`.

## Desired Direction

Replace the current standalone-card mobile item treatment with a document-native compact mobile editor.

Principles:

1. **No nested card feeling**
   - Avoid `Card variant="glass"` for line items inside the paper document.
   - Avoid standalone shadows, inflated rounded corners, and floating card chrome.
   - Use the document's own white paper, borders, dividers, and subtle alternating row background.

2. **Compact controls**
   - Use visually compact controls closer to desktop inline inputs.
   - Prefer transparent or low-chrome inputs where the surrounding document already provides structure.
   - Keep touch interaction safe, but do not make every field look like a large standalone form field.

3. **Same information hierarchy as desktop**
   - Description remains the primary field.
   - Qty, Unit, Unit Price, Discount, Taxable, and Total remain secondary/tertiary.
   - Total should be easy to scan but not isolated in a big empty footer.

4. **Mobile-specific layout, desktop-native styling**
   - A stacked/grid layout is fine on mobile.
   - The styling should borrow from `SortableDocumentItemRow`, not from generic cards.
   - The result should look like a responsive version of the desktop estimate table.

5. **No bottom shadow artifact**
   - Remove the large shadow/blur under each item.
   - Ensure the item height collapses naturally to content.
   - Delete/remove actions should not create dead space.

## Possible UI Shape

A better mobile item could be:

```text
Description inline field

Qty        Unit        Unit Price
[1]        [visit]     [$125.00]

Discount       Tax       Total
[$0.00]        [toggle]  $125.00   [trash]
```

But visually:

- no outer card shadow
- no large rounded rectangle around the whole item
- compact row dividers
- 32-36px visual control height where possible
- `min-height` touch targets only where needed for icon/toggle interactions
- labels small and consistent with desktop table headers
- total aligned to the right in the same rhythm as desktop

Another possible direction is a "mobile table card" that uses one item per bordered row:

```text
Description                                      $125.00
Qty 1     Unit visit     Unit Price $125.00
Discount $0.00           Taxable on        trash
```

This may be even denser and more document-like.

## Scope Estimate

**Medium.** This is likely a focused UI phase, but it should include visual verification across small mobile widths and desktop regression checks.

Likely tasks:

1. **Audit the active render path**
   - Confirm whether `SectionCard` is legacy/dead or still used.
   - Confirm all active line item editing paths use the same mobile component.

2. **Create a document-native mobile item editor**
   - Either refactor `ItemCardMobile` or introduce a new `DocumentItemMobileEditor`.
   - Share compact field styles with `SortableDocumentItemRow` where practical.
   - Remove `Card variant="glass"` from the active document line item mobile path.

3. **Tune estimate document mobile shell**
   - Review document wrapper radius/border on narrow viewports.
   - Ensure section dividers and header bars match desktop proportions.
   - Avoid nested rounded blocks inside the document unless they are repeated media/photo cards.

4. **Visual verification**
   - Capture mobile screenshots at 360px, 390px, and 430px widths.
   - Capture desktop screenshot to ensure the nearly-perfect desktop table remains unchanged.
   - Verify no text clipping in description, unit select, unit price, discount, and total.
   - Verify controls remain usable on iOS Safari/Android Chrome touch sizes.

## Breadcrumbs

- [`components/workspace/estimate/estimate-document.tsx`](components/workspace/estimate/estimate-document.tsx) - active document renderer; mobile branch is `sm:hidden` inside `DocumentSectionBlock`; desktop branch uses `SortableDocumentItemRow`.
- [`components/workspace/estimate/item-card-mobile.tsx`](components/workspace/estimate/item-card-mobile.tsx) - current mobile item card; uses `Card variant="glass"`, default inputs/selects, badges, and bottom total/delete row.
- [`components/workspace/estimate/item-row.tsx`](components/workspace/estimate/item-row.tsx) - older table row component; useful reference for shared item editing behavior but less current than `SortableDocumentItemRow`.
- [`components/workspace/estimate/section-card.tsx`](components/workspace/estimate/section-card.tsx) - older/alternate section component that also uses `ItemCardMobile`; audit before deleting or refactoring.
- [`components/workspace/estimate/estimate-editor.tsx`](components/workspace/estimate/estimate-editor.tsx) - maps reducer state into document data and feeds discount/taxable fields used by the mobile item editor.
- [`components/workspace/estimate/use-estimate-reducer.ts`](components/workspace/estimate/use-estimate-reducer.ts) - action contract for updating item description, quantity, unit, unit price, discount, taxable, and totals.
- [`components/ui/input.tsx`](components/ui/input.tsx), [`components/ui/money-input.tsx`](components/ui/money-input.tsx), [`components/ui/select.tsx`](components/ui/select.tsx), [`components/ui/switch.tsx`](components/ui/switch.tsx) - primitives whose default heights/chrome may need compact document variants.

## Decisions to Lock Before Planning

1. Should mobile line items remain fully editable inline, or should advanced fields collapse behind an expand affordance?
2. Should `ItemCardMobile` be refactored in place, or should the document editor get a new mobile-only component with a clearer name?
3. Should desktop and mobile share compact field class constants to prevent visual drift?
4. Should the document wrapper use a smaller radius on mobile, or is the issue limited to nested line item cards?
5. Should price-source badges remain visible on mobile, move into a compact metadata row, or hide behind a details menu?
6. What is the minimum acceptable touch target for dense estimate editing without making fields visually oversized?

## Notes

This should be treated as visual debt in the most important product surface. The mobile editor must not feel like a separate design system.

The final check should compare the same estimate section on desktop and mobile side by side. Mobile can stack the fields, but it should clearly read as the same estimate document.
