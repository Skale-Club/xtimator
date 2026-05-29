# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## slow-click-leading-none — sub-nav tab click >200ms from synchronous heavy-subtree re-mount
- **Date:** 2026-05-28
- **Error patterns:** click handler 191.6ms, leading-none, span, interaction-timing, sub-nav tab switch, slow click, synchronous render, setActiveTab, router.replace, performance regression
- **Root cause:** Clicking the workspace sub-nav tab label (span.leading-none in components/ui/sub-nav.tsx) fired the callback-mode button's onClick → project-workspace.handleSelect, which called setActiveTab() and router.replace() synchronously inside the click event. Because each tab is conditionally mounted, the synchronous setState forced React to render/mount the heavy estimate subtree (OverviewTab → EstimateTab → EstimateEditor → EstimateDocument: dnd-kit DndContext/SortableContext + a useSortable hook per item/section, MoneyInput/Select/Popover per row, plus an un-memoized stateToDocumentData deep map) within the blocking input-handling window. That ~191.6ms synchronous render/mount + synchronous client-router work pushed total interaction time to 224ms, over the 200ms overlay threshold.
- **Fix:** Wrapped the tab switch (setActiveTab + URL update via router.replace) in React's useTransition (startTabTransition) in components/workspace/project-workspace.tsx, marking the heavy re-mount as a non-urgent transition so it renders off the blocking click path.
- **Files changed:** components/workspace/project-workspace.tsx
---
