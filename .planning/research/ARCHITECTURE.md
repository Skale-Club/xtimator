# Architecture Research — v4.18 Estimate Document & Send Experience Refresh

**Domain:** Subsequent-milestone integration research (existing production Next.js 14 App Router + Supabase SaaS)
**Researched:** 2026-07-08
**Confidence:** HIGH — every finding below is grounded in direct inspection of the current codebase (files/line ranges cited in Sources), not training-data assumptions about generic Next.js/Supabase architecture.

This is **not** a greenfield ecosystem survey. It answers: how do 4 tightly-coupled features (SEED-041..044) integrate with an existing, already-hardened estimate pipeline without breaking the channel-neutral generation core or the GUARD-03 deterministic-math invariant.

## Standard Architecture

### System Overview — the estimate document/send/share surface today

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  EDITOR (authenticated, tenant-scoped)                                            │
│  estimate-tab.tsx → estimate-editor.tsx → useEstimateReducer (client state)       │
│    stateToDocumentData() ─────────────► EstimateDocument (mode="edit")            │
│    stateToSavePayload()  ─────────────► saveEstimate() [Server Action]            │
└───────────────────────────────────────────┬───────────────────────────────────────┘
                                              │ writes (GUARD-03: server recomputes ALL
                                              │ math via computeEstimateTotals — client
                                              │ never trusted for tax/discount/deposit)
                                              ▼
                              ┌───────────────────────────────┐
                              │   estimates / estimate_sections /   (Supabase Postgres,
                              │   estimate_items  (RLS, per-company)  RLS-scoped)
                              └───────────────────────────────┘
                                              │ read by 6 INDEPENDENT render/format paths
                     ┌────────────┬───────────┼───────────┬────────────┬─────────────┐
                     ▼            ▼           ▼           ▼            ▼             ▼
             EstimateDocument  EstimateDocument  estimate-pdf.tsx  estimate-pdf-  estimate-   lib/whatsapp/
             (mode="view",     Modern (share,    (classic PDF,     modern.tsx     template.ts  formatter.ts
             classic share)    modern only)      /api/.../pdf)     (modern PDF)   buildItems-  formatEstimate-
                                                                                    Breakdown()  ForWhatsApp()
                     ▲            ▲                  ▲                 ▲              ▲             ▲
                     │            │                  │                 │              │             │
         app/estimate/[token]/page.tsx      app/api/estimates/[id]/pdf/route.ts   SendActionsMenu/  send-whatsapp/
         → getEstimateByShareToken()        (also builds its own doc-data object   PlainTextSheet    route.ts →
         (lib/queries/share.ts)             independently via getEstimateWithContext)                deliverEstimate-
                                                                                                       ViaWhatsApp()
