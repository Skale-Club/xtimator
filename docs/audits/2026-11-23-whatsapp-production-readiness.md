# WhatsApp production readiness audit — 2026-11-23

**Verdict: not ready for a public launch that promises a reliable WhatsApp assistant.** The signed Meta webhook and the core happy paths exist, but authorization revocation, durable ingestion, draft safety and production activation have release-blocking gaps.

Reviewed application HEAD `55ec4ce082ec33f2ed2af995ec37c8941d539d28`, with an existing payment-readiness working tree on `fix/payment-launch-readiness`. Existing payment edits were preserved. Production health reported the same HEAD. This is an investigation: no application source was changed, no migration or deployment ran, and no WhatsApp, SMS or email was sent. Production checks used configuration/data/provider GETs and deliberately invalid webhook signatures. Secrets stayed in process memory and are not included here.

## Scope and actual product contract

The integration uses **Meta Cloud API directly**. Twilio is used for SMS, including the final delivery of estimates to customers; it is not the WhatsApp transport. One shared platform WhatsApp number serves authorized business owners/team members. Customer inbound messages are logged to the admin inbox and intentionally do not reach the owner agent. The tenant `/whatsapp` page is intentionally disabled.

Reviewed boundaries: onboarding and verified-phone linking; company/sender registry and suspension; HMAC verification and webhook routing; deduplication, Redis buffering and Inngest jobs; audio/photo normalization and estimate generation; confirmation/edit/cancel/regenerate/send tools; email/SMS customer delivery; owner notification preferences, 24-hour window and templates; admin account/template/inbox controls; messaging costs; deployment resync configuration. PDF generation uses the shared renderer; no PDF renderer change was made.

## Confirmed production observations

Observed on November 23, approximately 20:49–20:56 America/New_York. These are a configuration snapshot, not an end-to-end delivery certification.

| Boundary | Observation |
| --- | --- |
| App health | HTTP 200; database, storage and auth OK; commit `55ec4ce0` |
| Meta inbound signature | Unsigned and forged-signature POSTs both returned HTTP 401 `Unauthorized` |
| Twilio inbound signature | Unsigned and forged-signature form POSTs both returned HTTP 401 `Unauthorized` |
| Required runtime configuration | Meta app secret and verify token, Inngest event/signing keys, encryption key and data JWT secret present; values not exposed |
| Meta transport | Encrypted platform token, phone-number ID and WABA ID present; production uses Graph `v21.0` |
| Click-to-chat destination | `metadata.display_number` absent and `META_WHATSAPP_DISPLAY_NUMBER` absent in runtime environment |
| Welcome activation | No configured welcome template names or video URLs for any language |
| Local notification template registry | Zero rows |
| Meta approved templates | Only `hello_world` and `thank_you_visit`, both `en_US`; no `owner_estimate_update`, `owner_billing_alert` or `owner_update` |
| Sender registry | Three active company configurations and three active senders; all three senders have no `verified_at`; none currently has a missing company membership/ownership mapping |
| Phone metadata | `quality_rating=GREEN`, `platform_type=CLOUD_API`, `code_verification_status=EXPIRED`; this field alone does not prove the number cannot send |
| WABA app subscriptions | Four subscribed apps returned; correct app subscription and actual inbound invocation still require a real signed event |
| Messaging cost evidence | Zero WhatsApp rows in `messaging_cost_events`; no basis to certify live pricing/delivery accounting from that table |
| Admin inbox status filter | Exact current query returned HTTP 400, `PGRST108`: the configuration relation is not embedded |
| Inngest inspection | Anonymous GET `/api/inngest` returned 401; no resync or invocation was triggered, and Cloud function registration was not independently certified |

## Findings requiring correction before opening the affected flow

P1 means a reachable authorization, loss, destructive-write or core delivery problem that should be resolved before broad WhatsApp launch. P2 means a concrete operational/product defect or secondary failure path. None of the failure characterizations establishes that a real customer has already been affected.

### WA-01 — P1 — Template status mutation has a second, unauthenticated entry point

References: `lib/actions/admin-whatsapp-templates.ts:1`, `:345`; `app/api/webhooks/whatsapp/route.ts:135`.

`applyTemplateStatusUpdate` is exported from a file marked `'use server'`. It directly updates the service-role-only template registry without checking a user or signature. The HMAC check on the webhook does not protect independent Server Action invocation. The local compiled server-reference manifest includes this action for the admin settings page. A diagnostic test made `requireAdmin` reject and still obtained a successful status mutation because it was never called.

