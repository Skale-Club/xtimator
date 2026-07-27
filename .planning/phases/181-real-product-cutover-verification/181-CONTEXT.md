# Phase 181: Real-Product Cutover & Verification - Context

**Gathered:** 2026-07-27
**Status:** Ready for planning
**Mode:** Auto (`--auto`) — Claude selected recommended defaults for every gray area, logged below.

<domain>
## Phase Boundary

Prove the real, authenticated Xtimator product renders correctly and safely for the dedicated demo tenant (same identity/session infrastructure Phase 180 built), then cut every public demo entry point over to it and retire the standalone `/demo/*` UI. This phase does NOT touch the isolation/deny-write mechanism itself (Phase 180, already shipped and verified in production) — it consumes that mechanism.

</domain>

<decisions>
## Implementation Decisions

### Demo data readiness (PARITY-02)
- **D-13:** Reuse the existing `scripts/seed-demo-workspace.mjs` against the same `DEMO_COMPANY_ID` (`0000de00-0000-0000-0000-000000000001`) Phase 180's `demo_config` registry already points at — do not build a new seeding mechanism. `[auto] recommended: reuse existing idempotent seed script rather than duplicate seeding logic.`
- **D-14:** Verification step confirms the demo company already has representative projects/clients/price-book/estimates (it should, since the standalone `/demo` has been live); if any surface is sparse, re-run the seed script (service-role, bypasses RLS by design) rather than hand-inserting rows. `[auto] recommended: verify-then-seed-if-needed, not blind re-seed — avoids clobbering any live demo state visitors are currently using.`

### Exposed settings surfaces (PARITY-02)
- **D-15:** "Settings surfaces intentionally exposed to the demo" means the tabs that make sense read-only for a prospect exploring the product: Company profile, Team, Notifications, Price Book (already a core nav item, not under Settings). Billing, Stripe Connect/payments, WhatsApp/Telegram admin registry, and integration API-key tabs are NOT exposed (they reference real payment/credential setup that has no meaning for an anonymous demo visitor and would be confusing noise, not a parity gap). `[auto] recommended: expose identity/workspace-shape tabs, hide payment/credential/external-integration tabs — matches what SAFE-02's existing guard already denies at the write layer, so this is presentation consistency, not a new boundary.`
- **D-16:** Hidden settings tabs are hidden from demo nav entirely (not shown-then-blocked) — consistent with the existing `isDemo` conditional pattern already used for `ChatBubble` in `app/(app)/layout.tsx:257`. `[auto] recommended: follow the established isDemo-conditional-render pattern already in this codebase rather than introducing a new "visible but disabled" pattern.`

