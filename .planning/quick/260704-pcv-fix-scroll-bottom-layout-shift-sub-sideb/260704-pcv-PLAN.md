---
phase: quick-260704-pcv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/(app)/layout.tsx
  - components/workspace/project-workspace.tsx
autonomous: false
requirements: [BUGFIX-01]

must_haves:
  truths:
    - "Scrolling a project workspace page all the way to the bottom produces zero visible shift/jump in the sub-sidebar rail or the floating estimate action bar, on both desktop and mobile viewport widths"
    - "The mobile BottomNav never overlaps page content or the floating action bar at any scroll position"
    - "The sticky sub-sidebar rail still never scrolls out of view mid-scroll and still stops before the mobile BottomNav"
  artifacts:
    - path: "app/(app)/layout.tsx"
      provides: "main scroll container without ancestor bottom padding that decouples from the sticky containing block"
    - path: "components/workspace/project-workspace.tsx"
      provides: "flex-row containing block that itself includes the BottomNav/safe-area clearance space, so sticky descendants' containing block truly ends where scrollable content ends"
  key_links:
    - from: "components/workspace/project-workspace.tsx (content column, bottom of flex-1 div)"
      to: "app/(app)/layout.tsx (main, BottomNav clearance requirement)"
      via: "bottom spacer div carrying the safe-area/BottomNav height, moved inside the flex-row containing block"
      pattern: "pb-\\[calc\\(5rem"
---

<objective>
Eliminate the end-of-scroll layout shift where the sub-sidebar rail (Overview/Client/Photos) and the sticky floating estimate action bar visibly jump upward when a user scrolls a project workspace page all the way to the bottom.

Purpose: The shift is jarring and reads as a bug on every project page. It must be eliminated entirely (not reduced) per explicit user requirement, with a structural fix — not just a padding-size tweak.
Output: `main`'s scroll-container padding-bottom (used today to keep content clear of the fixed mobile `BottomNav`) is relocated from `main` (an ancestor of the sticky rail's containing block) to a spacer living inside `project-workspace.tsx`'s flex-row container, so the containing block used by both `sticky` elements (rail + floating action bar) genuinely spans the full scrollable height including that clearance — removing the "extra scroll past content end" that causes both stickies to visibly let go.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@app/(app)/layout.tsx
@components/workspace/project-workspace.tsx
@components/workspace/estimate/estimate-floating-actions.tsx
@components/app-shell/bottom-nav.tsx
</context>

<interfaces>
<!-- Exact current structure the executor is modifying. No further exploration needed. -->

From app/(app)/layout.tsx (line 124), the scroll container:
```tsx
<main className="flex-1 overflow-y-auto pb-[calc(5rem_+_env(safe-area-inset-bottom,_0px))] md:pb-6">
  {children}
</main>
```
- Mobile: `pb-[calc(5rem + env(safe-area-inset-bottom, 0px))]` (~80px + safe area) clears the fixed `BottomNav`.
- Desktop (`md:`): `pb-6` (24px) — BottomNav is `md:hidden` so desktop only needs a small breathing-room gap, not BottomNav clearance.

From components/workspace/project-workspace.tsx (lines 114-207), the two-column workspace root rendered as `{children}` inside `main`:
```tsx
<div className="relative flex min-h-full flex-row gap-0 items-start">
  <div className={cn(
    'sticky top-0 z-20 self-start shrink-0',
    'h-[calc(100dvh-60px-5rem-env(safe-area-inset-bottom,_0px))]',
    'md:z-30 md:h-[calc(100vh-4rem)]',
    ...
  )}>
    <aside className="... h-full flex flex-col ...">...</aside>
  </div>

  <div className="min-w-0 flex-1">
    <ProjectHeader project={project} />
    <div className="px-5 py-6 md:px-6">
      {/* tab content, includes EstimateFloatingActions rendered deep inside OverviewTab -> EstimateEditor */}
    </div>
  </div>
</div>
```
- The rail's `sticky top-0` + explicit height already independently accounts for BottomNav clearance in its own height calc (`-5rem-env(safe-area-inset-bottom,...)` on mobile, but notably NOT on desktop's `md:h-[calc(100vh-4rem)]`, which has no such subtraction — consistent with desktop BottomNav being hidden).
- The floating action bar (`components/workspace/estimate/estimate-floating-actions.tsx`) renders `sticky bottom-3`/`sticky bottom-6` elements nested arbitrarily deep inside the content column's tab content — its containing block is whichever ancestor establishes one (the flex-row div's content column, ultimately bounded by `main`'s scrollable content box including `main`'s own padding-bottom today).

