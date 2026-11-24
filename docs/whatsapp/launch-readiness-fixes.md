# WhatsApp launch corrections — 2026-11-23

This is the implementation follow-up to XTM-124 (`docs/audits/2026-11-23-whatsapp-production-readiness.md`). Corrections are prepared on `codex/whatsapp-launch-readiness`. Production activation and real provider acceptance are still pending. Do not interpret local test success as a completed launch.

## Corrected boundaries

| Audit | Implementation |
| --- | --- |
| WA-01 | Webhook-only template status mutation moved out of the Server Action module into `server-only` code. Actual admin actions retain explicit authorization. |
| WA-02 | One service-only authority resolver checks active company/sender, enabled account, current verified phone and membership/ownership. Membership removal revokes linked phones transactionally. Explicit phone-only grants and suspension reasons prevent accidental authority restoration. Delayed workers check the captured actor again. |
| WA-03 | Signed raw deliveries commit to a service-only inbox before HTTP 200. Database errors return 503. Leases and minute recovery retain pending work after queue/process failures; proven inbox retries do not consume the owner's admission quotas again. Terminal intent failures have an owner fallback. |
| WA-04 | Inbound messages form immutable durable batches; a concurrent arrival stays queued. The compatibility Redis claim uses one Lua operation. Captured routing survives a failed completion checkpoint. |
| WA-05 | Unknown intent/classifier failure preserves the draft and gives a localized retry/clarification response. CREATE keeps the previous draft until its replacement is ready. |
| WA-06 | Commands claim the current company/phone/session/actor in SQL. Customer channel reservations precede provider calls; uncertain outcomes require review. Cancel closes the session and preserves the project. Regeneration stages a new version before atomic activation. A captured confirmation ID cannot approve a later customer-message draft. |
| WA-07 | Direct grand-total writes are disabled. The owner can edit numbered line prices or use the app. Item edits use the shared totals engine and commit dependent amounts with a content-version check. |
| WA-08 | Admin activation readiness shows missing destination, welcome and approved exact event/language bindings. Template copy is prepared in `templates.md`; production values and approvals have not been changed. |
| WA-09 | Admin import/check synchronizes actual approved Meta names, languages and supported components/variables. Runtime requires approved event bindings. |
| WA-10 | Account provisioning saves the database-supported formats; sender activation records the appropriate verification or explicit administrator grant. |
| WA-11 | Inbox status embedding, sender phone scope, inclusive validated dates, visible errors and selected-thread refresh are corrected. |
| WA-12 | Paid notification jobs recheck current recipient authority and consent; stable delivery claims distinguish safe retryable rejections from uncertain provider results. |
| WA-13 | Consent writes surface failures and enable the categories promised by onboarding. Settings expose opt-out; the dashboard CTA requires a linked verified phone. Welcome steps checkpoint independently and uncertain sends require reconciliation. Missing videos use honest localized guidance. |
| WA-14 | All changes/items are processed independently; failed items leave the delivery pending without blocking successful messages. Missing phone identity is handled safely without inventing ownership. WABA/phone destination checks reject signed events belonging to another integration. |

## Database rollout

Five migrations are additive and must precede the new runtime, in this order:

1. `20261123140000_whatsapp_durable_ingress.sql`
2. `20261123141000_whatsapp_authority.sql`
3. `20261123142000_whatsapp_command_safety.sql`
4. `20261123143000_whatsapp_welcome_progress.sql`
5. `20261123144000_whatsapp_command_table_grants.sql`

All five were applied and read back on the existing Supabase development project on November 23. The check verified RLS and revoked browser grants on seven tables and service-only execution on six RPCs. A transaction-rolled-back probe verified exclusive webhook claiming and stable batch/route recovery without enqueuing or sending anything. The real database check exposed inherited default browser grants on the command tables; the fifth migration removes them in addition to deny-all RLS.

Inspect `npm run db:migrate` without `--apply` before each future target. Use `--only=<filename> --apply` for these reviewed files; do not accidentally apply unrelated pending migrations. Production application requires the owner's explicit release authorization and a database backup. Migrations are never run by deploy.

The authority migration intentionally suspends ambiguous historical phone-only grants and previously revoked linked senders. Review those rows in Admin → Inbox → Settings → Accounts, and confirm a deliberate administrator grant where warranted. It does not silently treat a deleted linked account as a phone-only administrator grant. Inbound confirmation capture also checks the signed message time against session and estimate creation/content-update times, so a delayed reply cannot acquire a newly created or regenerated draft.

Older queued jobs without captured sender identity fail closed. Do not retrofit them with the current actor: review failed work and send a fresh owner message after rollout.

## Release and activation

