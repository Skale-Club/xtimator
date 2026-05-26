---
phase: 81
slug: add-whatsapp-send-option-in-sendtab-and-integrations-setting
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-26
---

# Phase 81 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) + jsdom + @testing-library/react (existing) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/whatsapp` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~60 seconds (per RESEARCH.md) |

---

## Sampling Rate

- **After every task commit:** Run quick command for the touched area
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Every Wave 1 task has a real `<automated>` verify command. Wave 0 task 81-01-02 is `[BLOCKING]` human verification (supabase db push); other Wave 0 tasks ship RED scaffolds (it.todo) that Wave 1 flips to GREEN.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 81-01-01 | 01 | 0 | WA-SEND-06 | T-81-05, T-81-07 | Migration extends channel + provider CHECK; types/database.types.ts manually patched (Phase 19/24 convention); no secrets in SQL | structural (grep) | `node -e "...migration content check..."` (see plan 81-01 task 1 verify) | ❌ W0 → ✅ after task | ⬜ pending |
| 81-01-02 | 01 | 0 | WA-SEND-06 | T-81-05 | `[BLOCKING]` supabase db push + smoke INSERT (channel='whatsapp', provider='meta'); automated post-push smoke = pg_constraint grep for 'whatsapp' AND 'meta' | checkpoint:human-action + automated post-check | `npx supabase db remote query --query "...pg_get_constraintdef..." | grep -q "whatsapp"` (full command in plan 81-01 Task 2 `<verify>`) | manual + automated post-check | ⬜ pending |
| 81-01-03 | 01 | 0 | WA-SEND-01..06 + WA-INT-01..02 | — | RED scaffolds (it.todo) so Wave 1 has named test cases to flip GREEN | unit (scaffold) | `npx vitest run tests/unit/whatsapp/send-route.test.ts tests/unit/whatsapp/send-form-tab.test.tsx tests/unit/whatsapp/integrations-page.test.tsx tests/unit/whatsapp/entitlement-gate.test.ts` | ❌ W0 → todos pending | ⬜ pending |
| 81-02-01 | 02 | 1 | WA-SEND-03, WA-SEND-04, WA-SEND-05 | T-81-01, T-81-02, T-81-03, T-81-06, T-81-07 | Auth + E.164 + consolidated + entitlement 402 + status 409 + delivery_format branching + PDF fallback surfaced via `fallback: 'share_link'` + sanitized error_message | unit (route handler) | `npx vitest run tests/unit/whatsapp/send-route.test.ts` | ❌ W0 → ✅ after task | ⬜ pending |
| 81-02-02 | 02 | 1 | WA-SEND-05 | T-81-06 | Entitlement gate formula verified via route 402/409 paths across all 7 tier+status combos | unit | `npx vitest run tests/unit/whatsapp/send-route.test.ts tests/unit/whatsapp/entitlement-gate.test.ts` | ❌ W0 → ✅ after task | ⬜ pending |
| 81-03-01 | 03 | 1 | WA-SEND-02 | T-81-06 (defense-in-depth) | `whatsappSendEnabled` resolved server-side as `getEntitlements(tier).whatsappEnabled && company_whatsapp.status === 'active'`; prop threaded through 3 component layers; no client-side gate computation | typecheck | `npx tsc --noEmit` | source files exist | ⬜ pending |
| 81-03-02 | 03 | 1 | WA-SEND-01 | T-81-02 (mitigate) | WhatsApp tab hidden entirely when prop false (not disabled); MessageCircle (not MessageSquare); fetch POST to send-whatsapp; success toast distinguishes happy path from PDF fallback (Locked Decision 2) | unit (RTL) | `npx vitest run tests/unit/whatsapp/send-form-tab.test.tsx` | ❌ W0 → ✅ after task | ⬜ pending |
| 81-03-03 | 03 | 1 | WA-INT-01, WA-INT-02 | T-81-07 | Page is server component; only safe fields fetched (no token); WhatsAppConnectCard mounted unchanged; new header copy from UI-SPEC | unit (RTL) | `npx vitest run tests/unit/whatsapp/integrations-page.test.tsx` | ❌ W0 → ✅ after task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Per RESEARCH.md Validation Architecture. Wave 0 lays migration + test stubs so Wave 1 has somewhere to land.

