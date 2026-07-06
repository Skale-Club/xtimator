# Requirements: Xtimator — Milestone v4.17 Admin Polish & Credit UX Compliance

**Defined:** 2026-07-06
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** Fix a real regression against a locked v4.15 decision (tenant Plans page still leaks raw credit numbers in 3 places), then polish the super-admin experience — clearer nav with a new grouping, two owner-flagged bad names fixed, a credit-model-centric admin Billing page, and a "Premium Xtimator" glassmorphism visual redesign of the v4.16 Inbox.

> **Locked decisions (non-negotiable):**
> - **No new backend/ledger logic.** 100% reuse of the existing credit-ledger, `billing_config`, and cost-aggregation functions shipped in v4.7 (Phases 110-116) and v4.15 (Phases 150-153). This milestone is UI/UX polish + a compliance bugfix, not new billing logic.
> - **Credit-leak fix ships first, independent of everything else.** It repairs an already-violated locked decision (CREDITUI-04 from v4.15: tenants must NEVER see a raw credit count or $ figure anywhere) — treated as the highest-priority item.
> - **User-facing renames only; internal naming stays put** (mirrors the established WhatsApp→Inbox precedent from v4.16): Legal Pages' public routes (`/privacy-policy`, `/terms-of-service`) and the `legal_pages` DB table are untouched — only the admin nav label + `/admin/legal` route rename. Support Mode's internal functions (`startSupportSession`, `getSupportModeSession`, `endSupportSession`), audit-log action literals (`company.support_mode_start`/`company.support_mode_end`), cookie name (`support_mode_session`), and file names are untouched — only user-facing copy changes.
> - **"Content" sidebar group is new UI work.** Today's admin nav (`components/admin/admin-nav.tsx`) is a flat unordered list with zero grouping/section-header pattern anywhere in the codebase — this milestone builds that pattern, not just reorders items within an existing one.
> - **Inbox redesign reuses Xtimator's own Phase-71 glass tokens/components** (`--glass-*` CSS vars, `Card variant="glass"`, the `Avatar`/`AvatarFallback` primitives) — not a literal Xphere clone. A deterministic name→color initials-avatar utility needs to be built (none exists; the only precedent, `admin-list.tsx`, uses plain gray initials for all users).
> - **Autonomous overnight execution.** Run per the standing no-checkpoint-interruptions preference. Where the owner was unreachable for a subjective naming call (Support Mode → "View as Company", Message → "Message Template"), the AI made the best-judgment call and documented the rationale in the phase CONTEXT docs and PROJECT.md.

## v1 Requirements

Each requirement maps to exactly one roadmap phase.

### Tenant Credit UX Compliance Fix

- [x] **CREDITFIX-01**: The tenant `/settings/billing` (Plans) page never renders a raw credit count anywhere — fixes 3 confirmed violations: `TopUpPackCard`'s "≈ X credits" subtext, `AutoTopupDialog`'s pack-picker `SelectItem` showing "(≈X credits)", and `CreditHistoryList`'s per-row credit deltas (e.g. "+2,000"). Only the existing % bar + qualitative low/critical states may communicate usage.
- [x] **CREDITFIX-02**: The topbar `CreditChip` renders an actual visible progress-bar element (reusing the existing `components/ui/progress.tsx` primitive with the same color-escalation as `UsageProgressBar`), not just "`X% used`" as plain text.
- [x] **CREDITFIX-03**: The Plans page's tier feature/price content (`TierCardsGrid`'s hardcoded `TIERS` array) is reconciled against `billing_config` reality — either sourced from config where the config already holds the value (prices), or verified accurate and documented as intentionally-static where the config has no equivalent field (feature bullet lists), so nothing stale/contradictory ships.

### Admin Nav Reorganization

- [ ] **NAV-01**: The super-admin sidebar shows Dashboard, Companies, Inbox as the first three items, in that order.
- [ ] **NAV-02**: A new "Content" group (a new sectioned-nav UI pattern) visually contains Landing Page, Pages, Blog, SEO, Branding under a group header, distinct from the ungrouped items.
- [ ] **NAV-03**: The nav item "Legal Pages" is renamed to "Pages", and its route slug changes from `/admin/legal` to `/admin/pages` — every hardcoded reference (nav entry, `revalidatePath` calls, any internal links) is retargeted; public routes (`/privacy-policy`, `/terms-of-service`) and the `legal_pages` DB table are untouched.

### Naming Fixes

