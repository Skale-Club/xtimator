---
phase: quick-260705-c1y-telegram-ops-alerting-system
verified: 2026-07-05T00:00:00Z
status: passed
score: 13/13 must-haves verified
re_verification: null
human_verification:
  - test: "Configure a real bot token + chat_id in /admin/integrations → Platform Alerts, click Send test alert"
    expected: "A Telegram message '✅ Xtimator ops alerts connected...' arrives in the configured chat; the button surfaces any credential error inline"
    why_human: "Requires a live Telegram bot + network; cannot exercise the real Telegram API from static analysis"
  - test: "With Telegram unconfigured, force a terminal Inngest failure (generate/transcribe/vision) or a cron 500"
    expected: "Pipeline/cron behavior is byte-identical to before (tenant notify still fires, 500 still returned); no Telegram send, no throw from notifyOps"
    why_human: "Requires triggering a real terminal failure against the running worker/cron; dormancy + never-throw are proven in unit tests but not in a live run"
---

# Phase quick-260705-c1y: Telegram Ops-Alerting System Verification Report

**Phase Goal:** A platform-OWNER ops-alerting channel that sends SYSTEM-HEALTH events to the operator via Telegram. Dormant until the owner configures a bot token + chat_id in the admin panel. Never breaks any pipeline. All user-facing strings in English. Separate from (does not touch) the per-tenant notification system.

