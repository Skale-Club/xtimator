# Separate Telegram Leads and Ops destinations

Every product has a dedicated sales group: **Xtimator | Leads**, **Xphere | Leads**, **Xpot | Leads** and **Xprout | Leads**. Ops groups receive technical alerts only. A shared bot token does not authorize mixing prospects and operational diagnostics.

## Xtimator configuration

The existing encrypted `platform_integrations` row with `provider = 'telegram'` holds the shared bot token. Preserve its encryption fields and technical destination `metadata.chat_id`. Configure the dedicated **Xtimator | Leads** group in `metadata.leads_chat_id` without replacing the rest of the metadata. No additional bot token or secret is required.

`leads_chat_id` must be a negative numeric group ID, stored as a string, and must differ from the trimmed Ops `chat_id`. Missing, invalid or identical Leads configuration returns no destination; no Telegram message is sent and there is no Ops fallback. The existing admin action for saving `chat_id` continues to manage Ops only; it is not a Leads configuration action. Production metadata changes require the owner's authorization and verification of the bot's membership and destination group.

`getTelegramConfig()` and `sendTelegramMessage(text)` retain the default Ops destination. Explicit `'leads'` selection uses `leads_chat_id` with the same encrypted bot token. `notifyOps` routes only `tenant_signup` to Leads; technical kinds continue using Ops. Existing event toggles, Redis deduplication, Sentry reporting and non-blocking failure handling remain in place.

This change separates the existing new-company signup notification. It does not add abandoned-draft notifications, a retry outbox, automatic account approval, a Telegram webhook or a group creation/binding API. A disabled signup toggle or failed/unconfigured Leads sender remains non-blocking and does not gain a new retry mechanism.

## Verification

Focused regression coverage is in `tests/unit/platform-config.test.ts`, `tests/unit/telegram/client.test.ts` and `tests/unit/observability/ops-alert.test.ts`. Cases cover separate destinations with the same encrypted token, unavailable/invalid/shared Leads configuration, no fallback or network send, signup routing, unchanged technical routing and non-blocking failures. Execution results belong in the task report and Journal; this document does not claim live production delivery or configured groups.
