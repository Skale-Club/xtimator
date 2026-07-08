# Requirements: Xtimator — Milestone v4.18 Estimate Document & Send Experience Refresh

**Defined:** 2026-07-08
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** Give business owners full control and polish over the estimate document itself — a per-estimate settings panel, a format-first send flow with friendlier client links, mobile line-item parity with desktop, and a complete alignment/inline-editing pass on the document (including editable Bill To). Source: [SEED-041](seeds/SEED-041-estimate-settings-control-panel.md) + [SEED-042](seeds/SEED-042-format-first-send-flow-friendly-estimate-links.md) + [SEED-043](seeds/SEED-043-mobile-estimate-line-item-editor-parity.md) + [SEED-044](seeds/SEED-044-estimate-document-alignment-and-client-editing.md).

> **Locked decisions (non-negotiable, resolved autonomously from research + seed "Decisions to Lock" per the standing no-checkpoint-interruptions preference):**
> - **Friendly URL shape:** `/estimate/{companySlug}/{estimateSlug}-{shortToken}`, where `shortToken` is ≥10 base62 chars from `crypto.randomBytes(...).toString('base64url')` stored in a NEW `estimates.public_slug_token` column (its own unique index) — never a truncated/reused `share_token` UUID. Old `/estimate/{share_token}` links keep working forever; both routes coexist permanently, no forced migration.
> - **No new anon RLS policy on `estimates`, ever.** The friendly-URL lookup mirrors `getEstimateByShareToken`'s exact service-role + exact-match posture. This codebase already shipped and reverted one anon-RLS PII leak on this table (`20260606000002_drop_estimates_anon_select_policy.sql`) — do not recreate that bug class.
> - **Non-destructive hiding is the ONLY hiding mechanism going forward.** The new presentation-settings toggles never clear field content, this REPLACES today's destructive `toggleField()` for Summary/Sections/Payment Terms/Timeline/Warranty/Notes — no dual system.
> - **"Tax Off" preserves the default rate.** It's a separate enabled/disabled flag on top of the existing rate, not a mutation to `tax_rate = 0` — so re-enabling restores the original value.
> - **Section visibility is honored on ALL channels from day one** — editor, both share templates (classic/modern), both PDF templates, plain-text, and WhatsApp. Deferring any channel is exactly the "settings-drift" risk research flagged as the #1 structural risk of this milestone.
> - **Coarse toggles only — no granular per-field hiding in v1** (e.g., no "show quantities but hide unit price"). Matches the seed's own stated caution and FEATURES.md's "must have = coarse, differentiator/risk = granular."
> - **No reusable settings presets/templates in v1** — settings are per-estimate only (explicitly deferred in SEED-041 itself).
> - **Client picker: switch or unlink, no inline creation in v1.** A compact popover (not a full command dialog) from a hover-reveal pencil icon beside the Bill To client name.
> - **Inline-edit affordance:** thin solid underline on hover/focus for the project name (replacing the dotted underline), reconciled with `ProjectTitle`'s more complete validation/error-retry behavior. The Bill To block gets a small pencil icon instead (a different entity-switch action, not inline text edit).
> - **Mobile line-item editor stays fully inline-editable** (no collapse-behind-expand), refactoring `ItemCardMobile` in place, sharing compact field styles with `SortableDocumentItemRow`. Existing 44px icon/toggle touch targets are preserved even as visual density increases.
> - **`estimate_deliveries` gains explicit `format` + widened `channel`** columns (mirroring the existing `20260526000005` precedent) so every send/copy/open/download action is auditable, not just email/SMS sends.
> - **Send Hub always defaults to "Online Estimate"** — no remembered-last-used state in v1.
> - **PDF/Plain Text via SMS/WhatsApp falls back to the Online Estimate link** — no new attachment-delivery channel is built.
> - **Email/SMS/WhatsApp copy stays fixed** (reuses existing `estimate_template_*` company fields) — no new per-estimate template layer.
> - **Autonomous execution.** Per the standing no-checkpoint-interruptions preference — research-flagged open decisions above were resolved by best judgment, grounded in PITFALLS.md/ARCHITECTURE.md/FEATURES.md, and documented here rather than pausing to ask.