**Verified:** 2026-07-05
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Super-admin can store an encrypted Telegram bot token via the admin panel | ✓ VERIFIED | `saveIntegrationKey` accepts `provider:'telegram'` (schema enum lib/schemas/admin.ts:24); token encrypted via `encrypt()`, only ciphertext/iv/auth_tag persisted (actions.ts:43-58) |
| 2 | Super-admin can store a chat_id in `platform_integrations.telegram` metadata, preserving the encrypted token | ✓ VERIFIED | `saveTelegramChatId` reads existing `ciphertext/iv/auth_tag`, upserts `metadata:{...existing, chat_id}` with `onConflict:'provider'` (actions.ts:429-475) — mirrors saveTwilioFromPhone exactly |
| 3 | `sendTelegramMessage` posts to the Telegram sendMessage API and throws `[Telegram] not configured` when either credential is missing | ✓ VERIFIED | client.ts:17-36 — `getTelegramConfig()` null → throw; else POST `bot${token}/sendMessage` with `{chat_id, text, parse_mode:'HTML'}`; throws on non-2xx with body |
| 4 | `getTelegramConfig` returns null unless BOTH token AND chat_id resolve (DORMANT) | ✓ VERIFIED | platform-config.ts:370-386 — `if(!botToken) return null`; then reads metadata.chat_id; `if(!chatId) return null`; returns `{botToken, chatId}` only when both present |
| 5 | Super-admin can click "Send test alert" and get a confirming message, with credential errors surfaced inline | ✓ VERIFIED | `sendTelegramTestAlert` (actions.ts:485-513) awaits `sendTelegramMessage`, catches + returns `{ok:false, message}`; wired to `TestButton` (telegram-chat-id-form.tsx:62). The ONE place a Telegram error surfaces to the user |
| 6 | `notifyOps` fans out to BOTH Sentry and Telegram and NEVER throws | ✓ VERIFIED | ops-alert.ts:45-86 — whole body in outer try/catch; independent inner try/catch around `Sentry.captureMessage` and `await sendTelegramMessage`; belt-and-suspenders comment |
| 7 | `notifyOps` dedupes via Redis SETNX with a suppress window and fails open when Redis is unavailable | ✓ VERIFIED | ops-alert.ts:48-62 — `redis.set(ops:key, ts, {nx:true, ex:window})`; `if(!ok) return` (suppress); `getRedis()→null` skips dedupe; inner catch fails open |
| 8 | AI silent-fallback routes through `notifyOps` (warning normally, error on 402/401/billing/auth) instead of Sentry directly | ✓ VERIFIED | with-fallback.ts:109-126 — `reportSilentFallback` now calls `void notifyOps({kind:'ai_fallback', severity: billingOrAuth?'error':'warning', dedupeKey:...':billing'})`; no direct `Sentry` import/call remains in the file |
| 9 | Every existing `callWithFallback` contract remains intact (.cause=primary, fallbackCause, both-fail marker, primary-once, invalid-output rethrow) | ✓ VERIFIED | with-fallback.ts:128-164 unchanged — InvalidEstimateOutputError rethrown before fallback (141-146); `.cause`=primaryErr, `fallbackCause`=fallbackErr, `ProvidersUnavailableError` thrown on both-fail (159-161). Tests assert all (with-fallback.test.ts:87-111) |
| 10 | Estimate/transcription/vision terminal failures fire additive `notifyOps` alongside untouched tenant `notify()` | ✓ VERIFIED | generate-estimate.ts:86-93 (kind `estimate_generation_failed`, after intact notify at 71-81); analyze-photos.ts:99-106 (`vision_failed`, after notify 84-94); transcribe-audio.ts:91-98 (`transcription_failed`) |
| 11 | Transcribe fires `notifyOps` BEFORE its `if(!companyId) return` early return | ✓ VERIFIED | transcribe-audio.ts — notifyOps at 91-98, `if(!companyId) return` at 100, tenant `notify()` at 105-114. Company-less failures still alert ops |
| 12 | Both cron routes fire `notifyOps` before every 500 return; auth/success paths unchanged | ✓ VERIFIED | cleanup-orphan-projects/route.ts:21-28 (rpc-error) + 34-41 (catch); cleanup-whatsapp-sessions/route.ts:27-34 (query-error) + 67-74 (catch). 503/401/200 paths untouched |
| 13 | Config is a `provider='telegram'` platform_integrations row — NO new migration | ✓ VERIFIED | No migration file in the 3-plan diff (git diff cac133b7~1..b5428198). Token = encrypted row via existing upsert path; chat_id in existing `metadata` jsonb column |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/telegram/client.ts` | server-only `sendTelegramMessage`, dormant-safe, throws when unconfigured | ✓ VERIFIED | `import 'server-only'`; 36 lines; throws `[Telegram] not configured`; token never logged |
| `lib/observability/ops-alert.ts` | never-throw `notifyOps` fan-out + `formatOpsMessage` | ✓ VERIFIED | `import 'server-only'`; dedupe→Sentry→Telegram, all swallowed; HTML-escaped format |
| `lib/platform-config.ts` | `getTelegramConfig` + `'telegram'` in `IntegrationProvider` union | ✓ VERIFIED | union member telegram (64); `getTelegramConfig` (370); env fallback `TELEGRAM_API_KEY` dev-only |
| `lib/schemas/admin.ts` | `'telegram'` in `integrationKeySchema` enum | ✓ VERIFIED | enum member `'telegram'` (24) |
| `app/admin/integrations/actions.ts` | `saveTelegramChatId` + `sendTelegramTestAlert` | ✓ VERIFIED | both present, requireAdmin FIRST, numeric chat_id validation, audit-logged |
| `lib/admin/integrations-providers.ts` | Platform Alerts category + telegram card | ✓ VERIFIED | `ops-alerts`/`Platform Alerts` category with `showTelegramConfig:true` + telegram provider card |
| `app/admin/integrations/telegram-chat-id-form.tsx` | chat_id form + Send test alert button | ✓ VERIFIED | client component; Save via saveTelegramChatId; TestButton via sendTelegramTestAlert |
| `lib/ai/with-fallback.ts` | `reportSilentFallback` delegating to notifyOps; contracts intact | ✓ VERIFIED | routes through notifyOps; all callWithFallback contracts byte-identical |
| 3× Inngest onFailure handlers | additive `void notifyOps` alongside tenant notify | ✓ VERIFIED | generate-estimate, transcribe-audio, analyze-photos |
| 2× cron routes | `void notifyOps` in error + catch paths before 500 | ✓ VERIFIED | cleanup-orphan-projects, cleanup-whatsapp-sessions |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| actions.ts saveIntegrationKey | schemas/admin.ts enum | `'telegram'` in provider enum | ✓ WIRED | Without it the bot-token safeParse would fail; present at line 24 |
| lib/telegram/client.ts | lib/platform-config.ts getTelegramConfig | reads token+chat_id, dormant when null | ✓ WIRED | client.ts:2,18 |
| lib/observability/ops-alert.ts | lib/telegram/client.ts sendTelegramMessage | await inside swallow-wrapped try/catch | ✓ WIRED | ops-alert.ts:4,79 |
| lib/ai/with-fallback.ts reportSilentFallback | ops-alert.ts notifyOps | `void notifyOps({kind:'ai_fallback',...})` | ✓ WIRED | with-fallback.ts:18,115 |
| generate-estimate.ts onFailure | ops-alert.ts notifyOps | `void notifyOps` alongside notify() | ✓ WIRED | generate-estimate.ts:20,86 |
| app/api/cron/*/route.ts error+catch | ops-alert.ts notifyOps | `void notifyOps({kind:'cron_failed'})` before 500 | ✓ WIRED | both routes, both paths |

### Behavioral Spot-Checks

Independently confirmed by the requester (not re-run here): tsc clean; tests/unit/telegram + observability + ai + admin + inngest = 382/382 pass; full suite 2847 pass with only pre-existing parallel-only flakes.

| Behavior | Evidence | Status |
| -------- | -------- | ------ |
| sendTelegramMessage posts correct URL/body, throws on dormant + non-2xx | tests/unit/telegram/client.test.ts (placeholder token `000000000:TEST_PLACEHOLDER_TOKEN`) | ✓ PASS |
| notifyOps fan-out / dedupe / fail-open / never-throw | tests/unit/observability/ops-alert.test.ts | ✓ PASS |
| reportSilentFallback → notifyOps severity/dedupe + all callWithFallback contracts | tests/unit/ai/with-fallback.test.ts (asserts .cause, fallbackCause, providerUnavailable, both-fail) | ✓ PASS |
| generate-estimate onFailure fires notifyOps additively AND still calls notify() | tests/unit/inngest/generate-estimate-job.test.ts (kind estimate_generation_failed, dedupeKey gen_fail:c1) | ✓ PASS |
| saveTelegramChatId preserves token, validates numeric, gates on requireAdmin | tests/unit/admin/telegram-chat-id-save.test.ts | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ---------- | ------ | -------- |
| TELEGRAM-CONFIG | 01 | ✓ SATISFIED | getTelegramConfig + telegram provider/enum |
| TELEGRAM-CLIENT | 01 | ✓ SATISFIED | server-only sendTelegramMessage |
| TELEGRAM-ADMIN-UI | 01 | ✓ SATISFIED | Platform Alerts category + chat_id form + test button |
| NOTIFY-OPS-FANOUT | 02 | ✓ SATISFIED | notifyOps never-throw fan-out |
| AI-FALLBACK-ROUTED | 02 | ✓ SATISFIED | reportSilentFallback → notifyOps |
| WIRE-INNGEST-FAILURES | 03 | ✓ SATISFIED | 3 onFailure handlers additively wired |
| WIRE-CRON-FAILURES | 03 | ✓ SATISFIED | both cron routes wired (error + catch) |

### Data-Flow Trace (Level 4)

The chat_id form's `current` prop flows from a live DB read: `integration-category-content.tsx:85-94` queries `platform_integrations` metadata for `provider='telegram'` when `showTelegramConfig` and passes the real value. Not a hardcoded empty prop. Alert data flows from real error strings at each event source (Inngest `error`, cron `error.message`, primary AI error) into `notifyOps` → `formatOpsMessage` → the Telegram HTML body. FLOWING.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TODO/FIXME/PLACEHOLDER/stub in any Telegram/ops-alert file | — | None |
| — | — | No hardcoded bot token or `\d+:token` secret pattern anywhere in lib/app/tests | — | None (tests use `000000000:TEST_PLACEHOLDER_TOKEN`) |

Note: the intentional empty `catch {}` blocks in ops-alert.ts and reportSilentFallback are the never-throw contract, not stubs — each is documented and each downstream failure is swallowed independently by design.

### Separation & Non-Regression (Critical Check 7)

- `lib/notifications/*` — UNTOUCHED (no telegram/notifyOps/ops-alert references; not in the diff).
- `components/workspace/send/*` — UNTOUCHED (no references; not in the diff).
- Every wiring point is `void notifyOps(...)` fire-and-forget; no existing `notify(...)` or response line was removed or reordered — confirmed by reading each handler and the full file-list diff (cac133b7~1..b5428198).

### Human Verification Required

1. **Live test-alert round trip** — configure a real bot token + chat_id, click Send test alert; a message should arrive in Telegram (needs a live bot + network).
2. **Live dormancy + never-throw** — with Telegram unconfigured, trigger a terminal Inngest failure or cron 500 and confirm pipeline/cron behavior is unchanged and nothing throws (needs a running worker/cron). Both are proven at unit level; the live run is a belt-and-suspenders confirmation.

### Gaps Summary

No gaps. All 13 observable truths, all 10 artifacts, and all 6 key links verify against the actual code. The 8 critical checks (dormancy, never-throw, additivity, with-fallback contracts, no-migration, English strings, untouched tenant/send modules, no hardcoded secrets) all pass. Status is `passed`; two live-environment confirmations are listed as human-verification belt-and-suspenders, not blockers.

---

_Verified: 2026-07-05_
_Verifier: Claude (gsd-verifier)_
