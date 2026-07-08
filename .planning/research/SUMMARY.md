# Project Research Summary

**Project:** Xtimator
**Milestone:** v4.18 — Estimate Document & Send Experience Refresh (SEED-041..044)
**Domain:** Incremental UI/UX + data-model refresh of an existing production SaaS's core estimate document, per-document settings, and send/share surface (US service-business estimating SaaS)
**Researched:** 2026-07-08
**Confidence:** HIGH

## Executive Summary

This milestone is consolidation and hardening work on an already-shipped, already-hardened estimate pipeline — not a new subsystem. All four seeds (per-estimate settings panel, format-first send hub with friendly URLs, mobile line-item parity, document alignment + inline client editing) can be built entirely with technology already installed (`radix-ui`, `cmdk`, `zod`, `react-hook-form`, Node's built-in `crypto`) and by extending patterns this codebase has already proven out: the `companies.tax_config` dormant-first JSONB + type-guard idiom for settings, the `share_token` exact-match service-role lookup for public access, and the registry-keyed component pattern for template selection. Zero new npm packages are recommended, and the correct instinct throughout planning should be "extend an existing pattern," not "introduce a new one."

The single biggest structural risk is that five-to-six independent code paths (editor, classic share, modern share, classic PDF, modern PDF, plain-text/WhatsApp) each currently decide section visibility with their own `field != null` check and there is no shared source of truth — meaning a naive implementation of the new settings panel will almost certainly ship a setting that "works in the editor" but silently doesn't apply to the PDF or the client's actual WhatsApp message. A close second risk is security regression on the new friendly public URL: this exact codebase already shipped and had to revert an anon-RLS PII leak on `estimates` once (`20260606000002_drop_estimates_anon_select_policy.sql`), and a slug-based lookup implemented carelessly recreates the identical bug class. Both risks are well understood and have concrete, codebase-grounded mitigations (a single shared visibility resolver imported everywhere; keeping all public lookups on `requireServiceClient()` with exact-match filtering, never a new anon RLS policy).

The recommended approach is to sequence the milestone around dependency reality, not seed numbering: land the URL/security contract (SEED-042 foundation) and the settings data model (SEED-041 foundation) first — these are file-disjoint and can run in parallel — then do a single, internally-sequenced pass over the 2018-line `estimate-document.tsx` file that three of the four seeds all touch, and only then build the Send Hub UI and roll the settings resolver out across all six render/format consumers, since that rollout is the one piece with genuine dependencies on both foundations. Every phase should close with an explicit cross-surface verification step (does the PDF, the plain-text message, and both share templates all agree with what the editor shows?) rather than treating "the editor preview updates" as done.

## Key Findings

### Recommended Stack

Confirmed directly against `package.json`, the lockfile, and live source: **no new runtime dependencies are needed for any of the four target features.** `radix-ui@^1.4.3` already backs both `components/ui/popover.tsx` and `components/ui/sheet.tsx` (the latter already supports `side="bottom"` — a functional bottom sheet today, no `vaul` needed). `cmdk@^1.1.1` already backs `components/ui/command.tsx` and is already used in production for a client picker (`link-client-card.tsx`, `link-client-button.tsx`) — exactly the pattern SEED-044 needs to consolidate. Short unguessable public tokens should use Node's built-in `crypto.randomBytes(n).toString('base64url')` (this project's existing idiom via `crypto.randomUUID()` used in 4+ places), not `nanoid` (present only as a transitive dependency of `postcss`, not safe to import directly). Slug generation should reuse the existing dependency-free `slugify()` one-liner already proven in production for `blog_posts.slug`.

