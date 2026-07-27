# Phase 181: Real-Product Cutover & Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-27
**Phase:** 181-real-product-cutover-verification
**Mode:** `--auto` (no interactive questions — Claude selected recommended defaults for every gray area)
**Areas discussed:** Demo data readiness, Exposed settings surfaces, Cutover mechanism, Documentation

---

## Demo data readiness (PARITY-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse `scripts/seed-demo-workspace.mjs` | Existing idempotent script, same `DEMO_COMPANY_ID` Phase 180 already registered | ✓ |
| Build new seeding logic | Duplicate effort, risks a second source of truth for demo data shape | |
| Hand-seed via SQL | Not idempotent, not reusable across environments | |

**Selected:** Reuse existing script; verify data presence first, seed only if sparse.
**Notes:** The standalone `/demo` has been live this whole time, so the demo company likely already has real data — verification should confirm rather than assume, and never blind-reset live demo state.

---

## Exposed settings surfaces (PARITY-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Show all settings tabs, disable controls within | More surface area to guard per-control, more visual noise | |
| Show only identity/workspace tabs (Company, Team, Notifications), hide Billing/Integrations/Admin-registry | Matches what SAFE-02 already blocks at the write layer; simpler | ✓ |
| Hide Settings entirely for demo | Loses real parity — a real tenant can see their own settings | |

**Selected:** Expose Company/Team/Notifications (+ Price Book as existing core nav); hide Billing, Connect/payments, WhatsApp/Telegram admin registry, integration API-key tabs.
**Notes:** Follows the existing `isDemo`-conditional pattern already used for `ChatBubble` in `app/(app)/layout.tsx` — hidden, not shown-then-blocked.

---

## Cutover mechanism (CUTOVER-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Point landing CTAs at `/demo/entry`, delete standalone pages, no redirect shim | Matches ROADMAP D-01/D-12 and the user's own stated sequencing | ✓ |
| Keep a redirect shim at old `/demo` path | Extra permanent code for a URL that was never the canonical marketing link | |
| Delete standalone pages before verification passes | Violates the explicit "preserve until tests pass" instruction given earlier this session | |

**Selected:** Update 3 landing CTA links to `/demo/entry`; delete `app/demo/{page,layout}.tsx` + `dashboard/`, `clients/`, `projects/`, `price-book/` subtrees; keep `app/demo/entry/route.ts`; no redirect shim.
**Notes:** User explicitly said, before Phase 180 finished: "Só depois fazemos a troca do /demo e removemos app/demo/*" — this phase is exactly that step, gated on this phase's own verification passing.

---

## Documentation (CUTOVER-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite existing `DEMO-WORKSPACE.md` in place | Already the established reference (linked from the seed script), just describes the pre-180 architecture | ✓ |
| Create a new separate doc | Two overlapping docs, risk of drift | |

**Selected:** Rewrite `DEMO-WORKSPACE.md` to describe the host-isolated flow, `DEMO_APP_ORIGIN`, Coolify DNS/domain setup for `demo.xtimator.com`, Supabase Auth redirect allow-list, and local `demo.localhost` setup — explicit that production is Coolify, not Vercel.

---

## Claude's Discretion

- Exact wording/structure of the rewritten `DEMO-WORKSPACE.md`.
- Whether settings-tab gating happens in the shared tab-list component or per-route (whichever fits the existing wiring with least change).
- Implementation wave ordering (planner's call — natural dependency order is data verification → settings gating → cutover + docs).

## Deferred Ideas

None — auto mode, no interactive scope-creep surfaced.