From components/workspace/estimate/estimate-floating-actions.tsx (lines 43-71):
```tsx
function DesktopPill({ children }) {
  return (
    <div className="sticky bottom-6 z-40 hidden md:flex justify-center pointer-events-none" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      ...
    </div>
  )
}
function MobileBar({ children }) {
  return (
    <div className="sticky bottom-3 z-40 md:hidden flex px-4 pointer-events-none" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      ...
    </div>
  )
}
```

From components/app-shell/bottom-nav.tsx (line 57):
```tsx
<nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center border-t border-border bg-background md:hidden pb-[env(safe-area-inset-bottom,_0px)]">
```
BottomNav is `fixed`, `md:hidden` — desktop never needs to clear it; only mobile does.
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Move BottomNav/safe-area clearance padding from main into the workspace's flex-row containing block</name>
  <files>app/(app)/layout.tsx, components/workspace/project-workspace.tsx</files>
  <action>
    Root cause: `main`'s `pb-[calc(5rem_+_env(safe-area-inset-bottom,_0px))] md:pb-6` padding lives on an ANCESTOR of the flex-row div that both sticky elements (sub-sidebar rail, floating estimate action bar) use as their containing block. That padding adds scrollable height to `main` that is OUTSIDE the flex-row's own box (`min-h-full` only matches `main`'s content-box height, it does not absorb `main`'s padding into the flex-row's own height). The result: after real content + the flex-row's natural height is fully scrolled past, there is still `main`'s trailing padding left to scroll through. During that final stretch, both sticky elements — which are pinned relative to the flex-row containing block, not `main` — hit the end of their own containing block and detach/shift, even though the page can still scroll a bit further into `main`'s padding. This produces the visible late-scroll jump on both desktop (24px) and mobile (~80px+safe-area).

    Fix (structural, not a padding-size reduction):
    1. In `app/(app)/layout.tsx`, remove the padding-bottom classes from `<main>` entirely: change
       `className="flex-1 overflow-y-auto pb-[calc(5rem_+_env(safe-area-inset-bottom,_0px))] md:pb-6"`
       to
       `className="flex-1 overflow-y-auto"`.
       This makes `main` a plain scroll viewport with no ancestor padding to desync from its children's sticky containing blocks. Any other route rendered through this layout that relied on this padding for BottomNav clearance must be reviewed — search for other direct children of `main` across the `(app)` route group that might now sit flush against BottomNav on mobile (grep for `app/(app)/**/page.tsx` client-facing bottom content). If any other page's content also needs BottomNav clearance, it must carry its own bottom spacer the same way project-workspace does (this plan only fixes project-workspace directly per bug report scope; note this as a follow-up if other pages are found affected).
    2. In `components/workspace/project-workspace.tsx`, add the clearance space back INSIDE the flex-row containing block so it participates in the sticky elements' own box, rather than living in an ancestor. Add a shrink-0, non-sticky spacer `div` as the LAST child of the flex-row container (`<div className="relative flex min-h-full flex-row gap-0 items-start">`), i.e. a sibling after both the rail div and the content column div:
       ```tsx
       <div className="relative flex min-h-full flex-row gap-0 items-start">
         {/* rail div (unchanged) */}
         {/* content column div (unchanged) */}
         {/* NEW: bottom clearance spacer — lives INSIDE the flex-row's own box so both
             the sticky rail (top-0) and the sticky floating action bar's containing
             block genuinely include this space. Eliminates the ancestor-padding /
             containing-block mismatch that caused the end-of-scroll shift. */}
         <div
           aria-hidden
           className="w-full shrink-0 basis-full h-[calc(5rem_+_env(safe-area-inset-bottom,_0px))] md:h-6"
         />
       </div>
       ```
       Note: a flex row child needs `basis-full`/`w-full` to force it onto its own line at full width since the parent is `flex-row` — verify visually it doesn't try to sit beside the rail/content column. If `flex-wrap` isn't set on the parent, prefer instead moving the spacer to be the LAST child inside the content column's `flex-1` div (after the tab content, still inside `<div className="min-w-0 flex-1">`), which is simpler and avoids flex-row wrapping concerns entirely, and still adds height to the same containing block ancestor chain the floating action bar uses. Prefer this content-column placement:
       ```tsx
       <div className="min-w-0 flex-1">
         <ProjectHeader project={project} />
         <div className="px-5 py-6 md:px-6">
           {/* existing tab content unchanged */}
         </div>
         <div aria-hidden className="h-[calc(5rem_+_env(safe-area-inset-bottom,_0px))] md:h-6" />
       </div>
       ```
       Use whichever placement keeps the flex layout intact (verify with browser devtools that the row still lays out as rail + content, not row + wrapped spacer row). The content-column placement is preferred as the primary approach since it requires no flex-wrap changes.
    3. Verify the rail's own height calc still ends in the same place as before (it already independently subtracts `5rem + safe-area` on mobile and does not need to subtract anything extra on desktop, since desktop's BottomNav is hidden and the new spacer is only `h-6` on desktop, matching the old `md:pb-6`). No change needed to the rail's height classes.
    4. Verify the floating action bar's `sticky bottom-6`/`sticky bottom-3` still resolves relative to the content column, and now has real in-flow content (the spacer) below it inside the same containing block, so it stops moving exactly when scrollable content — including the clearance region — truly ends. No change needed to `estimate-floating-actions.tsx` itself.
  </action>
  <verify>
    <automated>MISSING — no automated visual-regression harness exists for this layout; manual browser verification required (see checkpoint task below). As a proxy automated check, run: grep -n "pb-\[calc(5rem" "app/(app)/layout.tsx" — expect NO match (padding removed from main), and grep -n "h-\[calc(5rem_+_env(safe-area-inset-bottom" "components/workspace/project-workspace.tsx" — expect a match (spacer added).</automated>
  </verify>
  <done>
    `main` in app/(app)/layout.tsx has no bottom padding classes. project-workspace.tsx's content column ends with a non-sticky spacer div carrying the same clearance height (`5rem + safe-area` mobile / `1.5rem` desktop) that main used to provide, now living inside the same containing-block ancestor chain that both the sticky rail and the sticky floating action bar use.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Relocated the BottomNav/safe-area clearance padding from the `main` scroll container (an ancestor of the sticky sub-sidebar rail and sticky floating estimate action bar's containing block) into a spacer div living inside `project-workspace.tsx`'s content column — inside the same containing block the sticky elements use. This should eliminate the end-of-scroll visual shift/jump in both the rail and the floating action bar, since there is no longer any "extra scroll" past the point where the containing block's content truly ends.
  </what-built>
  <how-to-verify>
    1. Start the dev server (`npm run dev` or equivalent) and open a project workspace page with enough content to actually scroll — ideally the Overview tab with an existing estimate that has several sections/line items, so the page is meaningfully taller than the viewport.
    2. **Desktop viewport** (e.g. 1440x900 or resize browser to >= 768px width):
       - Scroll the page slowly all the way to the very bottom using mouse wheel or trackpad.
       - Confirm the sub-sidebar rail (Overview/Client/Photos icons on the left) does NOT shift, jump, or slide upward at any point during the scroll, including the very last pixels of scroll travel.
       - Confirm the floating "Send/Discard/..." pill action bar at the bottom does NOT visibly jump or shift position relative to the viewport as you reach true scroll-bottom.
       - Confirm there's a small, consistent ~24px breathing gap below the last content sitting above the pill — not zero, not excessive.
    3. **Mobile viewport** (Chrome DevTools device toolbar, e.g. iPhone 14 Pro or similar, or an actual mobile device/simulator):
       - Scroll the same page all the way to the bottom.
       - Confirm the sub-sidebar rail and the floating mobile action bar do NOT shift/jump at end of scroll.
       - Confirm the fixed `BottomNav` (bottom tab bar) NEVER overlaps the floating action bar or any page content at any scroll position, including scroll-bottom — there should be clear visual separation respecting the safe-area inset.
    4. Repeat the scroll-to-bottom check on the Client and Photos tabs (no floating action bar there, but confirm the sub-sidebar rail still behaves identically — no shift at end of scroll on either tab).
    5. If using a device with an iOS safe-area (notch/home-indicator device or simulator), confirm the extra safe-area inset space still renders correctly at the very bottom (no BottomNav overlap into the home-indicator gesture area).
  </how-to-verify>
  <resume-signal>Type "approved" if no shift/jump occurs on any tab at any viewport width and BottomNav never overlaps content, or describe exactly what still shifts/overlaps and at what viewport/tab.</resume-signal>
</task>

</tasks>

<verification>
- `app/(app)/layout.tsx`: `main` has no `pb-*` classes remaining (grep confirms).
- `components/workspace/project-workspace.tsx`: spacer div present inside the content column carrying the relocated clearance height.
- Manual checkpoint confirms zero visible shift/jump at true scroll-bottom on both desktop and mobile widths, across Overview/Client/Photos tabs, with BottomNav never overlapping content.
</verification>

<success_criteria>
- The end-of-scroll shift in the sub-sidebar rail and floating estimate action bar is completely eliminated (not merely reduced) on all viewport widths.
- Mobile `BottomNav` clearance is fully preserved — no regression where content or the floating action bar becomes obscured by the fixed bottom nav.
- No other project workspace behavior (sticky rail stopping point, tab switching, floating action bar visibility rules) regresses.
</success_criteria>

<output>
After completion, create `.planning/quick/260704-pcv-fix-scroll-bottom-layout-shift-sub-sideb/260704-pcv-01-SUMMARY.md`
</output>