### Cutover mechanism (CUTOVER-01)
- **D-17:** The three landing "See Demo" links (`components/landing/hero-section.tsx`, `final-cta-section.tsx`, `landing-footer.tsx`) change from `href="/demo"` to the apex handoff `href="/demo/entry"`. `[auto] recommended: point directly at the already-verified Phase 180 handoff route, per ROADMAP D-01 ("Phase 181 switches the public /demo entry and landing CTA to that verified handoff").`
- **D-18:** After the verification gate passes, delete the standalone pages under `app/demo/` — `page.tsx`, `layout.tsx`, `dashboard/`, `clients/`, `projects/`, `price-book/` (and their `loading.tsx` siblings). **Do not touch** `app/demo/entry/route.ts` — that is Phase 180's handoff route and stays. `[auto] recommended: matches the user's own stated intent earlier this session ("só depois fazemos a troca do /demo e removemos app/demo/*") and ROADMAP D-12.`
- **D-19:** No redirect shim is added at the old `/demo` path after removal — `/demo` (the old index) simply 404s once its `page.tsx` is deleted, since every real entry point (landing CTAs) is updated in the same change to point at `/demo/entry` instead. `[auto] recommended: avoids maintaining a permanent redirect for a URL that was never itself the canonical marketing link — the landing page controls all outbound links to it.`

### Documentation (CUTOVER-02)
- **D-20:** Update the existing `DEMO-WORKSPACE.md` in place (it already documents the demo company/seed script but describes the pre-Phase-180 standalone architecture) rather than creating a parallel doc. Rewrite it to describe: the host-isolated flow (apex `/demo/entry` → `demo.<host>/demo/entry` → `/dashboard`), the `DEMO_APP_ORIGIN` env var, production DNS/Coolify domain setup for `demo.xtimator.com`, the Supabase Auth redirect allow-list entries needed, and local dev setup (`demo.localhost:<port>`) — explicitly noting production is Coolify, not Vercel, per project convention. `[auto] recommended: one canonical doc beats two overlapping ones; this file is already the established reference point (linked from the seed script's own header comment).`

### Claude's Discretion
- Exact wording/layout of the updated DEMO-WORKSPACE.md sections.
- Whether hidden-for-demo settings tabs are filtered in the tab list component itself or at the route level (whichever matches the existing `isDemo` wiring pattern with the least code change).
- Order of implementation waves (data verification, settings gating, then cutover+docs is the natural dependency order, but the planner has discretion).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 180 (dependency — already shipped, do not re-verify its mechanism)
- `.planning/phases/180-isolated-demo-session-read-only-foundation/180-CONTEXT.md` — decisions D-01 through D-12 this phase builds on
- `.planning/phases/180-isolated-demo-session-read-only-foundation/180-14-SUMMARY.md` — final state of the isolation mechanism, including two real production bugs already found/fixed (self-hosted host detection, CAPTCHA-blocked login) — this phase's verification must account for both being fixed, not re-discover them
- `lib/demo/session.ts`, `lib/demo/config.ts`, `lib/demo/guard.ts` — the mechanism this phase consumes
- `tests/e2e/demo-session-isolation.spec.ts` — the existing cross-host isolation proof; this phase's browser verification extends/parallels this, does not duplicate it

### Requirements
- `.planning/REQUIREMENTS.md` §PARITY-01..03, §CUTOVER-01..03 — exact requirement wording

### Existing demo docs/infra to reuse
- `DEMO-WORKSPACE.md` — target file for CUTOVER-02, currently describes the pre-180 standalone architecture (stale, needs rewrite)
- `scripts/seed-demo-workspace.mjs` — existing idempotent demo-data seed script, reuse don't rebuild

No other external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/demo/demo-banner.tsx` (`DemoBanner`) — already rendered in `app/(app)/layout.tsx:245` when `isDemo` is true. PARITY-03's "visibly identifies demo/read-only mode" requirement is already substantially met.
- `isDemo` prop already threaded through `Sidebar`, `TopBar`, `BottomNav` in `app/(app)/layout.tsx` (lines 102, 116, 127, 225, 239, 253) — established pattern for conditionally hiding/adjusting UI for demo sessions.
- `!isDemo && <ChatBubble .../>` (`app/(app)/layout.tsx:257`) — the existing pattern for hiding a write-capable surface entirely in demo mode; settings-tab gating should follow the same shape.
- `isDemoCompany()` (`lib/demo/config.ts`) — already imported and used in the app layout; the same helper settings-tab filtering should use.
- `scripts/seed-demo-workspace.mjs` — idempotent (deterministic UUIDs derived from `DEMO_COMPANY_ID`), uses service-role client (bypasses the Phase 180 RLS deny-write, as documented in its own header), supports `--dry-run`.

### Established Patterns
- Demo detection is read from `activeCompanyId` resolved server-side (`app/(app)/layout.tsx:163-164`), never trusted from the client — matches Phase 180's D-08 (fail-closed on either the demo-user or demo-company signal).
- Settings tabs live under `app/(app)/settings/(tabs)/` (seen: `team/page.tsx`, `notifications/page.tsx`; billing, integrations, and admin-registry tabs are siblings) — gating likely belongs in whatever shared settings-nav component lists these tabs, not per-page.

### Integration Points
- Landing CTAs: `components/landing/hero-section.tsx`, `components/landing/final-cta-section.tsx`, `components/landing/landing-footer.tsx` — 3 call sites to update.
- `app/demo/entry/route.ts` — the Phase 180 handoff route landing CTAs will point at; already live and verified.
- `app/demo/*` (page.tsx, layout.tsx, dashboard/, clients/, projects/, price-book/) — standalone UI to remove after the verification gate.

</code_context>

<specifics>
## Specific Ideas

User stated the cutover sequencing explicitly earlier this session, before Phase 180 even finished: "A implementação deve preservar o demo atual até o novo fluxo passar nos testes. Só depois fazemos a troca do /demo e removemos app/demo/*." (Preserve the current demo until the new flow passes tests; only then swap `/demo` and remove `app/demo/*`.) Phase 180's tests now pass (verified in production, including two real bugs found and fixed) — this phase is exactly that "swap and remove" step, gated on this phase's own browser verification (CUTOVER-03) passing first.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope (auto mode, no interactive scope-creep surfaced).

</deferred>

---

*Phase: 181-real-product-cutover-verification*
*Context gathered: 2026-07-27*