- [x] **NAMING-01**: The tenant Settings sidebar item "Message" is renamed to "Message Template" (matching the page's own internal card title); the page `<h1>` and `metadata.title` are updated to match. Route (`/settings/estimate-templates`) stays unchanged.
- [x] **NAMING-02**: The super-admin "Support Mode" feature is renamed to "View as Company" in every user-facing string — the Companies-list row action button, the persistent banner shown during an active session, the exit button, and both error toasts. Internal function names, audit-log action literals, the session cookie name, and file names are unchanged.

### Admin Billing Page Overhaul

- [ ] **BILLADMIN-01**: The admin `/admin/billing` page's primary view is credit-model-centric per company — credit balance, real AI cost, and effective markup (reusing `getCompanyCostOverview`/`aggregateAiCostByOperation`) — replacing the current tier/MRR-first presentation.
- [ ] **BILLADMIN-02**: Force-tier and grant-credits remain available as secondary admin actions on the same page (not removed, just no longer the visual focus).
- [ ] **BILLADMIN-03**: The platform-wide summary card reflects real aggregated credit/cost data (via the no-arg `aggregateAiCostByOperation()` mode) instead of the current hardcoded `proCount*29 + bizCount*99` MRR calculation.

### Inbox Visual Redesign ("Premium Xtimator")

- [ ] **INBOX-05**: Conversation list rows display a deterministic-color initials avatar per contact (same contact/name always renders the same color).
- [ ] **INBOX-06**: List rows and the thread pane use the existing Phase-71 glass design system (`--glass-*` tokens / `Card variant="glass"`) instead of the current flat `bg-muted`/plain-border treatment.
- [ ] **INBOX-07**: The unread state is visually rich — a colored accent bar and/or dot — replacing the current plain outline-`Badge` count as the only unread signal.
- [ ] **INBOX-08**: The Inbox Settings sub-page (`/admin/inbox/settings`, Accounts + Templates tables) receives the same glass-surface visual treatment for consistency with the redesigned main Inbox.

## v2 Requirements

Deferred to a future milestone. Tracked but not in this roadmap.

- **BILLADMIN-04**: Historical revenue/MRR trend charting (time-series), once the credit-model view above ships and proves useful.
- **INBOXX-04**: Extend the new avatar/glass row treatment to any future multi-channel Inbox surfaces (Instagram/SMS), once INBOXX-02 (from v4.16's deferred list) is scheduled.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New credit ledger logic, new billing_config fields, new DB columns | Locked — this milestone is UI/UX polish + a compliance bugfix, reusing 100% of existing v4.7/v4.15 billing infrastructure |
| Merging the "Message Template" page into `/settings/estimates` | Research found this raises the blast radius (5+ files, a longer compound settings page) for a purely cosmetic naming complaint; a label-only rename addresses the owner's stated issue ("the name makes no sense") with minimal risk |
| Renaming `legal_pages` DB table, `/privacy-policy`, `/terms-of-service` public routes | Only the admin surface's label/slug was flagged; the public/legal pages are a distinct, unrelated concern (mirrors how Inbox's rename kept `whatsapp_*` untouched) |
| Real-time Inbox updates, reply/send, contact-info panel | Already deferred to INBOXX-01/02/03 in v4.16; unrelated to this milestone's visual-only Inbox scope |
| Historical MRR/revenue trend charts on the new Billing page | Deferred to v2 (BILLADMIN-04) — this milestone ships the current-state credit view first |

## Traceability

Every v1 requirement maps to exactly one phase. Coverage: 15/15 mapped, 0 orphans, 0 duplicates. Numbering continues the global counter (v4.16 ended at Phase 155 → this milestone starts at Phase 156).

| Requirement | Phase | Status |
|-------------|-------|--------|
| CREDITFIX-01 | Phase 156 — Tenant Credit UX Compliance Fix | Complete |
| CREDITFIX-02 | Phase 156 — Tenant Credit UX Compliance Fix | Complete |
| CREDITFIX-03 | Phase 156 — Tenant Credit UX Compliance Fix | Complete |
| NAV-01 | Phase 157 — Admin Nav Reorg & Naming Fixes | Pending |
| NAV-02 | Phase 157 — Admin Nav Reorg & Naming Fixes | Pending |
| NAV-03 | Phase 157 — Admin Nav Reorg & Naming Fixes | Pending |
| NAMING-01 | Phase 157 — Admin Nav Reorg & Naming Fixes | Complete |
| NAMING-02 | Phase 157 — Admin Nav Reorg & Naming Fixes | Complete |
| BILLADMIN-01 | Phase 158 — Admin Billing Page Credit-Model Overhaul | Pending |
| BILLADMIN-02 | Phase 158 — Admin Billing Page Credit-Model Overhaul | Pending |
| BILLADMIN-03 | Phase 158 — Admin Billing Page Credit-Model Overhaul | Pending |
| INBOX-05 | Phase 159 — Inbox Visual Redesign | Pending |
| INBOX-06 | Phase 159 — Inbox Visual Redesign | Pending |
| INBOX-07 | Phase 159 — Inbox Visual Redesign | Pending |
| INBOX-08 | Phase 159 — Inbox Visual Redesign | Pending |

**Phase → requirement rollup:**
- **Phase 156 — Tenant Credit UX Compliance Fix**: CREDITFIX-01, CREDITFIX-02, CREDITFIX-03
- **Phase 157 — Admin Nav Reorg & Naming Fixes**: NAV-01, NAV-02, NAV-03, NAMING-01, NAMING-02
- **Phase 158 — Admin Billing Page Credit-Model Overhaul**: BILLADMIN-01, BILLADMIN-02, BILLADMIN-03
- **Phase 159 — Inbox Visual Redesign**: INBOX-05, INBOX-06, INBOX-07, INBOX-08

---
*Requirements defined: 2026-07-06 — milestone v4.17 Admin Polish & Credit UX Compliance. Phase numbering continues the global counter — v4.16 ended at Phase 155, so this milestone starts at Phase 156.*
