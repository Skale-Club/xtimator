---
phase: 81
slug: add-whatsapp-send-option-in-sendtab-and-integrations-setting
status: draft
nyquist_compliant: false
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

> Filled by planner. Every task that ships executable code MUST appear here with an `<automated>` verify command. Wave 0 (stubs + migration) MAY use `❌ W0` for files that don't yet exist.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 81-XX-XX | XX | X | REQ-XX | T-81-XX / — | (planner fills) | unit / integration / e2e | `(planner fills)` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Per RESEARCH.md Validation Architecture. Wave 0 lays migration + test stubs so Wave 1 has somewhere to land.

- [ ] `supabase/migrations/2026XXXXXX_phase81_whatsapp_channel.sql` — extend `estimate_deliveries.channel` CHECK to include `'whatsapp'` and `provider` CHECK to include `'meta'` (DROP + ADD, mirroring Phase 53 pattern)
- [ ] `tests/unit/whatsapp/send-route.test.ts` — stubs for the new `/api/estimates/[id]/send-whatsapp` route (HTTP 200/402/409 paths, PDF fallback path)
- [ ] `tests/unit/whatsapp/send-form-tab.test.tsx` — stubs for the new WhatsApp tab in `SendForm` (hidden when entitlement off, schema validation, submit wiring)
- [ ] `tests/unit/whatsapp/entitlement-gate.test.ts` — stubs for server-side entitlement + status gate (whatsappEnabled + company_whatsapp.status === 'active')

*If existing test files already cover one of these, the planner should reference the existing file instead of creating a new one.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end Meta delivery | REQ-TBD | Cannot stub the real Meta WhatsApp API in CI; requires sandbox phone number and real network call | 1. Set `META_WHATSAPP_PHONE_NUMBER_ID` + `META_WHATSAPP_ACCESS_TOKEN` in `.env.local` (placeholders only — never commit). 2. Open an estimate in dev. 3. WhatsApp tab → fill recipient → Send. 4. Verify message arrives on the test phone. 5. Verify `estimate_deliveries` row inserted with channel='whatsapp', provider='meta', status='sent'. |
| PDF→share_link fallback toast copy | REQ-TBD | Requires forcing PDF generation failure to confirm the API returns `fallback: 'share_link'` and the toast renders "PDF indisponível — enviamos o link" | Temporarily break `generateAndUploadEstimatePDF` (e.g., revoke storage creds in dev) → send WhatsApp → confirm toast wording and API response shape. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