**Core technologies:**
- `radix-ui` (Popover, Sheet primitives) — desktop-popover / mobile-bottom-sheet for the settings panel, already themed to the app's glass design system
- `cmdk` via `components/ui/command.tsx` — command-palette search-select for the consolidated client picker, already load-bearing in production
- Node built-in `crypto.randomBytes(...).toString('base64url')` — short, CSPRNG-backed public token suffix; no polyfill needed (Node floor ≥20.9)
- Nullable JSONB column + typed TS interface + degrade-to-default type guard (the `companies.tax_config`/`isTaxConfig()` pattern) — the proven shape for `estimates.presentation_settings`
- `zod` + `react-hook-form` — validate/build the new settings-panel form fields the same way every other server action in this codebase does

### Expected Features

Per-document settings overrides, non-destructive section hiding, and link/portal-primary send flows are all well-established table stakes across the service-business estimating category (Housecall Pro, Jobber, ServiceTitan) — this milestone is catching up to and, in two areas, slightly ahead of the observed market, not inventing a novel category.

**Must have (table stakes):**
- Per-estimate override of tax/discount/deposit, scoped to that estimate only, without touching company defaults
- Hiding a section/field only changes presentation — never deletes underlying data or silently recalculates totals (Housecall Pro's explicit, documented behavior)
- Section/column visibility toggles (summary, line detail, terms, notes) as coarse on/off controls, not granular per-sub-field toggles
- Link/portal as the primary send artifact with PDF generated on demand, not force-attached
- Old share links (`/estimate/{share_token}`) keep working after the URL-format change
- No-login viewing of a shared estimate, company branding auto-applied

**Should have (differentiators):**
- In-canvas hover-to-edit "Bill To" block — no researched competitor (PandaDoc, DocuSign, Bonsai) does true in-canvas recipient editing
- Three equal top-level format choices (Online / PDF / Plain Text) fully replacing channel tabs — ahead of even Jobber/HoneyBook, which lean link-first without fully exposing three peer choices
- Human-readable branded URL (`/estimate/{companySlug}/{estimateSlug}-{shortToken}`) on the shared domain with zero tenant DNS setup, matching the Notion-style hybrid pattern
- Mobile line-item editor with true document-native visual parity (exceeds Joist, the cleanest researched mobile-first competitor)

**Defer (v2+):**
- Granular per-field visibility toggles inside a section — add only if owners request it after the coarse on/off ships
- Reusable settings presets/templates (explicitly deferred in SEED-041 itself)
- Tenant custom-domain white-labeling (Proposify-style CNAME) — heavier DNS lift, unnecessary while shared-domain friendly URLs already read as branded
- Pixel-based PDF/email open-tracking analytics — explicit anti-feature, unrequested scope creep, unreliable in practice

### Architecture Approach

There is no single "assemble estimate document data" function today — `EstimateDocumentData` is independently rebuilt by at least 3 code paths, and 6 render/format consumers each make their own `field != null` visibility decision. The correct architecture is to introduce exactly one new pure resolver module (`lib/estimate/presentation-settings.ts`) and one new isomorphic URL path-builder, and require every existing consumer to import and call them rather than re-deriving logic locally — mirroring how `lib/estimate/compute-totals.ts` is already the single authority for math (GUARD-03). Calculation-affecting settings (tax/discount/deposit) need zero schema changes — they already live in typed columns the engine reads directly; only presentation-only settings need a new dormant-first nullable JSONB column (`estimates.presentation_settings`, NULL = show everything).

**Major components:**
1. `lib/estimate/presentation-settings.ts` — new pure resolver (`resolvePresentationSettings`, `isSectionVisible`); single source of truth all 6 renderers must call
2. `lib/estimate/public-url.ts` (new) + `lib/utils/share-link.ts` (extended) — isomorphic path-builder replacing 7 independent inline URL-string constructions (including two inside `lib/billing/connect-webhook.ts`, easy to overlook)
3. `app/estimate/[companySlug]/[estimateSlug]/page.tsx` (new, coexists with unmodified `app/estimate/[token]/page.tsx`) + `getEstimateByPublicToken()` sibling to `getEstimateByShareToken()` — same service-role, exact-match, PII-stripping posture, new short-suffix column with its own partial unique index
4. `components/workspace/estimate/estimate-document.tsx` (2018 lines) — the shared choke point; SEED-041 (visibility rewiring), SEED-043 (mobile branch), and SEED-044 (alignment + client picker) all touch this one file and must be sequenced internally, not parallelized
5. `SendHub` (new, replaces channel-first `SendDialog`) — 3 format tabs (Online/PDF/Plain Text), depends on the settings resolver existing so previews are accurate

### Critical Pitfalls

1. **Settings-drift across renderers** — the gear panel's toggle updates the editor preview but the PDF/plain-text/WhatsApp message the client actually receives still shows old content, because those paths never learned about the new setting. Avoid by routing all 6 consumers through one shared `isSectionVisible()` resolver, verified with a test that diffs presence across all output surfaces for the same toggle — not just editor + one renderer.
2. **New non-destructive settings collide with the existing destructive "Add Details" hide toggle** — `toggleField()` today sets a field to `null` (deletes content) while SEED-041 requires hide-without-deleting. Shipping both as independent controls over the same five fields guarantees "I hid a section and the text is gone" support tickets. Lock the decision (retire the destructive toggle, or scope `AddDetailsPopover` to empty-field-only) before building the UI.
3. **Recreating the exact anon-RLS PII-leak class already fixed once on this table** — `20260606000002_drop_estimates_anon_select_policy.sql` documents a real, previously-shipped vulnerability where a "non-null" predicate let `anon` harvest every share token and scrape client PII. A slug-based lookup that isn't service-role + exact-match recreates this. No new anon RLS policy on `estimates`, ever, for this milestone.
4. **The "friendly" short suffix is guessable/enumerable despite looking random** — company/estimate slugs are public-derivable; if the secret suffix is short, low-alphabet, or derived from predictable inputs (sequential ID, timestamp), the combined URL is far weaker than the current 128-bit UUID `share_token`. Use ≥10 base62 chars from a CSPRNG, and consider basic rate limiting on the public route (none exists today).
5. **Scattered URL builders silently drop the Stripe redirect query-param contract** — 7 independent inline share-URL constructions exist today (including 2 inside payment-webhook code, `connect-webhook.ts`, easy to miss). A "helpful" pass to update all call sites to the new format risks breaking `?stripe=success`/`?stripe=canceled` redirects for real paying customers unless routed through one shared builder and re-verified against the existing Stripe e2e tests.

## Implications for Roadmap

Based on combined research, the four seeds have near-zero data-model dependencies on each other but one hard file-contention point (`estimate-document.tsx`, touched by 3 of 4 seeds) and one genuine cross-seed data dependency (the Send Hub needs the settings resolver to exist before its previews mean anything). Suggested phase structure:

### Phase 1: URL Contract & Public Access Security
**Rationale:** Contains the single highest-severity pitfall in the milestone (anon-PII-leak re-creation) and has zero file overlap with other phases — do this first, in isolation, with an explicit security checkpoint before any UI depends on it.
**Delivers:** `companies.slug` + `estimates.public_slug_token` columns (partial unique indexes, dormant-first), new `app/estimate/[companySlug]/[estimateSlug]/page.tsx` route coexisting with the unmodified token route, `getEstimateByPublicToken()`/`getShareLinkState()` siblings, one isomorphic `buildEstimatePublicPath()` path-builder replacing all 7 existing inline URL constructions (including the 2 inside `connect-webhook.ts`), `logEstimateView`/`respondToEstimate` wired to the estimate's real `share_token` regardless of which route was used to reach it.
**Addresses:** Friendly branded URLs, old share links keep working (FEATURES.md table stakes)
**Avoids:** Pitfalls 3 (anon RLS/PII leak), 4 (weak suffix entropy), 5 (scattered URL builders / Stripe regression), 6 (view-logging silently breaks on the new route)

### Phase 2: Presentation Settings Data Model & Persistence
**Rationale:** File-disjoint from Phase 1 (different migration, different modules) — can run in parallel with Phase 1 if desired, but must land before Phase 4 (Send Hub) and before the settings-UI sub-step of Phase 3. No dependency on Phase 1.
**Delivers:** `estimates.presentation_settings` JSONB column (dormant-first, mirroring the `tax_config` precedent exactly), `lib/estimate/presentation-settings.ts` (`resolvePresentationSettings`, `isSectionVisible`, type-guard degrade-to-default), `use-estimate-reducer.ts` new action + state field, `SaveEstimateInput` pass-through field (zero interaction with `computeEstimateTotals` — GUARD-03 stays untouched), the explicit decision lock on destructive-vs-non-destructive hiding (Pitfall 2).
**Uses:** JSONB + typed TS interface + type-guard stack pattern (STACK.md answer c)
**Implements:** `lib/estimate/presentation-settings.ts` resolver component (ARCHITECTURE.md part a)

### Phase 3: Estimate Document Consolidated Pass
**Rationale:** Three of four seeds (SEED-041 UI, SEED-043, SEED-044) all edit the same 2018-line `estimate-document.tsx` file — this must be one internally-sequenced phase, not three parallel agents. Depends on Phase 2 for the settings-wiring sub-step.
**Delivers, in internal order:**
  - **3a (SEED-044 first):** shared client-picker extraction (consolidating `LinkClientInline`, `LinkClientButton`, `LinkClientCard` — a 4th, undocumented implementation confirmed inside `estimate-document.tsx`), `InlineProjectName` reconciled against the more mature `ProjectTitle` component (validation + error-retry behavior), alignment/spacing pass, hover-to-edit Bill To wired to `linkProjectToClient`/`unlinkProjectFromClient` (already-existing server actions)
  - **3b (SEED-041 UI second):** gear button wired into `estimate-floating-actions.tsx`, `isFieldVisible`/`toggleField`/`AddDetailsPopover` rewired to read persisted `presentation_settings` (replacement, not layering)
  - **3c (SEED-043 last):** mobile line-item editor rebuilt on document-native styling, verified against the *final* desktop state
**Addresses:** In-canvas Bill To editing, document alignment, mobile line-item parity, settings gear UI (FEATURES.md differentiators)
**Avoids:** Pitfalls 7 (client-picker re-fork), 9 (wrong-viewport mobile verification), 10 (touch-target regression), 11 (diverged inline-rename implementations)

### Phase 4: Format-First Send Hub & Cross-Surface Settings Rollout
**Rationale:** The only phase with a genuine cross-seed data dependency — the Online/PDF/Plain-Text previews are meaningless without Phase 2's settings existing, and surfacing the friendly URL in the "Online Estimate" tab needs Phase 1. Files are otherwise disjoint from Phase 3, so this could start in parallel with Phase 3 once Phase 2 is done.
**Delivers:** `SendHub` replacing the channel-first `SendDialog`/`SendForm`/`SendActionsMenu`, `estimate_deliveries.channel` CHECK widened + `format` column added (mirroring the existing `20260526000005` precedent), the settings resolver rolled out to the remaining consumers (classic/modern PDF, classic/modern share, plain-text `buildItemsBreakdown()`, WhatsApp `formatEstimateForWhatsApp()` — widening its narrow `estimates` select to include `presentation_settings`), an explicit cross-surface diff test (one toggle → verified identical across all 6 outputs).
**Delivers (from FEATURES.md):** Format-first Send hub (3 artifact choices), presentation settings honored consistently everywhere
**Avoids:** Pitfall 1 (settings-drift — this is the phase where it either gets fully closed or silently ships), Pitfall 8 (`estimate_deliveries` schema can't hold the new format×channel model)

### Phase Ordering Rationale

- Phase 1 and Phase 2 are file-disjoint and can run in parallel; Phase 1 is sequenced first in this list only because it carries the single highest-severity pitfall (security) and should have its own checkpoint before other work references the new URL shape.
- Phase 3 must be internally sequenced (not split across parallel agents) because SEED-041, SEED-043, and SEED-044 all modify `estimate-document.tsx`; the 3a to 3b to 3c order was chosen so each seed builds on an already-settled layout rather than a moving target.
- Phase 4 is placed last because it is the only phase with a real dependency on both foundational phases (URL contract + settings model) and is where Pitfall 1 (settings-drift) is either definitively closed or silently ships — its own success criteria must require diffing all 5-6 render/format surfaces, not just "the editor preview updates."
- This ordering directly avoids the pitfall class documented repeatedly across PITFALLS.md: shipping a change that "looks done" in one surface (editor, PR screenshot, one viewport) while silently regressing another (PDF, plain-text, a different mobile width, an already-shipped-but-different component).

### Research Flags

Phases likely needing a deeper look or an explicit decision-lock during planning (not necessarily a full `/gsd:research-phase`, since the codebase-grounded research here is already HIGH confidence):
- **Phase 1:** Quick verification pass (~10 min per ARCHITECTURE.md) on whether the `x-white-label` custom-domain header logic referenced by `app/estimate/[token]/page.tsx` still exists anywhere in `proxy.ts`/`next.config.js` before building custom-domain-aware slug resolution on an assumption it works.
- **Phase 2:** Decision-lock required (SEED-041's own open decision #1) on destructive-vs-non-destructive hide semantics before UI work starts — this is a product decision, not a research gap.
- **Phase 4:** Decision-lock required on SEED-042's own open decisions #6 (default vs. remembered last-used send format) and #7 (whether client-only actions like copy/open/download belong in `estimate_deliveries` at all, versus a lighter client-analytics event) before the delivery-logging migration is finalized.
- **Phase 3 (SEED-043 sub-step):** Decision-lock required on the seed's own open question — minimum acceptable touch target for dense estimate editing — before compact controls are implemented.

Phases with standard, well-documented patterns (safe to proceed directly from this research, no additional research-phase needed):
- **Phase 1's data-access pattern** — service-role + exact-match lookup is already proven in this exact codebase (`getEstimateByShareToken`); the new lookup is a sibling, not a new pattern.
- **Phase 2's JSONB pattern** — dormant-first nullable JSONB + type-guard-with-defaults is already proven twice in this codebase (`companies.tax_config`, `platform_integrations.metadata`/`billing-config.ts`).
- **Phase 3's client-picker consolidation** — the 3-4 existing implementations are already near-identical; this is a refactor with a known target shape, not new UX research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every claim verified directly against `package.json`, the lockfile, and live source files — no training-data guesses; zero new dependencies recommended |
| Features | MEDIUM-HIGH | Direct competitor help-docs verified via WebFetch for Housecall Pro and PandaDoc; multi-source WebSearch corroboration for the rest; a few specific claims (Bonsai inline editing, exact PandaDoc override UI mechanics) are explicitly flagged LOW confidence but are non-blocking since Xtimator's approach in those areas is a stated differentiator, not a parity requirement |
| Architecture | HIGH | Every finding grounded in direct inspection of the current codebase (files/line ranges cited); confirms the exact shared choke points and consumer fan-out that make Pitfall 1 real, not hypothetical |
| Pitfalls | HIGH | Every pitfall grounded in direct codebase inspection, including one already-shipped-and-reverted real vulnerability (`20260606000002`) that directly predicts the friendly-URL risk |

**Overall confidence:** HIGH

### Gaps to Address

- Several product decisions are explicitly left open by the seeds themselves (destructive-vs-non-destructive hide semantics, default vs. remembered send format, whether copy/open/download belong in `estimate_deliveries`, minimum mobile touch target) — these are not research gaps but decisions that must be locked during phase planning before the corresponding UI is built, per the Research Flags above.
- The `x-white-label` custom-domain header path referenced by existing code may be dead (no matching logic found in current `proxy.ts`) — needs a short verification pass in Phase 1 before any custom-domain-aware behavior is assumed to work for the new friendly URL.
- FEATURES.md's LOW-confidence claims (Bonsai's exact editing flow, PandaDoc's precise per-document override UI mechanics) don't block planning since Xtimator's designed behavior in those specific areas (in-canvas Bill To editing, consolidated settings gear) is explicitly framed as ahead-of-market, not a gap to close against a known competitor pattern.

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `package.json`, `pnpm-lock.yaml` — dependency verification
- `components/ui/popover.tsx`, `sheet.tsx`, `command.tsx` — existing shadcn/Radix/cmdk wrappers
- `lib/estimate/compute-totals.ts`, `lib/billing/billing-config.ts` — JSONB + type-guard precedent
- `lib/queries/share.ts`, `app/estimate/[token]/page.tsx`, `app/estimate/[token]/actions.ts`, `lib/utils/share-link.ts` — public access + URL construction
- `supabase/migrations/20260606000002_drop_estimates_anon_select_policy.sql` — previously-fixed real PII-leak vulnerability on this exact table
- `supabase/migrations/20260409000001_initial_schema.sql`, `20260627000001_phase129_advanced_pricing_schema.sql`, `20260519000003_estimate_deliveries.sql`, `20260526000005_phase81_whatsapp_delivery_channel.sql`, `20260706000007_rls_hardening_indexes_grants.sql`
- `components/workspace/estimate/estimate-document.tsx` (full 2018 lines), `use-estimate-reducer.ts`, `estimate-editor.tsx`, `estimate-floating-actions.tsx`
- `components/workspace/link-client-button.tsx`, `link-client-card.tsx`; `components/workspace/project-title.tsx`
- `components/share/estimate-view.tsx`, `estimate-document-modern.tsx`; `components/pdf/estimate-pdf.tsx`, `estimate-pdf-modern.tsx`
- `lib/whatsapp/send-estimate.ts`, `confirm-actions.ts`, `formatter.ts`; `lib/billing/connect-webhook.ts`; `lib/utils/estimate-template.ts`
- `proxy.ts`; `tests/e2e/visual/_helpers.ts`, `share.spec.ts`, `tests/e2e/estimate-share-payment.spec.ts`
- `.planning/PROJECT.md`, `.planning/seeds/SEED-041..044-*.md`

### Secondary (MEDIUM-HIGH confidence — verified competitor documentation)
- [Adjust Individual Estimate Settings — Housecall Pro](https://help.housecallpro.com/en/articles/6908612-adjust-individual-estimate-settings-on-web-or-mobile) (WebFetch-verified)
- [Document settings — PandaDoc](https://support.pandadoc.com/en/articles/9715025-document-settings), [Edit sent documents — PandaDoc](https://support.pandadoc.com/en/articles/9714684-edit-sent-documents)
- [Quote Basics / Client Hub — Jobber Help Center](https://help.getjobber.com/hc/en-us/articles/115009378727-Quote-Basics)
- [Use Online Estimates — ServiceTitan](https://help.servicetitan.com/how-to/online-estimates)
- [How clients access and submit smart files — HoneyBook](https://help.honeybook.com/en/articles/9768365-how-clients-access-and-submit-smart-files)
- [Branded URL — Proposify Knowledge Base](https://support.proposify.com/articles/2882195-branded-url)
- [Payment Link API — Stripe Docs](https://docs.stripe.com/api/payment-link) (opaque-ID URL pattern, official docs)
- [nextjs.org/docs/app/guides/upgrading/version-16](https://nextjs.org/docs/app/guides/upgrading/version-16) — Node ≥20.9 floor confirmation

### Tertiary (LOW confidence, flagged and non-blocking)
- Bonsai inline client editing (could not verify either way)
- Exact PandaDoc per-document settings override UI mechanics (capability confirmed, mechanics not detailed publicly)
- Notion-style URL architecture blog post (single-source but internally consistent with observed Notion behavior)
- Joist mobile UI review aggregators (third-party reviews, not official docs)

---
*Research completed: 2026-07-08*
*Ready for roadmap: yes*