- [ ] `supabase/migrations/20260526000001_phase81_whatsapp_delivery_channel.sql` — extend `estimate_deliveries.channel` CHECK to include `'whatsapp'` and `provider` CHECK to include `'meta'` (DROP + ADD, mirroring Phase 53 pattern)
- [ ] `[BLOCKING]` `supabase db push` applied to dev DB + smoke INSERT (channel='whatsapp', provider='meta') succeeds
- [ ] `types/database.types.ts` manually patched (Phase 19/24 Docker-on-Windows convention)
- [ ] `tests/unit/whatsapp/send-route.test.ts` — `it.todo` stubs (12 cases) for the new `/api/estimates/[id]/send-whatsapp` route (HTTP 200/400/401/402/409 paths, branch-by-delivery_format, PDF fallback path, delivery/activity log)
- [ ] `tests/unit/whatsapp/send-form-tab.test.tsx` — `it.todo` stubs (9 cases) for the new WhatsApp tab in `SendForm` (hidden when entitlement off, MessageCircle icon, tab order, E.164 validation, submit wiring, toast wording incl. fallback)
- [ ] `tests/unit/whatsapp/integrations-page.test.tsx` — `it.todo` stubs (5 cases) for the new Integrations page mounting `WhatsAppConnectCard`
- [ ] `tests/unit/whatsapp/entitlement-gate.test.ts` — `it.todo` stubs (7 cases) for `getEntitlements(tier).whatsappEnabled && company_whatsapp.status === 'active'` formula across the 7 tier+status combos

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `[BLOCKING]` supabase db push | WA-SEND-06 | `supabase db push` may require interactive auth and cannot be suppressed reliably in CI; must be run by the executor with `SUPABASE_ACCESS_TOKEN` set | See plan 81-01 task 2 `<how-to-verify>` — push then smoke INSERT via Supabase MCP execute_sql |
| End-to-end Meta delivery | WA-SEND-03..06 | Cannot stub the real Meta Cloud API in CI; requires sandbox phone number and a real network call | 1. Ensure `META_WHATSAPP_ACCESS_TOKEN` + `META_WHATSAPP_PHONE_NUMBER_ID` set in `.env.local` (placeholders only — never commit). 2. Open a consolidated estimate in dev. 3. WhatsApp tab → fill recipient → Send. 4. Verify message arrives on the test phone. 5. Verify `estimate_deliveries` row inserted with `channel='whatsapp'`, `provider='meta'`, `status='sent'`. |
| PDF→share_link fallback wiring (real failure path) | WA-SEND-04 (Locked Decision 2) | Requires forcing PDF generation failure to confirm the API returns `fallback: 'share_link'` and the toast renders `"PDF indisponível — enviamos o link"` | Temporarily break `generateAndUploadEstimatePDF` (e.g., revoke storage creds in dev or set `delivery_format='pdf_attachment'` then null out the `pdfs` bucket policy) → send WhatsApp → confirm toast wording and JSON response shape. Restore creds after. |
| Tab order at 360px viewport with PT-BR active | WA-SEND-01 (Pitfall 8) | shadcn Tabs overflow behavior depends on rendered string widths; PT/ES translations may differ | Open the Send tab on a 360px viewport with `?lang=pt` → verify Email · SMS · WhatsApp all visible and horizontally scrollable if needed; verify the tab order is Email, SMS, WhatsApp (not reordered by i18n). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has either an automated verify or a `[BLOCKING]` checkpoint)
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending UAT exit
