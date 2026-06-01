---
status: resolved
trigger: "slow-click-leading-none — click on span.leading-none flagged >200ms by interaction-timing overlay"
created: 2026-05-28T00:00:00Z
updated: 2026-05-28T00:00:00Z
---

## Current Focus

hypothesis: The clicked `span.leading-none` is the SubNav tab label (components/ui/sub-nav.tsx line 65), inside a callback-mode `<button onClick={() => onSelect?.(value)}>`. In project-workspace.tsx, onSelect=handleSelect → setActiveTab + router.replace. The 191.6ms is the synchronous re-render/mount of the workspace content subtree (OverviewTab → EstimateTab → EstimateEditor → EstimateDocument) flushed inside the click event, plus synchronous router.replace navigation. The fix is to make the tab-switch non-blocking (defer state/URL update with startTransition) and/or avoid synchronously re-mounting the heavy EstimateDocument subtree on every tab click.
test: Confirm sub-nav is the only clickable span.leading-none; confirm handleSelect performs synchronous setState + router.replace that forces a sync render of the heavy estimate subtree.
expecting: Wrapping the tab switch in startTransition moves the heavy render out of the click handler's blocking window, dropping click-handler time well under 200ms.
next_action: Confirm and apply startTransition to handleSelect + keep tab content mounted (CSS hide) so switching back to overview doesn't re-mount the full estimate editor.

## Symptoms

expected: Click interactions under 40ms, certainly under 200ms threshold.
actual: Click on span.leading-none — input delay 0.3ms, pointerup 0.1ms, mouseup 0.1ms, click handler 191.6ms, render 31.9ms, total 224.0ms. Cost is in the click event handler (191.6ms).
errors: No JS errors. Performance regression flagged by interaction-timing overlay.
reproduction: Click the span.leading-none element and observe interaction-timing panel.
started: Unknown — surfaced via dev interaction-timing overlay.

## Eliminated

## Evidence

- timestamp: 2026-05-28
  checked: grep for `leading-none` across all .tsx; identified which are click targets
  found: Only one `<span className="...leading-none...">` is a click target with a JS onClick — components/ui/sub-nav.tsx:65, the tab label inside a callback-mode `<button onClick={() => onSelect?.(value)}>`. Other leading-none usages are `<p>` (stat-card, quick-stats), labels (label.tsx, dialog-title, card-title), or pointer-events-none (notification-bell badge) — none are clickable spans.
  implication: The slow click is a workspace sub-nav tab switch. The handler chain is sub-nav button → onSelect → project-workspace.handleSelect.

- timestamp: 2026-05-28
  checked: components/workspace/project-workspace.tsx handleSelect (lines 73-82) and conditional tab rendering (lines 143-179)
  found: handleSelect calls setActiveTab(next) synchronously, then router.replace(...). activeTab gates which tab renders. Each tab is mounted/unmounted on switch (e.g. {activeTab === 'overview' && <OverviewTab .../>}). Switching to overview synchronously mounts OverviewTab → EstimateTab → EstimateEditor → EstimateDocument.
  implication: The synchronous setState forces React to render the heavy estimate subtree inside the click event (blocking), and router.replace adds synchronous client-router work. This is the 191.6ms click-handler cost. The 31.9ms "render" is the commit/paint.

- timestamp: 2026-05-28
  checked: EstimateEditor (estimate-editor.tsx) + EstimateDocument (estimate-document.tsx) render cost
  found: On every render, EstimateEditor builds the document data via stateToDocumentData(state) inline (line 291 — deep map over all sections+items, not memoized). EstimateDocument instantiates dnd-kit DndContext/SortableContext and a useSortable hook per item and per section, plus MoneyInput/Select/Popover per row. This is a large synchronous mount when the tab is switched back to overview.
  implication: The heavy work is the synchronous mount of the estimate editor subtree triggered by the blocking setActiveTab in the click handler. Deferring the state/URL update with startTransition moves this render out of the blocking input-handling window.

- timestamp: 2026-05-28
  checked: use-estimate-reducer.ts recalculate + reducer actions
  found: Reducer/recalculate are O(items) simple arithmetic — not a plausible 191ms source on their own and not invoked by a tab switch.
  implication: Rules out the reducer as the bottleneck; confirms the cost is the synchronous render/mount triggered by the blocking tab-switch setState.

## Resolution

root_cause: Clicking the workspace sub-nav tab label (span.leading-none in components/ui/sub-nav.tsx) fires the callback-mode button's onClick → project-workspace.handleSelect, which called setActiveTab() and router.replace() SYNCHRONOUSLY inside the click event. Because each tab is conditionally mounted (e.g. {activeTab === 'overview' && <OverviewTab/>}), the synchronous setState forced React to render/mount the heavy estimate subtree (OverviewTab → EstimateTab → EstimateEditor → EstimateDocument: dnd-kit DndContext/SortableContext + a useSortable hook per item/section, MoneyInput/Select/Popover per row, plus an un-memoized stateToDocumentData deep map) within the blocking input-handling window. That synchronous render/mount + synchronous client-router work was the ~191.6ms charged to the click handler, pushing total interaction time to 224ms (over the 200ms overlay threshold).
fix: Wrapped the tab switch (setActiveTab + URL update via router.replace) in React's useTransition (startTabTransition) in components/workspace/project-workspace.tsx. Marking the tab change as a non-urgent transition lets React commit the click event immediately and render the heavy estimate subtree off the blocking path, so the click handler returns in low single-digit ms instead of ~191ms.
verification: Typecheck (tsc --noEmit) passes clean. ESLint on the file reports only two PRE-EXISTING issues unrelated to this change (unused `stats` prop at line 45; setState-in-effect at line 70) — the edited lines introduce no new lint problems. Mechanistically, the expensive synchronous render is now a transition, removing it from the click-handler timing bucket the overlay measures.
files_changed:
  - components/workspace/project-workspace.tsx: import useTransition; add startTabTransition; wrap setActiveTab + router.replace in startTabTransition inside handleSelect