```

**The load-bearing fact for this whole milestone:** there is no single "assemble estimate document data" function today. `EstimateDocumentData` (the shared TS shape consumed by both classic renderers) is independently re-built by **at least 3 different code paths** — `stateToDocumentData()` in `estimate-editor.tsx` (from reducer state), the inline object literal in `estimate-view.tsx` (from `ShareEstimateData`), and `getEstimateWithContext()` in `lib/queries/estimate.ts` (consumed by the PDF route). Two more consumers (`buildItemsBreakdown` and `formatEstimateForWhatsApp`) don't even use `EstimateDocumentData` — they read the raw `EstimateWithSections`/`FormatterEstimate` row directly. **All 6 render/format paths currently do their own independent `field != null` check** to decide whether Summary/Notes/Timeline/Warranty/Payment Terms render. None of them consult a shared "is this visible" source of truth, because none exists yet.

### Component Responsibilities (current state)

| Component/Module | Responsibility | File |
|---|---|---|
| `useEstimateReducer` | Client-side editor state machine; recomputes preview totals (`recalculate()`) mirroring the server engine byte-for-byte | `components/workspace/estimate/use-estimate-reducer.ts` |
| `computeEstimateTotals` | Server-side, deterministic tax/discount/deposit/markup math (GUARD-03 authority) | `lib/estimate/compute-totals.ts` |
| `saveEstimate` | Server Action; recomputes totals via the engine, persists sections/items/estimate row, optimistic-concurrency check | `lib/actions/estimate.ts` |
| `EstimateDocument` | THE shared classic renderer — used in BOTH `mode="edit"` (editor) and `mode="view"` (share page, classic template only). 2018 lines. Owns `InlineProjectName`, `LinkClientInline`, `DocumentTotals`, `TermsBlock`, `AddDetailsPopover`, `SortableDocumentItemRow` (desktop table row), the mobile branch that renders `ItemCardMobile` | `components/workspace/estimate/estimate-document.tsx` |
| `EstimateDocumentModern` | Share-only modern-template renderer (parallel implementation, not a variant of `EstimateDocument`) | `components/share/estimate-document-modern.tsx` |
| `estimate-pdf.tsx` / `estimate-pdf-modern.tsx` | `@react-pdf/renderer` PDF renderers, registry-selected by `companies.estimate_template_style` | `components/pdf/` |
| `getEstimateByShareToken` / `getShareLinkState` | Public bearer-token lookup — the ONLY authorization mechanism for `/estimate/[token]`; strips `share_token` from the response before it reaches the browser | `lib/queries/share.ts` |
| `buildShareLink` | **Client-only** URL builder (`window.location.origin`) — cannot be called from server routes | `lib/utils/share-link.ts` |
| `EstimateFloatingActions` | The `Save / Send` (+ overflow: Edit Estimate, Discard, Link Client) sticky pill — desktop + mobile variants | `components/workspace/estimate/estimate-floating-actions.tsx` |
| `SendDialog` → `SendForm` + `SendActionsMenu` + `PlainTextSheet` | Current channel-first (Email/SMS tabs) send UI + a separate "Share & Export" dropdown | `components/workspace/send/*.tsx` |
| `resolveTemplate` / `buildItemsBreakdown` | Pure plain-text template engine (already unit-testable, no React/DB) | `lib/utils/estimate-template.ts` |
| `deliverEstimateViaWhatsApp` / `formatEstimateForWhatsApp` | WhatsApp-specific delivery + formatter, honors `company.delivery_format` (`share_link`/`formatted_text`/`pdf_attachment`) | `lib/whatsapp/send-estimate.ts`, `lib/whatsapp/formatter.ts` |
| `linkProjectToClient` / `unlinkProjectFromClient` | Server actions — the ONLY DB write path for client linkage (already exist, already correct) | `lib/actions/project.ts:256-286` |
| `LinkClientInline` / `LinkClientButton` / `LinkClientCard` | **3 independent** implementations of the same fetch-clients → Command search → select → `linkProjectToClient` → toast → `router.refresh()` flow | `estimate-document.tsx:1339-1415`, `components/workspace/link-client-button.tsx`, `components/workspace/link-client-card.tsx` |
| `proxy.ts` | Route-level auth gate (Next.js middleware, renamed). `/estimate` is deliberately **absent** from `PROTECTED_ROUTE_PREFIXES`, so **any** path depth under `/estimate/*` is already public — a friendly 2-segment route needs zero proxy changes for auth | `proxy.ts:4-23` |

## Integration Architecture — answering the 4 sub-questions

### (a) Where presentation settings live, and how every consumer reads the same snapshot

**Recommendation: one new nullable JSONB column, `estimates.presentation_settings`, mirroring the exact precedent already in this codebase (`companies.tax_config JSONB`, landed dormant-first in `supabase/migrations/20260627000001_phase129_advanced_pricing_schema.sql`).** Do **not** use `estimates.metadata` — no such generic column exists on `estimates` today (only `estimate_activity.metadata` and `estimate_deliveries` have metadata-shaped columns; inventing a new generic bag on `estimates` would be a new pattern, not a reused one). Do **not** use N separate typed nullable boolean columns — SEED-041 needs ~8-10 toggle-shaped flags (summary/sections/payment-terms/timeline/warranty/notes/photos visibility, section-subtotals, qty/price visibility, estimate-number/date visibility); a JSONB bag is the established idiom here for "extensible, mostly-off, per-row configuration" and avoids a migration per future toggle.

**Split calculation from presentation exactly as the seed's own product rules demand — and exactly as v4.11 already built the precedent for:**
- Calculation-affecting knobs (Tax Off/Custom, Discount, Deposit) are **already** first-class typed columns (`tax_rate`, `discount_type`/`discount_value`, `deposit_type`/`deposit_value`) that `computeEstimateTotals` reads directly. **No schema change needed for these** — "Tax: Off" is simply `tax_rate = 0` (matches Decision-to-Lock #3's own leaning in SEED-041, and matches the existing `DefaultStateIndicator`/"Customized vs Default" UI pattern already in `DocumentTotals`). Routing these through the NEW gear panel is a UI-wiring change only, not a data-model change.
- Presentation-only knobs (section visibility, subtotal visibility, etc.) go in `presentation_settings`. **NULL/absent = show everything (retrocompat)** — same "dormant/type-guard-degrade" discipline as `isTaxConfig()` in `compute-totals.ts` (a malformed or absent config degrades to the safe default, never throws).

```sql
-- mirrors 20260627000001's exact idiom: idempotent, dormant, comment-documented
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS presentation_settings JSONB;
COMMENT ON COLUMN estimates.presentation_settings IS
  'Per-estimate document presentation overrides (SEED-041). NULL = show everything (retrocompat). Read by the shared lib/estimate/presentation-settings.ts resolver — never by ad hoc field != null checks.';
```

**The drift-prevention mechanism (the actual answer to "how must every consumer read the SAME settings snapshot"):** introduce one new pure module, e.g. `lib/estimate/presentation-settings.ts`, exporting:
- `resolvePresentationSettings(raw: unknown): ResolvedPresentationSettings` — a type-guard + defaults-fill function (same shape as `isTaxConfig`'s defensive pattern), so a malformed/legacy value never crashes a renderer.
- `isSectionVisible(settings: ResolvedPresentationSettings, field: 'summary' | 'payment_terms' | 'timeline' | 'warranty_terms' | 'notes' | 'photos'): boolean`.

Then **every one of the 6 existing independent consumers must import and call this instead of its own `field != null` check**:

| Consumer | File | Current behavior (must change) |
|---|---|---|
| Editor + classic share | `components/workspace/estimate/estimate-document.tsx` | Replace the local `isFieldVisible`/`revealed` Set/`toggleField` mechanism (lines 1613-1632) — see callout below, this is not additive, it's a replacement |
| Modern share | `components/share/estimate-document-modern.tsx` | Currently unconditional `estimate.summary &&` style checks (needs same audit as classic) |
| Classic PDF | `components/pdf/estimate-pdf.tsx:613,764-805` | `estimate.summary &&`, `estimate.payment_terms \|\| ...` — swap for `isSectionVisible()` |
| Modern PDF | `components/pdf/estimate-pdf-modern.tsx:624,765-812` | Same pattern, same fix |
| Plain text | `lib/utils/estimate-template.ts` `buildItemsBreakdown()` | Currently renders ALL sections/items unconditionally — needs a `presentation_settings`-aware variant (sections don't have individual visibility, but the "show quantities/unit prices" flag and Notes text will need to reach this pure function) |
| WhatsApp formatted | `lib/whatsapp/formatter.ts` `formatEstimateForWhatsApp()` | Same — `deliverEstimateViaWhatsApp` fetches its own narrow `estimates` select (`lib/whatsapp/send-estimate.ts:46-59`); that select must widen to include `presentation_settings` |

**Critical existing-behavior conflict to flag for planning (not just an addition):** `estimate-document.tsx`'s current "hide a section" mechanism is `toggleField()` (lines 1619-1632), which for an already-filled field **destructively clears it** (`dispatch({ type: 'UPDATE_FIELD', field, value: null })`). SEED-041 explicitly requires non-destructive toggling ("retain the text so it can be toggled back on"). This means `isFieldVisible`/`revealed`/`toggleField`/`AddDetailsPopover`'s wiring must be **replaced**, not layered underneath, by the new persisted `presentation_settings` flags — otherwise the editor will have two contradictory "is this shown" mechanisms (local ephemeral `revealed` Set vs. persisted `presentation_settings`) fighting each other. `EstimateDocumentData` (the shared type, `estimate-document.tsx:343`) should gain `presentation_settings?: ResolvedPresentationSettings | null`, threaded through by both `stateToDocumentData()` (editor) and the `documentData` builder in `estimate-view.tsx`.

`saveEstimate`'s `SaveEstimateInput` (`lib/actions/estimate.ts:70-97`) needs one new optional field (`presentation_settings?: ...`) — pass-through only, zero interaction with `computeEstimateTotals`, so GUARD-03 stays untouched.

### (b) Friendly URL alongside the token-only route — security model

**The existing `share_token` (`UUID DEFAULT gen_random_uuid()`, `supabase/migrations/20260409000001_initial_schema.sql:94`) is the sole bearer credential** — `getEstimateByShareToken()` (`lib/queries/share.ts:87-99`) looks up the row **exclusively** by exact match on this column and strips it from every response before it reaches the browser (`lib/queries/share.ts:243`). Any friendly-URL design must preserve this exactly: **the human-readable part of the path must never participate in authorization** — it is decoration only, resolved and validated purely for display.

**Recommendation: a NEW short opaque token column with its own unique index, not a truncation/reuse of the existing UUID.** A raw UUID (36 chars, hyphenated) is unsuitable for a "friendly" URL suffix, and truncating it arbitrarily (a) weakens entropy in a way that's hard to reason about and (b) can't be efficiently indexed for a prefix-match query. Instead:

```sql
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS public_slug_token TEXT;  -- e.g. nanoid(10), generated once
CREATE UNIQUE INDEX IF NOT EXISTS idx_estimates_public_slug_token
  ON public.estimates(public_slug_token) WHERE public_slug_token IS NOT NULL;
```
— this exactly mirrors the existing hardening precedent `idx_estimates_share_token` in `supabase/migrations/20260706000007_rls_hardening_indexes_grants.sql:56-57` (partial unique index, `WHERE ... IS NOT NULL`, dormant-safe for legacy rows). Backfill existing rows in the same migration (or lazily on first send, matching how `share_expires_at` is already lazily refreshed on every send path).

**`companySlug` also does not exist yet** — no `companies.slug` column exists in the schema (confirmed by grep; the only `slug` precedent in this codebase is `blog_posts.slug` with its own unique index, `supabase/migrations/20260503000001_phase15_admin_panel.sql:13,25`). Add `companies.slug` the same way (generated from `company.name` at creation or via a one-time backfill migration + trigger/action on rename).

**`estimateSlug` should NOT be persisted or required to be unique.** Since the trailing `shortToken` is what actually resolves the row, the slug text is purely cosmetic — compute it on the fly from the project/estimate title at render/send time (the codebase already does exactly this kind of ad hoc slugification for PDF filenames: `projectName.replace(/[^a-zA-Z0-9\s-]/g,'').replace(/\s+/g,'-').slice(0,50)` in both `send/route.ts:169-172` and `pdf/route.ts:112-115`). This avoids a slug-uniqueness migration burden and avoids stale-slug problems after a project rename — old shared links keep resolving correctly (the token still matches) even if the visible slug text no longer matches the current title; no redirect-to-fix-the-slug logic is needed.

**Route implementation:** Next.js App Router supports two **structurally distinct** dynamic trees at the same top-level prefix without conflict — the existing `app/estimate/[token]/page.tsx` (1 segment) and a new `app/estimate/[companySlug]/[estimateSlug]/page.tsx` (2 segments) can coexist; Next.js dispatches by segment count/shape, not by name. `[estimateSlug]`'s actual param value is `{estimateSlug}-{shortToken}` — parse the token as the suffix after the last `-` (or a fixed-length suffix if the token generator uses a fixed length, which is simpler and less fragile than delimiter-splitting against a slug that might itself contain hyphens).

**`proxy.ts` requires zero changes** — `/estimate` is deliberately absent from `PROTECTED_ROUTE_PREFIXES` (see the "Pre-launch audit fix" comment at `proxy.ts:7-17`), so `isProtectedRoute()` returns `false` for any path under `/estimate/*` regardless of depth; the new 2-segment route is public by construction, same as today's 1-segment route.

**`lib/queries/share.ts` needs a sibling lookup**, e.g. `getEstimateByPublicToken(token)` (or generalize `getEstimateByShareToken` to accept a `{ column: 'share_token' | 'public_slug_token' }` param) plus a matching `getShareLinkState` variant — both reusing the exact same expiry (`share_expires_at`) and PII-stripping discipline already proven in the existing function.

**Backward compat is free by construction:** leave `app/estimate/[token]/page.tsx` completely unmodified — it keeps resolving via `share_token` exactly as today. No redirect is required for the seed's stated requirement ("old links keep working"); a 301-to-canonical-friendly-URL can be added later as a pure enhancement once `companies.slug`/`public_slug_token` backfill is confirmed complete for the estimate being visited.

**A genuinely new finding relevant to sub-question (b) — the URL-builder duplication that will make this migration painful if not centralized first:** `buildShareLink()` (`lib/utils/share-link.ts`) is **client-only** (reads `window.location.origin`), so it can only be called from client components. Every **server-side** call site that needs to embed a share URL in an outbound message has independently hand-rolled the same string instead of importing a shared helper:
- `app/api/estimates/[id]/send-sms/route.ts:103` — `` `${baseUrl}/estimate/${estimate.share_token}` ``
- `lib/whatsapp/send-estimate.ts:76` — `` `${baseUrl}/estimate/${estimate.share_token}` ``
- `lib/whatsapp/confirm-actions.ts:123` — `` `${getCanonicalBaseUrl()}/estimate/${estimate.share_token}` ``
- `app/api/estimates/[id]/send/route.ts:113` builds an (unused/dead) `shareLink` local and actually leaves the link to be typed into the email body by the user via `SendForm`'s default `body` value (`buildShareLink(shareToken)` computed client-side in `send-form.tsx:71`).

**This is the real shared choke point for SEED-042**, more so than any single component: recommend introducing ONE isomorphic path-builder — e.g. `buildEstimatePublicPath(company: {slug, name}, estimate: {id, public_slug_token, share_token, project_name}): string` returning just the **path** (no origin) — and updating `buildShareLink` (client) and all 4 server call sites above to combine it with `window.location.origin` / `getCanonicalBaseUrl()` respectively. Doing this FIRST (as part of the URL-contract phase) means the friendly-URL rollout is a one-function change propagated everywhere, instead of 4-5 separate patches with drift risk.

**White-label/custom-domain flag — worth a quick verification, not a blocker:** `app/estimate/[token]/page.tsx` reads an `x-white-label` request header (`headers().get('x-white-label')`) that, per `.planning/phases/39-subdomain-routing-white-label/39-01-SUMMARY.md`, was originally set by a "custom host detection block" in `proxy.ts` "before updateSession()". **That block no longer exists in the current `proxy.ts`** (159 lines, fully read, no `white-label` or custom-host logic present) — meaning `isWhiteLabel` is very likely always `false` today regardless of custom domain. This predates and is unrelated to this milestone, but because SEED-042 explicitly claims "custom domains and white-label routing should still work with the new path," recommend a 10-minute verification pass (confirm whether white-label detection moved elsewhere, e.g. `next.config.js` rewrites, or is genuinely dead) before building custom-domain-aware slug resolution on top of it.

### (c) Suggested phase/build order

The four seeds have **near-zero data-model dependencies on each other**, but they have a **hard file-contention dependency** in one place (`estimate-document.tsx`) and **one real cross-feature data dependency**: the Send Hub's "Online Estimate / PDF / Plain Text" previews are supposed to show the client "what they'll see," which is meaningless before presentation settings exist.

```
Phase A ─┬─ SEED-042 URL contract + data model            (zero overlap w/ B, C)
         │   migrations, lib/queries/share.ts, lib/utils/share-link.ts + server
         │   call-site consolidation, new [companySlug]/[estimateSlug] route
         │
Phase B ─┴─ SEED-041 settings model + persistence          (small overlap w/ C via
             migration, lib/estimate/presentation-settings.ts,                the reducer + EstimateDocumentData
             use-estimate-reducer.ts action + EstimateDocumentData field,     type — land BEFORE Phase C)
             saveEstimate() pass-through field

Phase C  ── estimate-document.tsx CONSOLIDATED PASS         (SEED-041 UI, SEED-043, SEED-044
             all edit this ONE 2018-line file — sequence          all land here — see (d) below
             sub-steps, don't run 3 parallel agents on it)         for the recommended internal order)

Phase D  ── SEED-042 Send Hub UI + delivery templates        (depends on Phase B's settings
             + presentation-settings-aware plain-text/            existing; depends on Phase A's
             WhatsApp formatter updates                           friendly URL existing to surface
                                                                     it in the "Online Estimate" tab)
```

- **Phase A and Phase B can run fully in parallel** — disjoint file sets (A: `lib/queries/share.ts`, `lib/utils/share-link.ts`, new route, migrations for `companies.slug`/`estimates.public_slug_token`; B: `use-estimate-reducer.ts`, `lib/actions/estimate.ts`, a new `lib/estimate/presentation-settings.ts`, migration for `estimates.presentation_settings`). Two migrations in the same milestone are fine as long as they're separate idempotent files (matches existing convention of one migration per concern).
- **Phase C must be sequenced internally, not parallelized**, because SEED-041 (gear-driven visibility rewiring), SEED-043 (mobile item editor swap), and SEED-044 (alignment pass + `InlineProjectName` + client-picker consolidation) all touch `estimate-document.tsx` directly. See (d) for the recommended internal C1→C2→C3 order.
- **Phase D is the only piece with a genuine cross-seed data dependency** (needs Phase B's `presentation_settings` to exist so the plain-text/WhatsApp preview in the new Send Hub can honor hidden sections) and a soft UX dependency on Phase A (surfacing the friendly URL in the "Online Estimate" tab). Phase D's own files (`components/workspace/send/*.tsx`) are otherwise disjoint from Phase C's files, so **Phase D could start in parallel with Phase C** once Phase B is done — the only shared touch-point is `estimate-floating-actions.tsx`, which both the SEED-041 gear button and the SEED-042 Send-hub trigger wire into, and that's a small, additive, low-conflict file (243 lines, clear prop-based extension points already).

### (d) New vs modified components per feature, and the shared choke points

**SEED-041 — Settings control panel**

| New | Modified |
|---|---|
| `EstimateSettingsPopover` (or `.../estimate/estimate-settings-panel.tsx`) — desktop popover / mobile sheet, gear-triggered | `components/workspace/estimate/estimate-floating-actions.tsx` — add gear button + `onOpenSettings` prop |
| `lib/estimate/presentation-settings.ts` — `resolvePresentationSettings`, `isSectionVisible`, defaults | `components/workspace/estimate/estimate-document.tsx` — **replace** `isFieldVisible`/`revealed`/`toggleField`/`AddDetailsPopover` wiring (destructive → persisted) |
| Migration `NNN_estimate_presentation_settings.sql` | `components/workspace/estimate/use-estimate-reducer.ts` — new `UPDATE_PRESENTATION_SETTINGS` action, new state field |
| | `lib/actions/estimate.ts` — `SaveEstimateInput` gains the field (pass-through) |
| | `components/workspace/estimate/estimate-editor.tsx` — `stateToDocumentData()`/`stateToSavePayload()` |
| | `components/share/estimate-view.tsx` — thread settings into `documentData` |
| | `components/share/estimate-document-modern.tsx`, `components/pdf/estimate-pdf.tsx`, `components/pdf/estimate-pdf-modern.tsx`, `lib/utils/estimate-template.ts`, `lib/whatsapp/formatter.ts`, `lib/whatsapp/send-estimate.ts` (widen its narrow `estimates` select) — all 6 consumers from part (a) |

**SEED-042 — Format-first send + friendly links**

| New | Modified |
|---|---|
| `app/estimate/[companySlug]/[estimateSlug]/page.tsx` (+ `actions.ts` mirroring the token route's) | `lib/queries/share.ts` — new `getEstimateByPublicToken`/state variant |
| `SendHub` (replaces the channel-first `SendDialog` composition) with 3 format tabs (Online/PDF/Plain Text) | `lib/utils/share-link.ts` — isomorphic path builder |
| `lib/estimate/public-url.ts` (or similar) — `buildEstimatePublicPath()` shared path-builder | `app/api/estimates/[id]/send-sms/route.ts`, `send-whatsapp/route.ts`, `send/route.ts` — use the shared builder instead of inline string construction |
| Migration: `companies.slug`, `estimates.public_slug_token` + unique indexes | `lib/whatsapp/confirm-actions.ts`, `lib/whatsapp/send-estimate.ts` |
| | `components/workspace/send/send-form.tsx`, `send-actions-menu.tsx`, `plain-text-sheet.tsx` — likely absorbed into the new format-first hub, not kept as-is |
| | `estimate_deliveries` table — widen `channel` CHECK / add a `format` column (mirrors the existing idempotent-migration style in `20260519000003_estimate_deliveries.sql`) |

**SEED-043 — Mobile line-item editor parity**

| New | Modified |
|---|---|
| A document-native mobile item editor (refactor `ItemCardMobile` in place, or a new `DocumentItemMobileEditor` per the seed's own open decision) sharing compact field classes with `SortableDocumentItemRow` | `components/workspace/estimate/estimate-document.tsx` — the `sm:hidden` branch inside `DocumentSectionBlock` (lines ~765-806) |
| | `components/workspace/estimate/item-card-mobile.tsx` (if refactored in place rather than replaced) |
| — confirmed dead code, safe to delete or leave alone: `components/workspace/estimate/section-card.tsx` (only self-referenced; grep across `components/` found zero importers) — this resolves the seed's own "audit the active render path" open question. `item-row.tsx` is only imported by the dead `section-card.tsx`, so it is transitively dead too. | |

**SEED-044 — Document alignment + client editing**

| New | Modified |
|---|---|
| A shared client-picker (e.g. `useClientPicker()` hook or `ClientLinkPopover` component) consolidating the fetch/search/select/toast/refresh logic currently triplicated in `LinkClientInline` (`estimate-document.tsx:1339-1415`), `LinkClientButton` (`components/workspace/link-client-button.tsx`), `LinkClientCard` (`components/workspace/link-client-card.tsx`) | `components/workspace/estimate/estimate-document.tsx` — `InlineProjectName`'s `decoration-dotted` → solid thin underline; `Bill To` block gains hover/focus edit affordance wired to the new picker + `unlinkProjectFromClient`; broad spacing/alignment pass across company header/title band/info grid/summary/section headers |
| | `components/workspace/link-client-button.tsx`, `components/workspace/link-client-card.tsx` — refactor to consume the new shared picker instead of their own Command/fetch logic |

**Shared choke points ranked by sequencing risk:**

1. **`components/workspace/estimate/estimate-document.tsx`** (2018 lines) — touched by SEED-041 (visibility rewiring), SEED-043 (mobile branch), SEED-044 (alignment + `InlineProjectName` + `LinkClientInline`). **3 of 4 features, same file.** Highest risk if worked on in parallel — recommend the internal order below.
2. **The 6-consumer render/format fan-out** (part a's table) — not a single file, but a single *concept* that must land consistently across 6 files or the "editor shows X, client sees Y" bug class reappears immediately.
3. **Server-side share-URL construction** (part b's finding) — 4 independent inline string-builders that must all move to one shared path-builder in the same phase, or the friendly URL only half-rolls-out (e.g. SMS gets it, WhatsApp confirm-actions doesn't).
4. **`estimate-floating-actions.tsx`** — low risk, additive only (gear button for 041, unchanged `onSend` trigger reused by 042's new hub).

**Recommended internal order for the `estimate-document.tsx` phase (C1 → C2 → C3):**
1. **C1 — SEED-044 first**: extract the shared client-picker, fix `InlineProjectName`'s underline, do the alignment/spacing pass. This is the most self-contained of the three (mostly styling + one new extracted component) and settles the file's structure before the other two add behavior on top of it.
2. **C2 — SEED-041 second**: rewire `isFieldVisible`/`toggleField`/`AddDetailsPopover` to read `presentation_settings` (requires Phase B already landed), wire the gear button. Doing this after C1 means the diff is against the already-aligned layout, not a moving target.
3. **C3 — SEED-043 last**: swap the mobile item editor. Most isolated of the three (only the `sm:hidden` branch + `item-card-mobile.tsx`), and benefits from verifying mobile parity against the *final* desktop state (post-alignment, post-settings) rather than an intermediate one.

## Patterns to Follow

### Pattern 1: Dormant-first JSONB with a pure resolver + type guard

**What:** Add nullable JSONB columns via idempotent `ADD COLUMN IF NOT EXISTS`, ship them fully inert (NULL = old behavior), and centralize every read through one pure function that degrades safely on malformed/absent data (`isTaxConfig()` in `compute-totals.ts` is the canonical example — never throws, falls back to the flat/retrocompat path).
**When to use:** Any new per-row configuration bag where the toggle set is expected to grow (this milestone's `presentation_settings`).
**Trade-off:** JSONB loses column-level constraints/indexing on individual keys — acceptable here because these are UI toggles, not query filters.

### Pattern 2: Server is the sole arithmetic authority (GUARD-03) — extend inputs, never outputs

**What:** The client reducer's `recalculate()` (`use-estimate-reducer.ts:125-164`) is explicitly a **preview only**; `saveEstimate()` always recomputes via `computeEstimateTotals` server-side and the persisted row is authoritative.
**When to use:** Any new field that could plausibly affect a total (tax/discount/deposit toggles in SEED-041's settings panel). `presentation_settings` is safe specifically *because* it's read-visibility-only and never reaches `compute-totals.ts` — keep it that way; if a future field looks like it could change a number, it belongs in the typed columns/engine inputs, not the JSONB bag.
**Example:** `lib/estimate/compute-totals.ts:87-90` — `computeEstimateTotals` takes exactly the inputs it needs (`taxRate`, `discountType`, `depositType`, etc.); nothing UI-shaped is ever passed in.

### Pattern 3: Registry-keyed component lookup, not if/else

**What:** `PDF_TEMPLATE_COMPONENTS: Record<EstimateTemplateId, Component>` in `app/api/estimates/[id]/pdf/route.ts:20-23`, backed by `lib/estimate/templates/registry.ts`'s `isEstimateTemplateId` type guard.
**When to use:** Any place branching on a small closed set of variants (already used for classic/modern template selection). Not directly needed by this milestone's 4 features, but the presentation-settings resolver and the new format-first Send Hub (Online/PDF/Plain Text) should follow the same registry idiom rather than inline conditionals, for consistency with the surrounding code.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Encoding "is visible" as "is non-null"

**What people do (today, in `estimate-document.tsx`):** `isFieldVisible('summary') = data.summary != null || revealed.has('summary')` — conflates "has content" with "should be shown," and hiding destroys the content (`dispatch({ ..., value: null })`).
**Why it's wrong:** SEED-041 explicitly calls this out as a product requirement to fix — a business owner should be able to hide Notes for one client without losing the text.
**Do this instead:** Persisted boolean visibility flags in `presentation_settings`, fully independent of whether the underlying text field is null or populated.

### Anti-Pattern 2: Re-deriving the same public URL in N places

**What people do (today):** `send-sms/route.ts`, `lib/whatsapp/send-estimate.ts`, and `lib/whatsapp/confirm-actions.ts` each independently write `` `${baseUrl}/estimate/${estimate.share_token}` ``, while `buildShareLink()` (the one existing shared helper) can't be reused server-side because it's client-only.
**Why it's wrong:** A friendly-URL migration touches N call sites with N chances to miss one (exactly the failure mode SEED-042's "keep old links working, don't break WhatsApp/SMS" requirement is worried about).
**Do this instead:** One isomorphic path-builder, imported everywhere a share URL needs constructing, exercised by a single unit test that would catch any call site still hand-rolling the old shape.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|---|---|---|
| Editor reducer ↔ `saveEstimate()` | Server Action, full-object payload, optimistic-concurrency via `expectedUpdatedAt` | `presentation_settings` slots in here as a pass-through field, no math coupling |
| `estimates.presentation_settings` ↔ 6 renderers | Direct Supabase row read per consumer (no shared query layer exists yet) | Recommend the `lib/estimate/presentation-settings.ts` resolver as the enforced single read-path, not a new query abstraction (would be a larger refactor than this milestone needs) |
| Public share route ↔ `estimates` table | Bearer-token exact-match lookup via service-role client (RLS bypassed intentionally, PII stripped in the query layer) | New friendly route must reuse this exact posture with a second token column, never the slug |
| `proxy.ts` ↔ `/estimate/*` | Prefix-based route classification, `/estimate` deliberately unprotected at any depth | Zero changes needed for the new 2-segment route |
| WhatsApp delivery format ↔ presentation settings | `company.delivery_format` (`share_link`/`formatted_text`/`pdf_attachment`) already branches per-company; `formatted_text` path must additionally honor per-estimate `presentation_settings` | `lib/whatsapp/send-estimate.ts:69,110-113` |

## Sources

All findings are direct codebase inspection (HIGH confidence) of the following files, read in full or in relevant part during this research pass:

- `.planning/PROJECT.md` (Current Milestone: v4.18 section)
- `.planning/seeds/SEED-041-estimate-settings-control-panel.md`
- `.planning/seeds/SEED-042-format-first-send-flow-friendly-estimate-links.md`
- `.planning/seeds/SEED-043-mobile-estimate-line-item-editor-parity.md`
- `.planning/seeds/SEED-044-estimate-document-alignment-and-client-editing.md`
- `lib/estimate/compute-totals.ts`
- `lib/queries/share.ts`
- `lib/utils/share-link.ts`
- `app/estimate/[token]/page.tsx`, `app/estimate/[token]/actions.ts`
- `app/api/estimates/[id]/send/route.ts`, `send-sms/route.ts`, `send-whatsapp/route.ts`, `pdf/route.ts`
- `components/workspace/estimate/estimate-document.tsx` (full 2018 lines)
- `components/workspace/estimate/use-estimate-reducer.ts` (full)
- `components/workspace/estimate/estimate-editor.tsx`, `estimate-tab.tsx`, `estimate-floating-actions.tsx`
- `components/workspace/estimate/item-card-mobile.tsx`, `section-card.tsx` (confirmed dead code)
- `components/share/estimate-view.tsx` (full), `estimate-document-modern.tsx` (structural)
- `components/pdf/estimate-pdf-modern.tsx`, `estimate-pdf.tsx` (structural/grep)
- `components/workspace/send/send-dialog.tsx`, `send-form.tsx`, `send-actions-menu.tsx`, `plain-text-sheet.tsx` (full)
- `components/workspace/link-client-button.tsx`, `link-client-card.tsx` (full)
- `lib/utils/estimate-template.ts` (full), `lib/whatsapp/send-estimate.ts` (full), `lib/whatsapp/confirm-actions.ts` (grep)
- `lib/actions/project.ts` (full), `lib/actions/estimate.ts` (partial), `lib/queries/estimate.ts` (partial)
- `lib/estimate/templates/registry.ts` (full)
- `lib/estimates/share-link.ts` (full), `lib/utils/site-url.ts` (full)
- `proxy.ts` (full)
- `supabase/migrations/20260409000001_initial_schema.sql`, `20260627000001_phase129_advanced_pricing_schema.sql`, `20260519000003_estimate_deliveries.sql`, `20260706000007_rls_hardening_indexes_grants.sql`, `20260503000001_phase15_admin_panel.sql` (grep + relevant sections)
- `.planning/phases/39-subdomain-routing-white-label/39-01-SUMMARY.md` (grep, cross-referenced against current `proxy.ts` — found the white-label header-setting logic no longer present)

---
*Architecture research for: v4.18 Estimate Document & Send Experience Refresh (Xtimator)*
*Researched: 2026-07-08*