## v1 Requirements

Each requirement maps to exactly one roadmap phase.

### URL Contract & Public Access Security

- [ ] **PUBURL-01**: A shared estimate can be opened via a friendly branded URL shaped `/estimate/{companySlug}/{estimateSlug}-{shortToken}`, generated for every estimate (existing and new). *(Plan 01 landed the schema/builder; still needs Plan 03's route + Plan 05's new-estimate wiring/backfill.)*
- [ ] **PUBURL-02**: Every existing `/estimate/{share_token}` link keeps resolving and behaving exactly as today (same expiration via `share_expires_at`, same view-logging, same accept/decline actions) — zero regression for links already sent to real clients. *(Plan 02 proved the existing functions byte-unchanged; final proof lands with Plan 03's route + Plan 04's call-site migration.)*
- [x] **PUBURL-03**: The public lookup for the new friendly route uses the same service-role + exact-match posture as the existing token lookup — no new `anon`-accessible RLS policy is added to `estimates` under any condition. *(Complete — enforced by both Plan 01's static migration-contract test and Plan 02's live anon-RLS negative test.)*
- [ ] **PUBURL-04**: All existing inline share-URL construction call sites (including the 2 inside the Stripe Connect webhook) are replaced by one shared isomorphic path-builder, verified to preserve the `?stripe=success`/`?stripe=canceled` redirect contract. *(Plan 01 landed the builder; Plan 04 migrates the actual call sites.)*
- [ ] **PUBURL-05**: View-logging and accept/decline actions work identically regardless of which URL (token or friendly) the client used to reach the estimate. *(Plan 02 landed `realShareToken` threading; Plan 03 wires it into the new route.)*
- [ ] **PUBURL-06**: The existing custom-domain white-label behavior (SEED-009) is verified compatible with the new friendly route before it ships; if the underlying header logic is found dead, that finding is documented rather than assumed working.

### Presentation Settings Data Model & Persistence

