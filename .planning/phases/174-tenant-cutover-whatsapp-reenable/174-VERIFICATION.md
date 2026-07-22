---
phase: 174-tenant-cutover-whatsapp-reenable
verified: 2026-07-21T23:33:00Z
status: passed
score: 3/3 requirements verified (TNT-01, TNT-02, TNT-03)
re_verification: false
human_verification:
  - test: "Admin edits a notification_templates row (e.g. payment.received/in_app) via SQL, then a real event renders the edited copy"
    expected: "The in-app notification shows the admin-edited body, not copy.ts's fallback"
    why_human: "Requires a live Supabase row edit + a real Stripe Connect test webhook — the unit suite proves the WIRING, not a live DB round trip. Documented as an operational gate in 174-VALIDATION.md, not a code gap."
  - test: "Real proactive WhatsApp send after a tenant opts in AND an admin registers a Meta-approved HSM template with a matching variables_schema"
    expected: "Delivery lands on the test device; a param-count mismatch is refused+logged, never garbled"
    why_human: "Requires live Meta WhatsApp Business API approval + an opted-in tenant phone. Explicitly the phase's ROADMAP 'Operational gate' — out of automated reach, not a code gap."
---

# Phase 174: Tenant Notification Cutover & WhatsApp Re-enable — Verification Report

**Phase Goal:** All tenant notifications flow through the DB-template resolver + proactive WhatsApp re-enabled; preference matrix intact.
**Verified:** 2026-07-21T23:33Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Automated Gate Results (run against current HEAD, clean working tree)

| Gate | Command | Result |
| ---- | ------- | ------ |
| Unit suites | `npx vitest run tests/unit/notifications/ tests/unit/inngest/ tests/unit/webhooks/ tests/unit/billing/` | ✓ 105 files, **861 tests passed** |
| Type check | `npx tsc --noEmit -p tsconfig.ci.json` | ✓ exit 0, clean |
| Focused TNT gate | 9 key files (preferences, whatsapp-registry, copy-context, copy-tenant-neutrality, dispatch, template-resolver, email-digest, notification-email-digest, event-sources) | ✓ 9 files, 110 tests passed |

## Goal Achievement — Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | All 18 tenant `notify()` call sites resolve copy through the DB template seam (TNT-01) | ✓ VERIFIED | 18 `notify({` sites across 9 files, 18 matching `copyContext:` fields; grep confirms every other `notify(` occurrence is a comment |
| 2 | Sparse ctx never renders a blank field once DB templates are live (carry-fwd a) | ✓ VERIFIED | `buildFullCopyContext` reproduces all 17 copy.ts `??` defaults; resolver-path oracle (not round-trip) green for 17/17 |
| 3 | Email body never double-escaped; subject never HTML-escaped (carry-fwd b) | ✓ VERIFIED | End-to-end trace: resolver title=`text`, body=`html`; `preEscaped` body-only in renderItem; exactly one escape per field |
| 4 | D-15 lifted; genuine WhatsApp opt-in now reaches dispatch, consent gate intact (TNT-03) | ✓ VERIFIED | `whatsapp=false` override gone from preferences.ts; `whatsapp_opt_in_at` gate remains the sole gate |
| 5 | WhatsApp param-count mismatch refused+logged, never throws (TNT-03) | ✓ VERIFIED | dispatch.ts whatsapp branch: `variables.length !== tpl.expectedVariableCount → console.warn`, skip send, inside try/catch |
| 6 | Preference matrix (in_app/email/sms) semantically unchanged (TNT-02) | ✓ VERIFIED | preferences.test.ts green; only the D-15 line was removed, all other resolution steps byte-identical |

**Score:** 6/6 truths verified · 3/3 requirements (TNT-01, TNT-02, TNT-03)

## Required Artifacts

