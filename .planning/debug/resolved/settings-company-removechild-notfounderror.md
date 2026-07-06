---
status: resolved
trigger: "Sentry (issue XTIMATOR-6) reports a production regression: NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node. on route /settings/company"
created: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED. XTIMATOR-6 is the browser-translation/extension DOM-mutation class of `removeChild` NotFoundError (well documented React/Google-Translate interop bug: Translate wraps text nodes in `<font>` elements, corrupting the DOM tree React expects to reconcile against). This exact issue was already diagnosed once in `.planning/debug/resolved/sentry-open-issues.md`-style investigation on 2026-06-27 and "fixed" by adding `translate="no"` + `<meta name="google" content="notranslate">` in app/layout.tsx. That mitigation only suppresses Chrome's *automatic* translate-offer banner — it does NOT block a user manually forcing translation (right-click "Translate to X", address-bar icon, or a translation extension), which is why Sentry re-flagged the same issue as a regression on 2026-07-04. The regression date also coincides with a new Radix Popover (ColorPickerPopover) being wired into this exact page's Brand Color card, increasing portal/dynamic-DOM surface area that is especially fragile to Translate's node rewriting.
test: N/A — root cause confirmed via prior investigation file, current app/layout.tsx code inspection, and external documentation (React repo issue #11538, Medium writeups on Radix/shadcn + Google Translate removeChild). Not reproducible via unit test since the corruption is injected by the browser/extension outside app control; correct verification is a defense-in-depth Sentry client-side filter plus confirming the notranslate markup is still intact.
expecting: Add a targeted `ignoreErrors` (or event-message filter) entry in instrumentation-client.ts for this specific benign NotFoundError message, consistent with the existing `isUnreportableServerActionMismatch` filter pattern in lib/observability/sentry-filters.ts, so recurrences from manual/forced translation don't reopen XTIMATOR-6 as a false-positive regression, while leaving all other DOM/runtime errors reportable.
next_action: RESOLVED. Human checkpoint auto-approved the fix as-is on 2026-07-04. Root cause is external (browser/extension-driven DOM mutation via manual page translation on /settings/company), not application code — the visual DOM corruption from Chrome's translate feature is unfixable app-side and expected to still occur; the fix is a monitoring-noise filter that stops Sentry from re-flagging this non-actionable error class, not a change to the page's rendering logic. Post-deploy follow-up (non-blocking): confirm no new XTIMATOR-6 events appear in Sentry after this filter ships.

## Symptoms

expected: Navigating to/around /settings/company (app/(app)/settings/(tabs)/company/page.tsx and its layout app/(app)/settings/layout.tsx, nav component components/settings/settings-nav.tsx) should render and unmount cleanly with no console/runtime errors.
actual: Browser throws `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.` This is a classic React DOM reconciliation error, typically caused by: (a) a ref-based DOM manipulation (portal, tooltip, third-party widget, animation library) removing/replacing a node that React's reconciler still expects to control, (b) a conditional early-return/unmount race in a component tree with Radix/shadcn primitives (Dialog, Select, Popover, Tabs) during fast navigation, (c) key mismatches causing React to attempt removing an already-detached node, or (d) StrictMode double-invoke interacting badly with an effect that manually mutates the DOM.
errors: NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.
reproduction: Exact user steps unknown — only have the Sentry error report, not a manual repro. Likely involves navigating to or away from /settings/company (e.g. switching settings tabs quickly, closing a dialog/dropdown while the page is transitioning, or browser back/forward). Investigate the settings tabs layout, any Radix/shadcn Dialog/Select/Popover/Tooltip used on this page, and any direct DOM refs.
started: First seen 2026-06-27T02:57:10Z in production (environment: production). Re-flagged as a regression on 2026-07-04, seen 2 times total, last seen 2026-07-04T21:55:00Z. No manual repro steps available from the reporter.

## Eliminated

- hypothesis: Radix Popover close-ordering race with react-colorful pointer-drag listeners causing a double-remove on the same node (app-code bug in ColorPickerPopover/IndustrySelector).
  evidence: ColorPickerPopover and IndustrySelector both use the standard shadcn Popover/Command wrappers (components/ui/popover.tsx, components/ui/command.tsx) with no direct DOM refs, no manual node removal, and stable `key` props throughout. No commit near either Sentry timestamp touches Radix internals or bypasses React's reconciler. This does not explain the FIRST occurrence (2026-06-27), which predates the color picker's existence (introduced 2026-07-04 per commits f100075e/9d1694eb/e44b2438).
  timestamp: 2026-07-04

- hypothesis: Reintroduced `<SelectItem value="">` in defaultEstimateLanguage Select (previously fixed in commit 419383d6, 2026-05-20) causing a Radix Select crash.
  evidence: Current components/settings/company-info-form.tsx (lines 418-439) uses `<SelectItem value="en">` — the empty-string item was never reintroduced. Grep for `SelectItem value=""` across the repo only matches historical .planning docs, not live code.
  timestamp: 2026-07-04

- hypothesis: settings-nav.tsx item reorder (commit 22418c4a, 2026-06-27) destabilizing React keys during navigation.
  evidence: SubNav renders Link-based nav items keyed by stable `value` strings; reordering the ITEMS array does not change any item's key, and /settings/company itself uses server-rendered <Link> navigation (no client-side conditional unmount of the nav). Not a plausible removeChild trigger.
  timestamp: 2026-07-04

## Evidence

- timestamp: 2026-07-04
  checked: git log around first Sentry occurrence (2026-06-27T02:57:10Z) and regression re-flag (2026-07-04)
  found: Sentry/observability tooling itself was only wired up ~2026-06-27 07:58 EDT (commits b7bae81d, 8b5fde06) — the first captured event at 02:57 UTC is essentially the first production traffic seen after instrumentation went live, not necessarily a newly-introduced bug that day.
  implication: First-seen timestamp reflects "first time Sentry was watching," not "first time the bug started happening" — consistent with a long-standing, low-frequency, environment-triggered issue rather than a fresh app-code regression.

- timestamp: 2026-07-04
  checked: .planning/debug/sentry-open-issues.md (prior resolved debug session, dated 2026-06-27)
  found: This exact issue (XTIMATOR-6) was already investigated once. Diagnosis: "external browser translation/extension DOM mutation during React navigation cleanup." Fix applied: app/layout.tsx `translate="no"` on <html> + `<meta name="google" content="notranslate">`. Eliminated at the time: "application removeChild call: application code has no matching call on the affected settings/navigation path and the stack terminates entirely in React deletion effects" (i.e., confirmed non-application stack trace).
  implication: Root cause classification (browser translation / extension DOM mutation) was already correct. The mitigation shipped was necessary but insufficient — it doesn't cover manual/forced translation, which is why Sentry reopened the issue as a regression on 2026-07-04.

- timestamp: 2026-07-04
  checked: app/layout.tsx current content
  found: `translate="no"` and `notranslate` meta tag are both still present and intact — the June 27 fix was not reverted.
  implication: Rules out "fix got reverted" — the recurrence is an inherent gap in the notranslate-only approach, not a regression of that specific fix.

- timestamp: 2026-07-04
  checked: Web research (React GitHub issue #11538, Medium: "Fixing the removeChild DOM NotFoundError Caused by Browser Translation in Radix/shadcn/ui", multiple corroborating sources)
  found: `translate="no"` / `notranslate` only suppress Chrome's automatic translate-offer banner. A user manually forcing translation (right-click menu, address-bar icon, or a translation browser extension) bypasses this hint entirely; Google Translate rewrites text nodes into `<font>` wrappers, corrupting the DOM tree React expects during its own reconciliation/cleanup, which throws `NotFoundError: Failed to execute 'removeChild'` when React later tries to remove a node that translation already detached/replaced. This is an unfixable-at-the-framework-level, browser-external DOM mutation; recommended handling is to make the error non-fatal / filter it from error-tracking rather than chase an application-code fix.
  implication: Correct remediation is a defense-in-depth Sentry client-side error filter (matches existing codebase pattern of lib/observability/sentry-filters.ts + instrumentation.ts beforeSend for the Server Action mismatch case), not further changes to translate/notranslate markup or to app component code.

- timestamp: 2026-07-04
  checked: instrumentation-client.ts (client-side Sentry init)
  found: Has `ignoreErrors: ["ResizeObserver loop limit exceeded", "Non-Error promise rejection captured"]` but no filter for this removeChild/DOM-mutation error class. instrumentation.ts (server) has a `beforeSend` calling `isUnreportableServerActionMismatch` from lib/observability/sentry-filters.ts for an analogous "known-benign, non-actionable" exception class.
  implication: The codebase already has the exact scaffolding needed (shared filter module + beforeSend/ignoreErrors wiring) — the missing piece is a client-side filter function for this specific NotFoundError message, following the same pattern.

## Resolution

root_cause: Chrome's browser-native "Translate this page" feature (manually invoked by the user, or occasionally by a translation extension), when engaged on /settings/company, rewrites React-owned text nodes into `<font>`-wrapped replacements. This corrupts the DOM structure React's reconciler expects, so a subsequent React cleanup/removeChild call on navigation or re-render throws `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.` The June 27 fix (`translate="no"` + `notranslate` meta) only suppresses Chrome's automatic translate offer, not manual/forced translation or third-party translation extensions, so the same class of error recurred and Sentry re-flagged it as a "regression" on 2026-07-04. This is a well-documented, framework-external DOM-mutation class of error (not an application logic bug), confirmed by React's own issue tracker and the prior debug session's stack-trace analysis (no first-party frames, terminates entirely inside React's deletion effects).
fix: Added `isBenignDomMutationError` to lib/observability/sentry-filters.ts (matches on `removeChild`/`insertBefore` NotFoundError message patterns), and wired it into a new `beforeSend` hook in instrumentation-client.ts (client-side Sentry init) that drops matching events. Follows the exact existing pattern used for the Server Action mismatch filter (isUnreportableServerActionMismatch + instrumentation.ts beforeSend). Left the existing translate="no"/notranslate markup in app/layout.tsx in place (still correct as a first line of defense, just insufficient alone since it doesn't cover manual/forced translation or translation extensions).
verification: Added 4 new unit tests (tests/unit/observability/sentry-filters.test.ts) covering: drops removeChild NotFoundError, drops insertBefore NotFoundError variant, keeps unrelated DOM/runtime errors reportable, keeps events with no exception values reportable. Full suite: 8 test files / 39 tests passed. `npx tsc --noEmit -p tsconfig.ci.json` clean. `npx eslint` on all 3 touched files clean. Self-verification complete; real-world confirmation (no further XTIMATOR-6 Sentry events post-deploy) requires production monitoring since the triggering condition is an external browser/extension action that cannot be forced in a local repro.
files_changed: [lib/observability/sentry-filters.ts, instrumentation-client.ts, tests/unit/observability/sentry-filters.test.ts]