- [ ] **PRESENT-01**: Every estimate has a persisted `presentation_settings` record (dormant-first JSONB, `NULL` = today's behavior = everything visible) covering visibility of Summary, Line Sections/Scope Details, Payment Terms, Timeline, Warranty, Notes, and Attached Photos.
- [ ] **PRESENT-02**: Toggling a section's visibility off never deletes or clears its underlying generated content — content is preserved and restored exactly when toggled back on.
- [ ] **PRESENT-03**: An estimate can override Tax (Default / Custom / Off), Discount, and Deposit independently of company defaults, scoped to that estimate only.
- [ ] **PRESENT-04**: A single pure resolver module is the one place that decides section visibility — no renderer re-implements its own visibility check.
- [ ] **PRESENT-05**: If an estimate has already been sent or viewed by the client, changing its presentation or pricing settings shows a non-blocking inline notice that the client has already seen this estimate.

### Estimate Document Consolidated Pass

- [ ] **DOCUX-01**: A gear icon on the left side of the floating `Photos / Send` pill opens a settings panel — a popover on desktop, a bottom sheet on mobile — exposing the Pricing, Document Sections, and Client Presentation controls from PRESENT-01/03.
- [ ] **DOCUX-02**: The `Bill To` block is editable directly inside the estimate document — hovering/focusing it in edit mode reveals a pencil icon; clicking opens a compact popover to search and switch the linked client, or unlink the current one.
- [ ] **DOCUX-03**: The existing client-picker implementations (`LinkClientInline`, `LinkClientButton`, `LinkClientCard`, and the 4th implementation inside `estimate-document.tsx`) are consolidated into one shared component reused everywhere a client can be linked.
- [ ] **DOCUX-04**: The project name's inline-edit affordance uses a thin solid underline on hover/focus (replacing the dotted/serrated underline) and reconciles with `ProjectTitle`'s validation/error-retry behavior.
- [ ] **DOCUX-05**: A full alignment pass removes accidental spacing/offset inconsistencies across the company header, estimate title band, project/bill-to grid, summary, section headers, and line-item table — verified on desktop and mobile against the same estimate.
- [ ] **DOCUX-06**: The mobile line-item editor visually matches the desktop document-native table language (same density, hierarchy, document surface) instead of a standalone glass card — verified at 360px/390px/430px with no text clipping and no regression to existing touch targets.
- [ ] **DOCUX-07**: Confirmed-dead components (`section-card.tsx`, `item-row.tsx`) are removed as part of this pass.

### Format-First Send Hub & Cross-Surface Settings Rollout

- [ ] **SENDHUB-01**: Clicking `Send` opens a hub organized around three primary formats — Online Estimate (default), PDF, and Plain Text — each exposing its own delivery actions (copy/open/email/SMS/WhatsApp/download as applicable), replacing the channel-first Email/SMS tabs and the separate "Share & Export" menu.
- [ ] **SENDHUB-02**: Sending PDF or Plain Text via SMS/WhatsApp falls back to delivering the Online Estimate link.
- [ ] **SENDHUB-03**: `estimate_deliveries` records both `format` (online_link / pdf / plain_text) and a widened `channel` (adds copy / open / download / manual alongside email / sms / whatsapp).
- [ ] **SENDHUB-04**: The PRESENT-04 settings resolver is wired into every remaining render/format path — classic PDF, modern PDF, classic share, modern share, the plain-text template, and the WhatsApp formatter.
- [ ] **SENDHUB-05**: A cross-surface verification test confirms that, for a single presentation-settings toggle, section visibility is identical across all 6 render/format outputs — not just the editor preview.
- [ ] **SENDHUB-06**: `Mark as Sent` and language selection remain available in the new Send hub as secondary actions, visually subordinate to the three primary format choices.

## v2 Requirements

Deferred to a future milestone. Tracked but not in this roadmap.

- **PRESENTX-01**: Granular per-field visibility inside a section (e.g., hide quantities/unit price while keeping totals) — add only if owners request it after the coarse toggles ship.
- **PRESENTX-02**: Reusable settings presets/templates across estimates (explicitly deferred in SEED-041 itself).
- **DOCUXX-01**: Inline client creation from the Bill To picker (v1 only supports switching to an existing client or unlinking).
- **SENDHUBX-01**: Send hub remembers the owner's last-used format instead of always defaulting to Online Estimate.
- **PUBURLX-01**: Rate limiting on the public estimate route, applying the existing Redis sliding-window infrastructure (SEED-012) — deferred because the ≥10-char base62 CSPRNG suffix already provides ~60 bits of entropy as the primary defense; revisit if abuse is observed.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Building new custom-domain / white-label support | Already shipped via SEED-009 — this milestone only verifies the friendly-URL route stays compatible with it (PUBURL-06), it does not build new domain infrastructure |
| Granular per-field/column visibility (hide qty or unit price alone) | FEATURES.md flags full per-field toggle sprawl as an explicit anti-feature risk; ships coarse section toggles only in v1 |
| Reusable settings presets/templates | Explicitly deferred in SEED-041 itself |
| Inline client creation | Keeps the Bill To picker's v1 scope tight; existing client-management flows still available outside the document |
| New attachment-delivery channels for PDF over SMS/WhatsApp | No infrastructure exists for this today; falls back to the Online Estimate link instead |
| Per-estimate-template-configurable send copy | No new template layer; reuses existing `estimate_template_*` company fields |
| Rate limiting the public estimate route | Token entropy (≥60 bits) is the primary defense for v1; existing Redis rate-limit infra (SEED-012) can be applied later if abuse is observed |

## Traceability

Every v1 requirement maps to exactly one phase. Coverage: 24/24 mapped, 0 orphans, 0 duplicates. Numbering continues the global counter — v4.17 ended at Phase 159, so this milestone starts at **Phase 160**.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PUBURL-01 | Phase 160 — URL Contract & Public Access Security | In progress (Plan 01/05 of 05) |
| PUBURL-02 | Phase 160 — URL Contract & Public Access Security | In progress (Plan 02/05 of 05) |
| PUBURL-03 | Phase 160 — URL Contract & Public Access Security | Complete |
| PUBURL-04 | Phase 160 — URL Contract & Public Access Security | In progress (Plan 01/05 of 05) |
| PUBURL-05 | Phase 160 — URL Contract & Public Access Security | In progress (Plan 02/05 of 05) |
| PUBURL-06 | Phase 160 — URL Contract & Public Access Security | Pending |
| PRESENT-01 | Phase 161 — Presentation Settings Data Model & Persistence | Pending |
| PRESENT-02 | Phase 161 — Presentation Settings Data Model & Persistence | Pending |
| PRESENT-03 | Phase 161 — Presentation Settings Data Model & Persistence | Pending |
| PRESENT-04 | Phase 161 — Presentation Settings Data Model & Persistence | Pending |
| PRESENT-05 | Phase 161 — Presentation Settings Data Model & Persistence | Pending |
| DOCUX-01 | Phase 162 — Estimate Document Consolidated Pass | Pending |
| DOCUX-02 | Phase 162 — Estimate Document Consolidated Pass | Pending |
| DOCUX-03 | Phase 162 — Estimate Document Consolidated Pass | Pending |
| DOCUX-04 | Phase 162 — Estimate Document Consolidated Pass | Pending |
| DOCUX-05 | Phase 162 — Estimate Document Consolidated Pass | Pending |
| DOCUX-06 | Phase 162 — Estimate Document Consolidated Pass | Pending |
| DOCUX-07 | Phase 162 — Estimate Document Consolidated Pass | Pending |
| SENDHUB-01 | Phase 163 — Format-First Send Hub & Cross-Surface Settings Rollout | Pending |
| SENDHUB-02 | Phase 163 — Format-First Send Hub & Cross-Surface Settings Rollout | Pending |
| SENDHUB-03 | Phase 163 — Format-First Send Hub & Cross-Surface Settings Rollout | Pending |
| SENDHUB-04 | Phase 163 — Format-First Send Hub & Cross-Surface Settings Rollout | Pending |
| SENDHUB-05 | Phase 163 — Format-First Send Hub & Cross-Surface Settings Rollout | Pending |
| SENDHUB-06 | Phase 163 — Format-First Send Hub & Cross-Surface Settings Rollout | Pending |

**Phase → requirement rollup:**
- **Phase 160 — URL Contract & Public Access Security**: PUBURL-01, PUBURL-02, PUBURL-03, PUBURL-04, PUBURL-05, PUBURL-06 (file-disjoint from Phase 161; highest-severity pitfall, done first with its own security checkpoint)
- **Phase 161 — Presentation Settings Data Model & Persistence**: PRESENT-01, PRESENT-02, PRESENT-03, PRESENT-04, PRESENT-05 (file-disjoint from Phase 160, can run in parallel; must land before Phase 163 and the settings-UI sub-step of Phase 162)
- **Phase 162 — Estimate Document Consolidated Pass**: DOCUX-01, DOCUX-02, DOCUX-03, DOCUX-04, DOCUX-05, DOCUX-06, DOCUX-07 (internally sequenced 3a client-picker/alignment → 3b settings UI wiring → 3c mobile parity, since 3 of 4 seeds touch the same `estimate-document.tsx`)
- **Phase 163 — Format-First Send Hub & Cross-Surface Settings Rollout**: SENDHUB-01, SENDHUB-02, SENDHUB-03, SENDHUB-04, SENDHUB-05, SENDHUB-06 (depends on Phase 161's settings model and benefits from Phase 160's friendly URLs; closes the settings-drift risk)

---
*Requirements defined: 2026-07-08 — milestone v4.18 Estimate Document & Send Experience Refresh, informed by 4-agent research (STACK/FEATURES/ARCHITECTURE/PITFALLS, see `.planning/research/SUMMARY.md`). Phase numbering continues the global counter — v4.17 ended at Phase 159, so this milestone starts at Phase 160. Roadmap: [.planning/ROADMAP.md](ROADMAP.md).*
