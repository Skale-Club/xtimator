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

## settings-company-removechild-notfounderror — Sentry regression: browser-translation removeChild NotFoundError on /settings/company
- **Date:** 2026-07-04
- **Error patterns:** NotFoundError, removeChild, insertBefore, Failed to execute, Node to be removed is not a child of this node, settings/company, Sentry regression, browser translation, Google Translate, notranslate, DOM mutation
- **Root cause:** Chrome's "Translate this page" feature (manually invoked by the user, or a translation extension), when engaged on a page, rewrites React-owned text nodes into `<font>`-wrapped replacements. This corrupts the DOM structure React's reconciler expects, so a subsequent React cleanup/removeChild (or insertBefore) call on navigation or re-render throws `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.` This is external, browser-driven DOM mutation, not an application bug (stack trace terminates entirely inside React's deletion effects, no first-party frames). A prior fix (`translate="no"` + `<meta name="google" content="notranslate">` in app/layout.tsx) only suppresses Chrome's *automatic* translate-offer banner, not manual/forced translation or translation extensions, so the same error class can recur and falsely re-flag as a "regression."
- **Fix:** Added `isBenignDomMutationError` to lib/observability/sentry-filters.ts (matches removeChild/insertBefore NotFoundError message patterns) and wired it into a `beforeSend` hook in instrumentation-client.ts (client-side Sentry init) that drops matching events, following the existing `isUnreportableServerActionMismatch` pattern. This is a monitoring-noise filter only — it does not and cannot fix the underlying browser-side DOM corruption, which is expected to still occur but no longer gets reported as an error.
- **Files changed:** lib/observability/sentry-filters.ts, instrumentation-client.ts, tests/unit/observability/sentry-filters.test.ts
---