Next.js explicitly requires authorization at exported action boundaries; an admin layout is not that boundary. See [Next.js data security](https://nextjs.org/docs/app/guides/data-security). Production HTTP exploitation was not attempted.

Required outcome: move the webhook-only mutator into a non-action `server-only` module, called only after verification; retain explicit authorization on actual admin actions. Verify the mutator disappears from the action manifest and reject unauthenticated action attempts.

### WA-02 — P1 — Removing or suspending access does not reliably revoke bot authority

References: `lib/actions/team.ts:278`; `lib/whatsapp/account-registry.ts:122`; `lib/whatsapp/sender-link.ts:125`, `:137`; `lib/actions/admin-whatsapp-accounts.ts:435`, `:503`; `app/api/webhooks/whatsapp/route.ts:249`.

Three related authorization failures exist:

- Removing a company member deletes only `company_members`. Their active sender row remains. Inbound resolution reads that row without checking current membership or account status and grants the owner-agent route. A diagnostic fake with no membership and a different actual owner still resolved the removed user.
- Admin suspension/removal changes a sender's status but leaves `created_by_admin=false` for automatically linked phones. Lazy linking treats that row as reusable and reactivates it on the next inbound message. Reproduced.
- An active sender is accepted even when its company WhatsApp configuration is suspended. Existing/reusable sender paths return before the configuration check. Reproduced for an existing sender; the webhook itself has no corresponding company-config check.

Required outcome: validate current sender/company/account authority at ingestion and queued execution. Revoke linked senders when membership ends; distinguish an explicit admin suspension from automatic phone-change housekeeping. Test removed member, disabled account, sender suspension, company suspension and a queued event after revocation. Preserve deliberate admin-authorized phone-only identities through an explicit rule.

### WA-03 — P1 — HTTP acknowledgement and deduplication can permanently lose inbound work

References: `app/api/webhooks/whatsapp/route.ts:118`, `:156`, `:175`, `:329`; `lib/whatsapp/handler.ts:611`; `lib/inngest/functions/whatsapp-process.ts:153`.

The route returns HTTP 200 before `after()` has written an inbox row or accepted a durable queue event. A restart in that window loses the message. After processing starts, `whatsapp_processed_messages` is inserted before downstream work, but a failed dispatch does not release or recover the claim. A redelivery is treated as complete. A test observed HTTP 200 before any service-client use; another forced dispatch failure and confirmed the second delivery never reached processing.

Status/template events are also acknowledged before best-effort updates. Status update failures are swallowed, so delivery ticks and cost settlement can remain missing without provider retry. The `whatsapp-intent` job lacks the exhausted-retry fallback that exists on `whatsapp-process`, so a failed query/edit/confirmation can still end in silence.

Required outcome: durably accept each provider event before acknowledgement, with recoverable pending/processing/completed/failed state, stable IDs and a replay/recovery path. Inngest transport failure must remain recoverable. Both jobs need explicit terminal-failure handling. A fast ACK is compatible with durable acceptance; it does not require inline AI.

### WA-04 — P1 — The audio/photo debounce has a destructive Redis race

References: `lib/whatsapp/buffer.ts:89`, `:111`; `lib/whatsapp/handler.ts:272`; `app/api/webhooks/whatsapp/route.ts:175`.

Claiming is `LRANGE`, a local latest-ID check, then a separate `DEL`. Contrary to the comment, the claim is not wrapped in a transaction or Lua operation. If message B is pushed after A reads the list and before A deletes it, A processes its old snapshot and deletes B. B's worker finds no buffer, while its webhook was already acknowledged and deduplicated. A controlled interleaving reproduced exactly this loss.

Separately, messages delivered together in one webhook are awaited sequentially through the five-second debounce. They cannot join the same buffer window and may become separate jobs instead of one audio/photo estimate.

Required outcome: atomically compare-and-claim the batch using a Redis script or durable batching equivalent; persist/queue the claimed content before destructive removal. Enqueue the complete webhook batch before waiting. Test a push during claim, claim failure, restart after claim and multiple messages in one delivery.

### WA-05 — P1 — A classifier outage can delete the estimate the owner meant to send

References: `lib/whatsapp/intent-router.ts:517`, `:578`; `lib/whatsapp/confirm-actions.ts:194`.

Classifier failure defaults to `CREATE`. With a pending session, CREATE calls `actionCancel`, which deletes the entire draft project, before creating anything new. Reproduced with the owner's text `send it` and a temporary classifier outage: cancellation ran and the confirmation path did not. Unrecognized classifier output reaches the same destructive default.

Required outcome: preserve the pending draft on unknown intent/provider failure, send a retry/clarification reply and make discard an explicit action. A new-job request should not destroy a recoverable previous draft before the replacement is safely accepted.

### WA-06 — P1 — Confirmation commands use stale snapshots and are not safe to replay

References: `lib/whatsapp/handler.ts:431`; `lib/inngest/functions/whatsapp-process.ts:161`, `:177`; `lib/whatsapp/confirm-actions.ts:94`, `:178`, `:194`, `:329`.

The queued intent contains a session snapshot. `actionSend` does not re-read or atomically claim that session; two commands with distinct message IDs can both send it. A test called the real action twice with the same snapshot after its session deletion and observed two client-delivery calls. Function idempotency by inbound message does not deduplicate separate `send` messages. A concurrent `cancel` still has the old project ID and can delete a now-sent, unsigned project.

The whole agent, tools and final reply share one retried `route-intent` step. If customer delivery succeeds and the later owner reply fails, retry can replay the customer-facing operation. Inngest recommends idempotency for external effects within retried steps; see [steps and primitives](https://www.inngest.com/docs/durable-execution/primitives).

Regeneration has another destructive window: `actionRegenerate` deletes the current estimate before calling generation. A failed model/gate/persistence attempt leaves no old estimate to recover, despite the shared generation service supporting version persistence.

Required outcome: validate and atomically claim the current, tenant/phone-bound session at execution; use a persistent logical send operation and channel-specific delivery identity; guard cancel against stale/sent/answered state. Create a replacement version before superseding the previous estimate. Test double-send, send/cancel races, provider success followed by reply failure and failed regeneration.

### WA-07 — P1 — Changing the total bypasses the authoritative totals model

References: `lib/whatsapp/agent-tools.ts:91`; `lib/whatsapp/confirm-actions.ts:248`; `components/workspace/estimate/estimate-document.tsx:1356`, `:1398`; `components/pdf/shared/pdf-totals-block.tsx`.

`update_total` writes only `estimates.total`. It does not adjust line prices, subtotal, taxes, discount, balance due or project total. A diagnostic estimate with a $190 line sum became total $2,000 while its balance due, subtotal and project total remained $190. Document renderers consume these persisted fields, so one estimate can show inconsistent amounts and payment breakdowns. A subsequent item edit recomputes from the unchanged lines and can erase the requested total.

Required outcome: represent the owner's price change through the same totals engine as the editor, with an explicit discount/adjustment or reviewed line redistribution. Persist dependent amounts atomically. Verify the editor, width/page previews, public share page and PDF with the same changed estimate.

### WA-08 — P1 — Production activation does not support the advertised onboarding/notification flow

References: `lib/platform-config.ts:661`, `:718`; `lib/whatsapp/welcome-card.ts:10`; `lib/whatsapp/welcome-template.ts:77`; `lib/notifications/whatsapp-registry.ts:65`.

Live reads confirmed no display number in either admin metadata or runtime environment, so the onboarding WhatsApp link resolves to null. No welcome template is configured, so the post-signup first message is deliberately skipped. There are no local notification templates, and Meta has neither the default owner templates nor a configured welcome template. Outside the 24-hour window, mapped notifications cannot use the required approved templates. This is a verified configuration gap; it is not a claim that every inbound reply is broken.

Required outcome: configure and read back the platform destination, approve the intended templates and exact language/parameter variants, map them to events, configure welcome content and then run a real owner-controlled onboarding-to-estimate flow. Videos currently use a text placeholder and can remain deferred if the product promise is adjusted. The phone's `EXPIRED` verification field needs an operational check; no re-registration was attempted.

## Additional confirmed defects and follow-ups

### WA-09 — P2 — Template authoring does not complete runtime event mapping

References: `components/admin/whatsapp-templates-panel.tsx:93`; `lib/actions/admin-whatsapp-templates.ts:120`, `:241`, `:360`; `lib/notifications/whatsapp-registry.ts:143`.

The composer saves `event_category`, while runtime resolution requires an exact `event_type`; newly authored rows keep that field null and cannot override event routing. Manually registering a preapproved external template also leaves no Meta ID: manual status lookup refuses it, and a normal status webhook with a Meta ID never falls back to name when the ID lookup misses. Add explicit event binding and an authenticated reconciliation/import workflow for approved templates. Validate language and variable count against the actual Meta template, not just a local draft.

### WA-10 — P2 — Admin provisioning/reactivation disagrees with its own schema

References: `lib/actions/admin-whatsapp-accounts.ts:67`, `:143`, `:346`, `:428`; `supabase/migrations/20260627000001_whatsapp_admin_registry_expand.sql:12`; `app/admin/inbox/settings/admin-whatsapp-accounts.tsx:156`.

The config action defaults to `interactive` and validates `text/interactive/template`, but the database accepts `share_link/formatted_text/pdf_attachment`. The visible account panel does not expose the save/provisioning flow. Admin-created senders start active without `verified_at`, yet the reactivation action requires that timestamp, so suspend/reactivate is not a complete lifecycle. All three currently active production senders have this missing timestamp. Align the supported format/product model and implement a complete, auditable admin authorization lifecycle.

### WA-11 — P2 — Inbox filtering and refresh can hide real conversations

References: `lib/queries/admin-whatsapp.ts:53`, `:101`, `:114`, `:139`; `app/admin/inbox/admin-whatsapp-filters.tsx:59`; `app/admin/inbox/admin-whatsapp-client.tsx:58`.

The status filter references a relation absent from the select and silently converts query errors into an empty inbox; production returned `PGRST108`. Sender filtering selects only the sender's company and therefore includes other contacts in that company. A date-only `dateTo` becomes midnight and omits the rest of the selected day; invalid dates can throw at `toISOString`. Refresh reloads the list, but the open thread effect depends only on selected ID and keeps its old messages. Correct the relational filter, phone/thread scope, inclusive date semantics, error state and selected-thread refresh.

### WA-12 — P2 — Queued owner notifications do not recheck current recipient or consent

References: `lib/notifications/dispatch.ts:300`; `lib/inngest/functions/notification-channel-send.ts:38`.

Notification dispatch records the then-current phone and user in the event. The worker trusts `data.to` after only the demo guard; it does not re-resolve sender, current membership, company suspension or notification preferences. A delayed event can send financial/estimate text to a phone that was removed or changed after enqueue, or after opt-out. Recheck authority and consent at execution, and stop retries for revoked destinations. Transient provider failures currently resolve as completed `{ok:false}` jobs, so distinguish recoverable failure from permanent rejection.

### WA-13 — P2 — Onboarding opt-in and welcome recovery are incomplete

References: `lib/actions/whatsapp-consent.ts:25`; `lib/notifications/preferences.ts:170`; `lib/notifications/event-types.ts:103`; `components/settings/notifications-form.tsx:288`; `lib/whatsapp/send-welcome.ts:119`; `app/(app)/dashboard/page.tsx:66`.

- Preference-write errors are swallowed, but the consent action reports success. No welcome is then sent, with no actionable error for the owner.
- The onboarding text promises estimates/updates, but the timestamp alone does not enable any notification category; all WhatsApp categories default false and the settings form does not expose them. Decide the intended opt-in behavior and implement matching controls/copy.
- Google onboarding can omit a phone, yet the welcome-card decision does not require a successful phone link. Once a destination is configured, an unlinked owner can follow the CTA and receive the unknown-sender signup pointer.
- First-contact welcome claims the company once before three sends. A failed first/second send leaves the claim and skips the remaining sequence forever. Use recoverable per-step delivery state. The initial template sender releases its claim on failure, but that does not repair this separate sequence.

### WA-14 — P2 — A batched payload can silently discard unrelated event types

References: `app/api/webhooks/whatsapp/route.ts:118`, `:133`; `lib/whatsapp/types.ts:65`.

Any status found anywhere causes an early return for the entire payload; a template change does the same and only the first template change is selected. A diagnostic payload containing a status change and an inbound message applied the status and never processed the inbound message. Iterate all changes independently after signature verification.

The inbound code also assumes `message.from` always exists and calls `.slice` immediately. Current Meta documentation describes username/BSUID messages with no phone number. Add validated payload handling and a safe unsupported-identity path before upgrading; do not infer phone ownership from an unrelated profile field. See [Meta messages webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages). Actual production behavior for such users was not tested.

## Tests and evidence

All tests ran sequentially with `--maxWorkers=1`; no additional development server, browser automation, Docker or full build was started because the machine had approximately 1.5 GB free RAM.

| Test scope | Result | Duration |
| --- | --- | --- |
| `tests/unit/whatsapp`, Twilio inbound, messaging cost and messaging debit | 63 files, 661 tests passed | 220.68 s |
| Admin templates/composer/filters; notification WhatsApp registry/channel, owner phone, preferences, customer delivery, confirmation and send gate | 11 files, 199 tests passed | 32.70 s |
| Admin account actions, Inngest WhatsApp job, notification dispatch/event types | 4 files, 56 tests passed | 14.96 s |
| Temporary failure-characterization probes | 7 files, 11 selected probes passed; 110 unrelated cases skipped | 36.45 s |

**916 existing tests passed; 11 diagnostic probes reproduced the stated unsafe behavior.** Passing diagnostic probes means the defect was reproduced, not corrected. One initial diagnostic run had a mock-history isolation mistake; it was corrected and all 11 probes passed on the final run. Temporary probes/scripts were removed after recording this evidence; no vulnerability-accepting test was added to the permanent suite.

Diagnostic cases: ACK before service-client work; failed dispatch suppresses redelivery; mixed status/inbound drop; Redis push between read/delete loss; classifier failure cancels pending draft; automatic sender suspension reversal; suspended company bypass; removed-member resolution; repeated stale-session send; total/balance divergence; template status mutation without admin authorization.

Existing tests provide substantial happy-path coverage but frequently mock service queries, Meta, queues and agents independently. Some tests exercise simplified confirmation agents or assert source tokens. They do not certify cross-boundary recovery, real provider delivery, current-role revocation or document amount parity. No live model call, real provider message, browser/device flow, full typecheck or full application suite ran for this documentation-only audit.

## Positive controls observed

- Meta HMAC checks the raw request body with constant-time comparison and fails closed without a secret; Twilio validates the canonical public URL and signed form fields. Production rejected the four invalid requests.
- Customer inbound routes stop before the owner AI/tool path. Query/manage tools bind the trusted company in closures rather than accepting tenant IDs from the model.
- Media policy centralizes supported/ignored types and size checks; audio container normalization is shared.
- The normal estimate creation path checks entitlement and credits before creating a draft; unreadable balance has dedicated fail-closed coverage. Existing payment-readiness changes were not re-audited here.
- Customer delivery goes through the shared email/SMS send gate, with consent/suppression/quiet-hour controls and no bot-number WhatsApp delivery to customers.
- Owner sends have a 24-hour/template fallback abstraction; messaging has stable message/attempt IDs and a retry-aware hourly debit mechanism. Those controls still depend on durable provider event acceptance and validated production rates.
- Deployment configuration explicitly resyncs Inngest after the new production SHA appears. Successful registration/invocation of this exact deployed app still needs operational evidence.

## Recommended delivery order and launch acceptance

1. **Close authority gaps:** remove the public template mutator, make revocation/suspension authoritative and revalidate delayed jobs. Demonstrate that removed/suspended identities cannot read or mutate through WhatsApp.
2. **Make inbound and commands recoverable:** durable inbox before ACK, atomic batching, current-session claims, idempotent send operations, non-destructive fallback/regeneration and consistent totals. Simulate queue/Redis/DB outages and process restarts, including failure after a provider success.
3. **Finish admin and production activation:** correct template event bindings and provisioning, configure the platform number and approved languages/templates, fix inbox visibility, decide notification opt-in behavior and validate messaging rates.
4. **Run an owner-controlled end-to-end acceptance:** new Google account with/without phone; explicit opt-in; first contact; text/audio/photo burst; vague job follow-up; edit total/item/client; send once by email/SMS; cancel/regenerate failure; phone change/removal/suspension; notification after 24 hours; delivery/read/failure status; credit accounting. Verify changed estimate amounts on editor/page preview/share/PDF. Include iOS and Android.

The API's default Graph `v21.0` remains supported today but is listed to expire on January 21, 2027. Schedule a tested upgrade and review identity/payload changes before that date; it is not an already-expired API incident. Source: [Meta Graph API versions](https://developers.facebook.com/docs/graph-api/changelog/versions).

The independent commercial launch gate for measured AI costs/credit calibration remains in force. This audit did not activate paid effects, approve a release, or change production configuration.