1. Apply the reviewed migrations and read back schema/functions, service-only grants/RLS, and any suspended legacy rows. Preserve the database backup and previous image SHA.
2. Release through GitHub Actions → GHCR → Coolify. Verify the exact SHA at `/api/health`, successful Inngest resync and registration of `whatsapp-webhook-ingress`, `whatsapp-ingress-batch` and `whatsapp-ingress-recovery` alongside process/intent jobs. A deployment alone does not apply SQL.
3. Follow `docs/whatsapp/templates.md`: public display number, exact Meta destination IDs, three language variants, approved welcome quick reply, owner update and event bindings. Review Meta's category decision; the copy requests UTILITY, approval is not guaranteed.
4. Use the admin readiness panel to confirm all intended languages and events. Inspect number registration/subscription operationally; the earlier `EXPIRED` metadata field alone was not treated as proof of a sending outage.
5. Repeat unsigned/forged Meta and Twilio webhook checks, expecting 401 and no effects. Then use an explicitly authorized owner-controlled phone for a real signed event and the acceptance flow below. No customer contact is authorized by this document.

## Acceptance still required

- Google onboarding with and without a phone; verified phone link, opt-in/out and category controls; initial template and exact quick reply; interrupted welcome reconciliation.
- Text, audio, photo and mixed bursts on iOS Safari and Android Chrome; additional details on the same project; classifier/generation failure preserves the previous estimate.
- Separate SEND/CANCEL, double SEND, stale-session rejection, removal/suspension/phone-change with queued work, and a replay after a completion-checkpoint failure.
- Numbered item edits with taxes/discount/deposit: editor width view, page preview, public share and PDF must show the same values. No renderer was changed in this patch.
- Authorized email/SMS delivery once per channel; ambiguous provider response never auto-resends; quiet hours/consent/suppression still apply.
- Outside-window approved notification in each intended language; delivery/read/failure callbacks; messaging cost/credit settlement and measured provider charges.
- Queue outage, expired lease recovery, backlog alert and seven-day payload clearing. Message-ID tombstones are retained for deduplication.

## Operational recovery

`whatsapp_webhook_inbox` and `whatsapp_ingress_batches` expose state, attempts, next attempt and lease time. The recovery job republishes pending/expired work every minute and alerts operations for a sustained backlog. Do not delete message IDs or manufacture a different batch key to force a retry.

An uncertain customer delivery remains reserved; inspect provider history and estimate deliveries before manually sending from the app. Do not clear a reservation solely because a response was lost. An interrupted notification is likewise `needs_review`. Welcome reconciliation is available in the account admin panel after the lease expires, using confirmed sent/unsent evidence.

Raw accepted webhook content and completed batch message content clear after seven days. Existing conversation retention remains separate.

## Rollback

Before public activation, stop inbound/product effects and preserve pending rows if rollback is needed. Reverting only the application image restores the older unsafe behavior; it is not a safe public-launch fallback. Prefer fixing forward with outbound effects disabled. Additive SQL can remain while the image is rolled back for diagnosis; do not drop queue/claim tables or clear uncertain delivery reservations. Recheck Inngest registration after every image change.

## Evidence

| Check | Result |
| --- | --- |
| Application scoped typecheck (`tsconfig.ci.json`) | Passed on the final source |
| Changed production-source ESLint | 66 files, zero errors; two existing unused-parameter warnings |
| Last safety follow-up | Five files, 109 tests passed (timestamp/confirmation identity, SQL privileges and command safety) |
| Last ingress follow-up | Two files, 25 tests passed (durable retries, independent events and admission counters) |
| Existing development database | Five reviewed migrations applied/read back; seven table protections and six RPC grants passed; claim/route recovery transaction rolled back |
| Full unit/eval suite | 1,017 files: 10,572 tests passed initially; 86 failures were stale query-mock chains. After correcting only those mocks, all 12 affected files passed (97 tests). Seven skips and five TODOs remain as declared by the suite. |
| Advisory whole-repository typecheck | 42 errors in unrelated test fixtures; no WhatsApp, notification, admin or agent-tool errors |

The 86 failures all came from fixtures that supported exactly two chained filters; the current-estimate read now also checks the company. Their mock builders now support fluent filtering, with fixture data, production filters, assertions and quality thresholds preserved. The full run and its focused rerun together cover every initially collected file; the subsequent safety/recovery follow-ups cover the last code changes. A fresh full CI run is still required on the integrated release commit.

SQL regression tests execute the new migrations in PGlite, and the existing development database was also verified as described above. A production Next.js build and live provider/device acceptance, production SQL, template approval and release remain explicit separate steps. Journal: [XTM-127](https://app.notion.com/p/422b7a68612181e58204d12abe0f030f).

Timing: initial relevant suites took 396 seconds; the full unit/eval run took about 31 minutes with two workers on this desktop. The failed-file rerun took 32 seconds. The implementation and verification task finished within the original 90-minute estimate; the owner-facing delivery records the actual finish time.

Primary references checked for this change: [Meta webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview), [Meta templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview), [Inngest concurrency](https://www.inngest.com/docs/durable-execution/flow-control/concurrency), [Next.js data security](https://nextjs.org/docs/app/guides/data-security).