| Artifact | Provides | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/notifications/copy-context.ts` | `buildFullCopyContext` — exhaustive per-EventType switch | ✓ VERIFIED | 17 cases, NO default (compile-time exhaustive); each `?? default` matches copy.ts verbatim |
| `lib/notifications/dispatch.ts` | Central enrichment + per-channel resolution + WA guard | ✓ VERIFIED | `buildFullCopyContext` applied once (L103-105); email_copy stash (L163-182); sms resolution (L316-328); WA guard (L277-300) |
| `lib/notifications/template-resolver.ts` | Title/subject decoupled to `text` mode | ✓ VERIFIED | L70: `renderTemplate(label, vars, 'text')`; body mode stays channel-driven (L58) |
| `lib/notifications/preferences.ts` | D-15 override removed | ✓ VERIFIED | Only consent gate `if (!userPrefs?.whatsapp_opt_in_at) whatsapp = false` remains (L93); doc history breadcrumb added |
| `lib/notifications/whatsapp-registry.ts` | `expectedVariableCount` on NotificationTemplate | ✓ VERIFIED | DB rows: `Array.isArray(variables_schema) ? .length : 0`; 5 static REGISTRY entries hardcode 2 |
| `lib/email/notification-emails.ts` | `preEscaped` (body-only) | ✓ VERIFIED | L75 `bodyHtml = item.preEscaped ? item.body : escapeHtml(item.body)`; L74 titleHtml unconditional escape |
| `lib/inngest/functions/notification-email-digest.ts` | `buildDigestItem` prefers metadata.email_copy | ✓ VERIFIED | Valid email_copy → subject plain, body preEscaped:true; malformed → row.title/body preEscaped:false, never throws |

## Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| 18 call sites | dispatch.notify | `copyContext: ctx` (same object fed to buildNotificationCopy) | ✓ WIRED |
| dispatch.ts | copy-context.buildFullCopyContext | applied once before any resolution | ✓ WIRED |
| dispatch.ts | template-resolver (in_app/email/sms) | up to 3 per-channel resolveNotificationCopy calls | ✓ WIRED |
| dispatch.ts (email_copy) | digest buildDigestItem | metadata.email_copy {subject,body} | ✓ WIRED |
| dispatch.ts (WA branch) | whatsapp-registry.expectedVariableCount | `variables.length !== tpl.expectedVariableCount` guard | ✓ WIRED |
| preferences.resolveChannels | dispatch WA branch | `channels.whatsapp` can now be true for opted-in tenant | ✓ WIRED |

## Data-Flow / Escaping Trace (carry-forward b, Level 4)

- **Subject:** resolver renders title in `text` (plain) → stashed as `email_copy.subject` → `buildDigestItem` title (preEscaped never applies to title) → `renderItem` `escapeHtml(title)` once for the HTML heading; used RAW as the Resend `subject:` header. **One escape, HTML context only.** ✓
- **Body:** resolver renders body in `html` (pre-escaped by escapeHtmlValue) → `email_copy.body` → `buildDigestItem` body + `preEscaped:true` → `renderItem` uses body AS-IS (no re-escape). **Exactly one escape; `&amp;` never becomes `&amp;amp;`.** ✓
- **SMS / in_app:** resolver renders in `text` mode → unescaped plain text, byte-identical to pre-174. ✓
- **Legacy rows (no email_copy):** `preEscaped:false` → body still `escapeHtml`'d — zero regression. ✓

## Spot-Checks (TNT-01 ctx-field correctness + fallback preservation)

| Call site | eventType | ctx fields | copy.ts expects | title/body preserved |
| --------- | --------- | ---------- | --------------- | -------------------- |
| connect-webhook.ts:152 | payment.received | `{amountUSD, projectName}` | amountUSD, projectName | ✓ `copy.title`/`copy.body` |
| quota.ts:257 | quota.80pct | `{quotaPercent}` | quotaPercent | ✓ |
| estimate/[token]/actions.ts:58 | estimate.viewed | `{estimateNumber, clientName}` | estimateNumber, clientName | ✓ |
| whatsapp/handler.ts:452 | whatsapp.inbound | `{whatsappFrom}` | whatsappFrom | ✓ (dynamic import preserved) |
| admin/billing/actions.ts:150 | admin.bonus_credits_granted | `{credits}` | (none read — static body) | ✓ credits never rendered → CREDITUI-04 neutral |

Every swept site calls `buildNotificationCopy(eventType, ctx)` on the SAME `ctx` object also passed as `copyContext`, and keeps `title: copy.title`/`body: copy.body`. **Zero behavior change when no DB template row exists.**

## Carry-Forward (a) Oracle Quality

- Oracle renders `EVENT_TEMPLATE_SEED[e].body/.title` through `renderTemplate(..., 'text')` using `buildFullCopyContext(e, {})` as vars — the actual production render path, **not** a tautological round-trip through `buildNotificationCopy`. ✓
- Covers 17/17 EventTypes (explicit literal array). ✓
- Whitespace exception scoped to exactly 2 events (`estimate.viewed`, `estimate.expired`) via `normalizeWhitespaceArtifact`; documented in copy-context.ts header, the test, and deferred-items.md. **Provably non-masking:** a genuinely-missing default produces a missing WORD (e.g. 'A client'/'a project'), which survives whitespace normalization as a real mismatch — the normalizer only tolerates stray/doubled interior spaces, a pre-existing template-seed.ts artifact (Phase 172, out of scope). ✓

## Content Integrity at HEAD (cross-commit attribution noise)

- Working tree clean → HEAD == verified content. All 13 SUMMARY-referenced commits present.
- **174-04 Task-1 content (dispatch.ts, template-resolver.ts) confirmed present at HEAD** despite landing under the 177-01-prefixed commit `cef9ced8` (git-index race documented in 174-04-SUMMARY). The attribution anomaly does not affect code content — all claimed changes are live and correct.
- 174-02's f5a0490e (unstage-sibling correction) and 174-03's clean D-15 deletion both verified in the working files.

## Anti-Patterns

None blocking. No TODO/FIXME/placeholder in the 174 production files. The `credits` field flowing into `admin.bonus_credits_granted`'s copyContext is intentionally never rendered (copy.ts + seed have no `{{credits}}` token; copy-tenant-neutrality.test.ts green) — not a leak.

## Human Verification (operational gates — non-blocking, pre-documented in ROADMAP/VALIDATION)

1. **Live admin template edit → rendered copy** — needs live Supabase edit + real Stripe test webhook.
2. **Live proactive WhatsApp send** — needs Meta HSM approval + opted-in tenant phone. Stale opt-in count verified **0 in prod** per 174-03 SUMMARY, so lifting D-15 has zero immediate live-send effect today.

## Gaps Summary

None. All three requirements (TNT-01, TNT-02, TNT-03) are satisfied in code and proven by 861 passing tests + a clean CI type check. Both carry-forwards (a sparse-ctx, b email double-escape) are closed and load-bearing. The two human items are pre-planned operational gates, not implementation gaps.

---

_Verified: 2026-07-21T23:33Z_
_Verifier: Claude (gsd-verifier)_
