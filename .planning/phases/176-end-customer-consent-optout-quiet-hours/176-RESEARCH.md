# Phase 176: End-Customer Consent, Opt-Out & Quiet Hours - Research

**Researched:** 2026-07-21
**Domain:** TCPA/carrier compliance engineering (Twilio Advanced Opt-Out, Toll-Free/A2P 10DLC registration, consent recordkeeping, quiet-hours enforcement) for end-customer SMS in a multi-tenant SaaS
**Confidence:** MEDIUM overall — HIGH on Twilio API mechanics (verified against current official Twilio docs), MEDIUM on TCPA/state-law specifics (WebSearch-synthesized, not a law firm opinion), LOW-MEDIUM on the multi-tenant ISV registration model (thin official docs, high stakes — flagged as an operational decision)

## OPERATIONAL DECISIONS (require owner/legal sign-off — not silently resolved)

These need an explicit human decision before or during planning. None of them block writing Phase 176's *schema and gate logic* (which is number/registration-agnostic by design — see Schema Recommendation), but several block Phase 177's actual go-live and one changes how conservatively Phase 176's quiet-hours default should be set.

1. **Multi-tenant sender registration model (NEW FINDING — changes Phase 177's assumption).** Twilio's own ISV guidance states Toll-Free Verification and A2P 10DLC "Brand" registration must represent **the actual business interacting with the customer** — i.e., each tenant's own business name/info — not the ISV's (Xtimator's) info. That means a single platform-wide "dedicated Messaging Service" sending on behalf of many unrelated tenant business names in the message body (`{{business_name}} via Xtimator`) does not cleanly fit Twilio's documented single-registration model. The compliant ISV pattern is: Xtimator registers a **Primary Customer Profile** for itself, then a **Secondary Customer Profile + Brand (10DLC)** or **individually verified Toll-Free number** *per tenant*, using Twilio's **Compliance Embeddable** (a hosted form Twilio provides specifically so ISVs can collect each end-customer's own compliance info at onboarding) — or accept the compliance/carrier-filtering risk of a shared identity. **Decide:** per-tenant registration (higher setup cost/effort that scales with tenant count, but carrier-compliant) vs. a single shared registration (fast, cheap, but real risk of carrier rejection or suspension once traffic mixes many unrelated business names under one verified identity — this is exactly the kind of mismatch Twilio's own content-review process is built to catch). This decision belongs to Phase 177 but should be made before Phase 176 ships, because it determines whether any *tenant-scoped* Twilio config needs to exist — it does **not** change Phase 176's schema (see Schema section: suppression is keyed by phone number, not by sender/Messaging Service, so it is unaffected either way).
2. **Consent basis for existing `clients` rows.** For client records that already exist in the database before this phase ships (created via the tenant's normal workflow, phone number captured incidentally when the tenant added a client — not through an explicit "text me updates" opt-in flow), decide: (a) treat the tenant's own pre-existing business relationship + on-file phone number as sufficient "prior express consent" for transactional/estimate-related texts (no new opt-in UI required, but consent provenance is recorded as `'implied_business_relationship'` rather than `'affirmative_opt_in'`), or (b) require every tenant to actively re-confirm/capture consent per client before the first send. This is a materially different legal risk posture and changes whether CUST-03's consent columns can be backfilled automatically or need a UI-driven capture flow. Flagged in Pitfall 10 and STACK.md as unresolved; research can describe the mechanics but not make this call.
3. **Quiet-hours policy: blanket conservative window vs. state-by-state table.** Recommend ONE platform-wide 8am–8pm recipient-local window (see Quiet Hours section) to satisfy CUST-04's "platform-wide guard" wording with the lowest compliance risk and zero state-table maintenance burden. This trades ~1-2 hours of evening reach against materially simpler, more defensible enforcement. Confirm this trade-off is acceptable, or explicitly request a state-variable table (higher legal/maintenance risk of using a stale or incomplete state list — the list of stricter states below is WebSearch-derived, not independently verified against each state's current statute).
4. **STOP-synonym matching scope.** The FCC's 2024 "any reasonable means" rule (effective by April 2025) means consumers can revoke consent via natural-language replies, not just the keyword "STOP" — but only a fixed set of words (stop, quit, end, revoke, opt out, cancel, unsubscribe, and locale variants) are a *per se* reasonable means; everything else requires a "totality of the circumstances" judgment call. Recommend: auto-suppress on the enumerated keyword list only (case-insensitive, punctuation-stripped exact/near-match), and log-but-don't-auto-suppress any other inbound reply for manual review, rather than attempting NLP-style intent detection. Confirm this scope is acceptable — the alternative (broader automated matching) has a different false-positive/false-negative risk profile that's a policy call, not a pure engineering one.
5. **Registered-sender cost/timeline** for Phase 177's actual number (Toll-Free ~in-house review, commonly faster; 10DLC externally carrier-vetted, commonly 1-2+ weeks and ongoing per-campaign carrier fees) is a spending decision already flagged in the roadmap's Phase 177 operational gate — reconfirmed here because Phase 176's own STOP-webhook cannot be *end-to-end* verified against a real Twilio suppression list until a real number/Messaging Service exists in at least a Twilio test project. Phase 176 can and should ship fully unit-tested against a stubbed/mocked inbound payload without waiting on this.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CUST-03 | End-customer contact records carry consent/suppression state; STOP is honored (Twilio Advanced Opt-Out + a suppression check before EVERY send), and a suppressed recipient can never be messaged by any path — manual or agentic. | Twilio Advanced Opt-Out mechanics (confirms app-level suppression is mandatory, not optional, because Twilio's own list isn't API-queryable), inbound webhook signature verification pattern, `clients`-scoped schema recommendation, pre-send gate composition |
| CUST-04 | A platform-wide quiet-hours guard prevents end-customer SMS outside acceptable local hours. | TCPA/state quiet-hours research, recipient-local-time derivation strategy with documented error bounds, schema recommendation for quiet-hours config |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Security — secrets:** All Twilio credentials (Account SID, Auth Token, and any new webhook validation config) must go through the existing encrypted `platform_integrations` store via `getTwilioConfig()` (`lib/platform-config.ts`) — never `.env`. This is already the pattern `lib/sms/client.ts` follows; the new inbound webhook must read the Auth Token the same way for signature validation.
- **Secret Handling (CRITICAL):** Never commit real Twilio Account SIDs, Auth Tokens, or webhook validation secrets to git, including in this RESEARCH.md, PLAN.md, or SUMMARY.md files. Use placeholders (`AC<...>`, `<auth_token>`) in all planning docs.
- **Stack:** Next.js 14+ App Router, TypeScript strict — the inbound webhook is a new `app/api/webhooks/twilio/route.ts` (or similar) Route Handler, consistent with the existing `app/api/webhooks/whatsapp/route.ts` and Stripe webhook precedents.
- **Database:** Supabase PostgreSQL with RLS on all tables — new consent/suppression columns or tables must carry RLS scoped by `company_id`, consistent with every other tenant-scoped table.
- **GSD workflow enforcement:** Implementation must go through `/gsd:execute-phase`, not direct edits (project-level rule, not phase-specific, noted for completeness).

## Summary

Phase 176 has one central engineering finding that resolves an apparent contradiction between two existing project research docs: **STACK.md says Twilio auto-handles STOP with "zero application code," while ROADMAP.md's locked Phase 176 success criteria require building a new inbound Twilio webhook.** Both are correct, but about different things. Twilio's own auto-handling (which works on bare toll-free/long-code numbers with no Messaging Service required) protects *Twilio's own delivery attempts* — Twilio silently blocks future carrier-level sends to a number that texted STOP. But this newly-verified finding is decisive: **Twilio's Advanced Opt-Out documentation explicitly states it "does not support changing or reporting on blocked phone numbers via the Console or the REST API."** There is no way to query Twilio and ask "has this number opted out?" before a send. Xtimator's own application logic — reminders, agentic sends, batch sends — has zero visibility into Twilio's internal suppression state unless Xtimator captures the STOP event itself. Fortunately, Twilio does forward the inbound STOP message to the account's own configured webhook (with an `OptOutType` field when using Advanced Opt-Out on a Messaging Service) even while performing its own internal blocking — so building the webhook is both necessary (to populate `clients`-scoped suppression state that the app can query synchronously before every send) and sufficient (Twilio does deliver the event).

The second major finding changes a planning assumption from a sibling phase: Twilio's ISV compliance guidance is explicit that toll-free/10DLC registration should represent **the actual end-business** (each tenant), not the reselling platform. A single shared "dedicated Messaging Service" for all tenants' end-customer SMS — as currently written into Phase 177's operational gate — may not cleanly satisfy Twilio's own registration model once tenant business names diversify in message content. This is flagged as Operational Decision #1 above; it does not block Phase 176 because this phase's schema is designed to be sender-agnostic (suppression keyed by phone number, not by which Twilio resource sent to it).

Third, quiet-hours enforcement has no single federal bright line for SMS specifically — the TCPA's well-known "8am-9pm" is most directly a Telemarketing-Sales-Rule-style solicitation-calling-hours convention that industry practice extends to text messages, and a handful of states (Florida, Oklahoma, and by some secondary sources Washington/Connecticut/Maryland) impose a stricter 8pm cutoff by statute. Given CUST-04 asks for one platform-wide guard, the actionable recommendation is to standardize on **8am-8pm in the recipient's local time** everywhere (adopting the strictest commonly-cited state bound as the universal default), computed via a `clients.state`-first, area-code-fallback derivation strategy using Node's native `Intl.DateTimeFormat` (zero new dependencies) rather than a phone-timezone library.

**Primary recommendation:** Build one `assertSendAllowed(companyId, clientId, channel)` gate function that composes suppression check → consent check → quiet-hours check, in that order (cheapest/most-decisive check first), backed by new `clients`-scoped columns (not a new join table, given the low cardinality of consent state per client) plus a lightweight `client_message_events` audit trail for STOP/START/HELP replies, and route Phase 177/178's `sendCustomerMessage()` through this one function so there is exactly one call site to ever bypass.

## Twilio Advanced Opt-Out Mechanics (Q1)

**Does STOP/START/HELP auto-handling require a Messaging Service?** No — for *default* behavior. Twilio automatically handles the standard English keywords (STOP, UNSUBSCRIBE, END, QUIT, STOPALL, REVOKE, OPTOUT, CANCEL for opt-out; START, YES, UNSTOP for opt-in; HELP) on **bare Toll-Free and Long Code (10DLC-eligible) numbers by default, with no Messaging Service required, and this default behavior is not customizable.** Standalone Short Codes are the one exception — they get no default handling unless placed in a Messaging Service. **HIGH confidence** (official Twilio Support docs, cross-referenced across two articles).

**Advanced Opt-Out** (custom bilingual copy, custom keyword additions like locale variants, per-Messaging-Service opt-in/out confirmation text) is a distinct, optional feature that **does require a Messaging Service** — it's configured at the Messaging Service level and, once enabled, applies to every sender (long code, short code, toll-free) in that service's sender pool. **HIGH confidence** (official Twilio docs, `twilio.com/docs/messaging/tutorials/advanced-opt-out`).

**What does Twilio persist, and can it be queried via API before a send?** Twilio maintains its own internal opt-out list per number/Messaging Service ("blacklist" in Twilio's own docs), and checks it automatically before every future outbound send — a blocked send fails asynchronously with **Error Code 21610** ("the message From/To pair violates a blacklist rule"). Critically: **"Advanced Opt-Out currently does not support changing or reporting on blocked phone numbers via the Console or the REST API"** — confirmed directly from Twilio's own official tutorial page. There is no pre-send query endpoint. Twilio also does not expose an API to add the newer REVOKE/OPTOUT keywords to Advanced Opt-Out — that's Console-only. **HIGH confidence**, this is the single most decisive finding for this phase's design — it forecloses the "just ask Twilio before sending" approach entirely and confirms the ROADMAP's locked decision (build our own webhook + our own suppression column) is the only viable design, not an over-engineering choice.

**Does the inbound STOP message still reach our own webhook, or does Twilio swallow it?** It is still forwarded. Twilio logs the block internally *and* passes the inbound message through to the account's/Messaging Service's configured inbound webhook URL, with an `OptOutType` field (`STOP` / `START` / `HELP`) added to the webhook payload when Advanced Opt-Out is active. **MEDIUM-HIGH confidence** (official Twilio Support doc text via WebSearch synthesis, consistent with Twilio's widely-documented behavior; recommend a smoke test against a real number during Phase 177 provisioning to confirm the `OptOutType` field is present on the specific number type ultimately chosen, since documentation coverage for the *non*-Advanced-Opt-Out/bare-number case is thinner). Note one **explicit non-precedent to avoid copying**: Twilio's unrelated **Proxy** product (a different, session-based anonymized-communication product Xtimator does not use) *does* swallow STOP messages and skips the webhook callback entirely — do not generalize from any Proxy-specific documentation found during a future search; verify any Twilio doc page is about Programmable Messaging / Messaging Services, not Proxy, before trusting it.

**Recent platform change (2026):** As of March 16, 2026, Twilio unifies opt-out state across SMS, MMS, and RCS — a STOP reply to an RCS message from the same Messaging Service now blocks future SMS/MMS too. Not directly load-bearing for this phase (Xtimator doesn't use RCS) but worth knowing the underlying suppression state is now channel-unified on Twilio's side. **MEDIUM confidence** (WebSearch of Twilio's own blog/changelog).

**Exact API surface relevant to this phase:**
- Inbound webhook: standard Twilio Messaging webhook (`application/x-www-form-urlencoded` POST) to whatever URL is configured as the number's "A Message Comes In" webhook, or the Messaging Service's inbound webhook. Fields of interest: `From`, `To`, `Body`, `MessageSid`, and (Messaging-Service-with-Advanced-Opt-Out only) `OptOutType`.
- Signature verification: `X-Twilio-Signature` header, HMAC-SHA1 over (webhook URL + sorted POST param key+value concatenation), keyed with the Account's Auth Token, base64-encoded, compared to the header. This is a **different algorithm and header** than the existing `x-hub-signature-256` (HMAC-SHA256) pattern used for the WhatsApp webhook in this codebase — do not copy that verification function; write a new one (or adapt, since HMAC construction is similar, but the signing input format is Twilio-specific: URL + concatenated sorted params, not a raw-body hash). **HIGH confidence** for the algorithm/mechanics (official Twilio docs), **flagged pitfall**: Twilio's own docs recommend using their SDK helper for this because "subtle parsing differences can cause failures" — but this repo's established convention is explicitly no-SDK (`lib/sms/client.ts`'s comment). Recommend writing and unit-testing the manual HMAC-SHA1 implementation carefully against Twilio's documented test vectors, since a signature-verification bug either open-doors the webhook (accepts forged suppression writes) or false-rejects real Twilio traffic (breaks suppression capture silently).

## Toll-Free Verification vs A2P 10DLC (Q2)

Reconfirms and extends STACK.md's prior findings; the multi-tenant angle below is new.

| Dimension | Toll-Free Verification | A2P 10DLC |
|---|---|---|
| Reviewer | Twilio, in-house | External carrier vetting (via The Campaign Registry) |
| Typical timeline | Faster; Twilio-side review, resubmissions within 7 days get priority queue | Commonly 1-2+ weeks |
| Ongoing fees | No per-campaign carrier fee | Per-campaign carrier fees (varies by use-case/throughput tier) |
| Throughput (low-volume relevant) | ~3 msg/sec/number, adequate for one tenant's client list | Scales higher once trust-scored, but low-volume use cases start throttled too |
| New requirement (2026) | Business Registration Number (BRN) fields required starting business info updates in 2026 per multiple secondary sources (Telnyx explicitly cites Feb 17 2026 for BRN fields; Twilio's own equivalent rollout should be re-verified in-console at registration time) | `PrivacyPolicyUrl` + `TermsAndConditionsUrl` required on all **new** campaign submissions as of June 30, 2026 (already in effect as of this research date) — confirmed via Twilio's own changelog. **Existing** campaigns registered before that date are unaffected until they're modified. |
| ISV/multi-tenant model | Twilio's ISV guidance: register **per end-customer** (the tenant's own business info), using Twilio's Compliance Embeddable for self-service intake at scale; Trust Hub secondary customer profiles keep tenants separated under the ISV's primary account | Same per-end-customer principle: each tenant gets its own Brand (belongs to its own Secondary Customer Profile) and Campaign; numbers are pooled into the Messaging Service's sender pool, but the *registration identity* is still per-tenant, not per-platform |

**Recommendation (reconfirming STACK.md, now with the multi-tenant caveat made explicit):** Toll-Free Verification remains the right choice for the *speed/cost* dimension of this milestone's low-volume, transactional use case. But the **registration identity** should be evaluated against the multi-tenant finding above before Phase 177 provisions anything — this is Operational Decision #1. **MEDIUM-LOW confidence** on the multi-tenant specifics (Twilio's own docs are thin here relative to the single-tenant case; WebSearch synthesis, not verified against Twilio's current Trust Hub console UI for this exact scenario) — recommend a direct question to Twilio sales/support before committing capital to either path, given how much registration effort/cost scales with the answer.

## TCPA Consent Basis for Transactional Messages (Q3)

**Not legal advice — engineering-actionable requirements distilled from current secondary sources, all flagged for legal sign-off before shipping.**

- **Two consent tiers exist under TCPA:** *Prior express written consent* (required for marketing/promotional content) vs. *prior express consent* (oral or written is sufficient, required for transactional/informational content — order confirmations, appointment reminders, account alerts). Estimate-related SMS (a link to review/approve an estimate, a status update on a job) reads as transactional, not marketing, **provided the message never includes promotional content** (a discount code, an upsell) — mixing promotional content into a transactional message can reclassify the whole message and require the higher consent bar. **MEDIUM confidence** (multiple WebSearch-verified secondary sources agree; not independently checked against FCC's own current rule text).
- **Established Business Relationship (EBR)** is a narrower TCPA exception (engaged in a transaction within the previous 18 months) and does **not** grant blanket permission to text — it's relevant context, not a standalone green light. The stronger and more defensible basis for Xtimator's specific scenario is that **the tenant's own client gave the tenant their phone number directly, in the context of requesting the exact service the SMS is about** (an estimate) — this is closer to "prior express consent obtained in the context of the transaction" than to a cold EBR argument. Record *that* provenance explicitly (see schema) rather than relying on EBR language alone.
- **Who is "the sender" for TCPA purposes — the tenant or Xtimator?** Both plausibly have exposure: TCPA liability generally follows whoever initiates the call/text or benefits from it and controls its content, which can include a platform acting as the business's SMS processor. This is exactly why the ROADMAP flags this as requiring legal sign-off — the consent relationship and message content are the tenant's, but the sending infrastructure and any per-tenant Toll-Free/10DLC registration are Xtimator's. **LOW confidence / genuinely needs counsel** — no source found definitively resolves platform-as-processor liability allocation for this specific SaaS-reseller pattern.
- **What must be recorded to be defensible (regardless of which consent-basis decision is made):** who gave the number to whom (tenant added the client record — capture at minimum: the tenant user who created/edited the client, and when), what the client was told at first contact if anything explicit was shown, and the exact opt-out mechanism disclosed. Concretely, mirror the existing owner-side pattern (`sms_opt_in_at` + `sms_opt_in_consent_text` in `lib/notifications/preferences.ts`) but scoped to `clients`: a timestamp, a provenance/method field, and the literal consent text shown (if any) or an explicit `'implied_business_relationship'` marker if no explicit opt-in UI exists (ties directly to Operational Decision #2).
- **A note on a possibly-stale claim:** one WebSearch result referenced a "January 2026 FCC rule" restricting reuse of consent obtained through third parties across multiple downstream businesses. A separate, more specific search revealed this is very likely a garbled reference to the FCC's **"one-to-one consent" rule for lead generation**, which was **vacated by the Eleventh Circuit and formally repealed by the FCC in 2025** — i.e., that specific restriction is *not* currently in effect. This is flagged explicitly as a caution about search-result staleness/conflation: **do not rely on either claim without a lawyer confirming current status**, but directionally, Xtimator's scenario (tenant's own direct client relationship, not a purchased/brokered lead list) does not resemble the lead-generation pattern that rule targeted anyway. **LOW confidence**, explicitly flagged rather than silently picking a side.

## Quiet Hours (Q4)

**Federal baseline:** Industry practice and multiple secondary sources converge on **8:00am-9:00pm in the recipient's local time zone** as the safe-harbor window commonly attributed to TCPA-adjacent telemarketing-hours rules (frequently cited as rooted in 47 CFR §64.1200, though no source found in this research pinned an exact subsection specifically covering SMS — **flag for legal citation-check**, don't ship a specific CFR citation in user-facing copy without verification). **MEDIUM confidence.**

**Stricter state statutes (secondary-source list, NOT independently verified against each state's current code — flagged for legal confirmation):**
| State | Window found in sources | Other restrictions mentioned |
|---|---|---|
| Florida | 8am-8pm local | No Sunday calls/texts; ≤3 contacts/number/day (Florida Telephone Solicitation Act / "mini-TCPA") |
| Oklahoma | 8am-8pm local | ≤3 solicitations/24h |
| Washington, Connecticut, Maryland | Cited by one lower-confidence secondary source as having similar/stricter rules; exact windows not independently confirmed in this research pass | — |

**Recommendation for CUST-04's "platform-wide guard":** Adopt a single **8:00am-8:00pm recipient-local** window universally, rather than a state-variable table. Rationale: (a) it already satisfies every stricter state found in research without needing to know which state applies, (b) it eliminates an ongoing legal-maintenance burden (a stale/incomplete state table is itself a compliance risk), (c) the cost is small — losing the 8-9pm hour on non-restricted-state recipients — for a low-frequency, transactional message type where next-business-morning delivery is a fully acceptable fallback. This is Operational Decision #3 above; confirm before implementation.

**Deriving recipient-local time — recommended approach with honest error bounds:**

1. **Primary signal: `clients.state`** (already a column on the existing `clients` table today). Map US state → primary IANA timezone via a small static table. This is Xtimator's strongest available signal because the domain is physically local — construction/landscaping/plumbing/HVAC/cleaning businesses do on-site work, so a client's on-file address is very likely their real physical location (unlike, say, e-commerce, where a billing address can be anywhere). **Known error source:** states spanning multiple time zones (about 12-13 US states, e.g., Texas, Florida panhandle, Michigan, Indiana, Kentucky, Tennessee, Idaho, Oregon, Kansas, Nebraska, North/South Dakota, Arizona-with-Navajo-Nation-DST-exception). For those states, resolve to the **most restrictive applicable zone** for each boundary independently (i.e., compute the "8am" cutoff using whichever of the state's zones has the *latest* clock at that moment, and the "8pm" cutoff using whichever has the *earliest* clock) rather than picking one zone — this guarantees the guard never fires outside 8am-8pm in ANY zone the state could plausibly be in, at the cost of a narrower effective window for split-zone-state clients (a small, known, deliberate over-block).
2. **Fallback: NANP area code of `clients.phone`.** A small hand-maintained ~300-entry area-code → IANA-timezone static table (no new npm dependency — matches this repo's established zero-dependency convention for exactly this kind of lookup table; `libphonenumber-js` (already resolvable via npm, not currently installed) can validate/normalize the E.164 number and extract the NPA, but does not itself provide timezone data). **Known error source:** number portability — a person can keep their original-market number after moving states, so area code reflects *where the number was originally issued*, not necessarily where the person is now. No source found quantifies this drift rate specifically for the US; treat as a real but unquantified error margin, and prefer signal #1 whenever available.
3. **Last-resort fallback: the tenant's own `companies.state`.** Since the client is typically local to the business (again, physical-service-industry specific), a tenant's own on-file business state is a weak-but-nonzero proxy when neither client state nor phone area code resolves cleanly (e.g., international/VOIP numbers, or a null `clients.state`).
4. **If all three are unavailable/unresolvable:** **fail closed** — block the send and surface it for manual review, rather than defaulting to a guessed timezone (e.g., ET or UTC). Given TCPA statutory penalties ($500-$25,000 per violating message per multiple secondary sources), guessing wrong is materially worse than a delayed send.

**Implementation mechanics:** compute recipient-local hour via Node's native `Intl.DateTimeFormat(undefined, { timeZone: ianaZone, hour: 'numeric', hour12: false })` (zero new dependency, matches the codebase's already-installed `date-fns@^4.1.0` general date-handling convention without adding `date-fns-tz`/`luxon` just for this one comparison — those libraries exist and are current, `date-fns-tz@3.2.0` / `luxon@3.7.2` per live npm registry check, but neither is needed here since the check is a single "is the current instant within an hour range in a named zone" comparison that `Intl.DateTimeFormat` does natively and correctly, including DST transitions).

## Schema Recommendation (Q5)

**Design principle:** keep it on `clients` (low cardinality, 1 row per client, matches the existing owner-side `notification_preferences` precedent of storing consent state as columns, not a separate event-sourced table for the *current state*) plus one small **append-only audit table** for the actual STOP/START/HELP replies (defensibility requires a record of *every* keyword event, not just the latest state).

### `clients` — new columns (consent/suppression current-state)

| Column | Type | Purpose |
|---|---|---|
| `sms_consent_status` | `text` (`'granted' \| 'revoked' \| 'unknown'`, default `'unknown'`) | Single source of truth the pre-send gate checks. `'unknown'` is NOT the same as `'granted'` — ties to Operational Decision #2 (whether unknown defaults to sendable under an implied-consent theory, or blocks until explicit). |
| `sms_consent_method` | `text` nullable (`'implied_business_relationship' \| 'explicit_opt_in' \| ...`) | Provenance — how consent was established. |
| `sms_consent_text` | `text` nullable | The literal disclosure/consent copy shown, if any (mirrors `sms_opt_in_consent_text` on the owner side). |
| `sms_consent_recorded_at` | `timestamptz` nullable | When the current status was recorded. |
| `sms_consent_recorded_by` | `uuid` nullable, FK to the tenant user who recorded it (or null if system-inferred) | Audit trail for who asserted consent existed. |
| `sms_opted_out_at` | `timestamptz` nullable | Set the moment a STOP-class reply is captured; the fastest, single-column check the gate needs — deliberately redundant with `sms_consent_status` for a cheap indexable NOT NULL check. |

Add a **partial index** on `sms_opted_out_at IS NOT NULL` (or on `sms_consent_status = 'revoked'`) since the pre-send gate's suppression check is the hottest, highest-stakes read on this table and must be O(1)/indexed, never a table scan.

### New table: `client_message_events` (append-only audit — mirrors `estimate_deliveries`' role as this milestone's audit precedent, but scoped to inbound keyword events, not outbound sends — CUST-05's `customer_messages` outbound audit table is Phase 177's, separate)

| Column | Type | Purpose |
|---|---|---|
| `id` | `uuid` | PK |
| `company_id` | `uuid` | Tenant scope (RLS) |
| `client_id` | `uuid` nullable | FK to `clients` — nullable because an inbound reply might arrive from a number that doesn't (yet) match any `clients.phone` row exactly (formatting drift, deleted client, etc.) — never drop an inbound event, log it unresolved rather than discard |
| `from_phone` | `text` | Raw `From` as received, for the unresolved-match case above |
| `keyword_type` | `text` (`'stop' \| 'start' \| 'help' \| 'other'`) | Parsed classification |
| `raw_body` | `text` | Full inbound message body, for the manual-review case (Operational Decision #4) |
| `twilio_message_sid` | `text` | Twilio's `MessageSid`, dedupe/audit key |
| `received_at` | `timestamptz` | — |

### Quiet-hours config

Given Operational Decision #3 recommends a single platform-wide window (not per-tenant-configurable), this can start as a small constant/config value (e.g., in `lib/notifications/` alongside the new gate function) rather than a database table — no schema needed unless/until a future milestone makes it tenant-configurable. If the eventual decision is a per-state table instead of a blanket window, that's a static lookup table (state → timezone(s) + optional override hours), not a runtime-configurable one, so it belongs in code, not the database, for the same reason the existing `EVENT_CATEGORIES`/`DEFAULT_PREFERENCES` maps in `lib/notifications/event-types.ts` are code constants rather than DB rows.

### Pre-send gate composition — the ONE function Phase 177/178 must call

```typescript
// lib/notifications/customer-send-gate.ts (new, Phase 176)
export interface SendGateResult {
  allowed: boolean
  reason?: 'suppressed' | 'no_consent' | 'quiet_hours' | 'unresolvable_timezone'
}

export async function assertSendAllowed(
  companyId: string,
  clientId: string,
  channel: 'sms', // widen to 'email' later if email ever needs quiet-hours/consent gating
): Promise<SendGateResult> {
  // 1. Suppression check FIRST — cheapest, most legally decisive, single indexed
  //    column read. A suppressed client is ALWAYS blocked regardless of anything else.
  // 2. Consent check SECOND — only relevant if not suppressed.
  // 3. Quiet-hours check LAST — the only one that's time-dependent (a retry a few
  //    hours later could pass), so ordering it last avoids wasted timezone-derivation
  //    work for a client that's going to be blocked anyway by #1/#2.
}
```

Both Phase 177's `sendEmail()`/`sendSms()` wrapper and Phase 178's agentic `sendCustomerMessage()` call this ONE function before dispatch — no send path may bypass it, including the existing `app/api/estimates/[id]/send-sms/route.ts` one-off precedent, which today has **zero consent/suppression check** (confirmed by direct code read) and should be migrated onto this gate as part of Phase 177, not left as a silent exception.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Carrier-level STOP/HELP/START keyword parsing for the purpose of blocking Twilio's own future retries | A custom carrier-side blocklist | Twilio's built-in default keyword filtering (free, automatic, works on bare toll-free/long-code numbers) | Twilio already does this for free at the carrier level; duplicating it doesn't add value — but it's NOT a substitute for the app-level suppression table, since it's not queryable (see Q1) |
| Recipient-local-time computation | A phone-number-to-timezone npm library (none found that's well-maintained enough to trust for a legal-compliance gate; timezone databases embedded in phone libraries are frequently stale) | Native `Intl.DateTimeFormat` + a small hand-maintained state→timezone table (already-available `clients.state` column) | Zero new dependency, matches repo convention, and the state-based signal is domain-appropriate (physical local service businesses) in a way a generic phone-number library wouldn't know to exploit |
| Webhook signature verification | Twilio's official SDK helper (`twilio.validateRequest`) | A small hand-rolled HMAC-SHA1 verifier, matching the repo's established "no `twilio` SDK" convention (`lib/sms/client.ts`'s own comment) | Consistent with the project's explicit prior decision to stay REST-over-fetch; Twilio's own recommendation to use the SDK is a general best practice, not something this specific repo follows elsewhere — but this IS the one place where getting the manual implementation subtly wrong has real security consequences (forged suppression writes), so budget explicit test-vector-based unit tests |

**Key insight:** the entire suppression/consent problem in this phase is NOT "how do we talk to Twilio correctly" (Twilio's side is well-documented and mostly free/automatic) — it's "how do we give our OWN application a synchronous, queryable, indexed answer to 'can I text this person right now?' independent of Twilio," because Twilio deliberately does not expose that as a queryable API. That reframing is the single most important takeaway for planning.

## Common Pitfalls

### Pitfall A: Assuming Twilio's carrier-level block is a substitute for an app-level suppression check
**What goes wrong:** A developer sees Twilio auto-handles STOP and skips building the `clients.sms_opted_out_at` check, reasoning "Twilio will just reject the send anyway." **Why it happens:** Twilio's docs genuinely do say STOP handling is automatic and free — easy to read as "fully handled." **How to avoid:** Remember Twilio's block only prevents *delivery*, not *the attempt* — Xtimator still burns an API call, still gets an async `Error Code 21610` failure to handle, and (critically) other send paths querying `clients` state directly (e.g., a UI showing "can message this client") have no way to know the client is suppressed at all without our own column. **Warning signs:** any send path that doesn't read `sms_opted_out_at`/`sms_consent_status` before calling `sendSms()`.

### Pitfall B: Copying the WhatsApp webhook's signature-verification code verbatim
**What goes wrong:** `verifyWebhookSignature` in `lib/whatsapp/verify.ts` implements Meta's `X-Hub-Signature-256` (HMAC-SHA256 over the raw request body). Twilio's `X-Twilio-Signature` is HMAC-SHA1 over a completely different input (webhook URL + sorted, concatenated POST params, not the raw body). Reusing the WhatsApp function silently fails closed (all Twilio webhooks rejected) or, worse, is adapted incorrectly and fails open. **How to avoid:** Write a distinct Twilio-specific verifier; unit-test against Twilio's own published example signature/params/expected-output triple before trusting it in the route handler.

### Pitfall C: Treating "8am-9pm" as legally settled for SMS specifically
**What goes wrong:** Shipping quiet-hours copy or internal comments that cite a specific CFR subsection as "the SMS quiet hours rule" when the exact regulatory basis for extending the calling-hours rule to text messages (vs. voice solicitation calls) is treated inconsistently across secondary sources found in this research. **How to avoid:** Keep the 8am-8pm window as an internal, defensively conservative product policy, not as user-facing "per federal law X" copy, unless legal confirms exact citation language.

### Pitfall D: Deriving timezone from area code alone and treating it as ground truth
**What goes wrong:** A client who moved states but kept their phone number gets quiet-hours-gated (or not gated) based on stale geography. **How to avoid:** Prefer `clients.state` (an explicit, tenant-entered field reflecting the client's actual service address) over phone-derived signals whenever present; treat area-code derivation as a fallback with known drift, not a primary source.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Twilio Account (existing shared account, per platform memory) | Reading Auth Token for webhook signature verification | ✓ (already configured in `platform_integrations`, used by `lib/sms/client.ts`) | — | — |
| Dedicated Toll-Free/A2P number or Messaging Service for end-customer sends | Full E2E verification of "a STOP reply actually suppresses a send" | ✗ — not yet provisioned (Phase 177's operational gate, not built yet) | — | Phase 176 ships and unit-tests the gate + webhook handler against mocked Twilio payloads; E2E carrier-level verification is deferred until Phase 177 provisions a real number |
| `libphonenumber-js` (E.164 validation/NPA extraction, optional) | Area-code fallback derivation (signal #2) | Not currently installed; resolvable via npm (`1.13.9` per live registry check, 2026-07-21) | 1.13.9 | The existing repo already has a hand-rolled `E164_RE` regex (`app/api/estimates/[id]/send-sms/route.ts`) sufficient for basic validation; a full library is optional polish, not a hard requirement, for extracting the NPA (first 3 digits after `+1` cover it without a library) |

**Missing dependencies with no fallback:** none — this phase's schema/gate/webhook logic does not require a live registered number to build or unit-test correctly.

**Missing dependencies with fallback:** the dedicated Toll-Free/10DLC number (Phase 177 concern; Phase 176 uses mocked payloads for its own test suite).

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest (existing, `vitest.config.ts` at repo root) |
| Config file | `vitest.config.ts` — `include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', ...]` |
| Quick run command | `npx vitest run tests/unit/notifications/customer-send-gate.test.ts` (new file, path TBD by planner) |
| Full suite command | `npx vitest run tests/unit tests/integration` (per project CI convention noted in project memory: CI scopes to `tests/unit tests/eval`, but this phase's tests should live under `tests/unit` to be included) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| CUST-03 | A suppressed client (`sms_opted_out_at` set) is never sent to, via any call path | unit | `pytest`-equivalent: `npx vitest run tests/unit/notifications/customer-send-gate.test.ts -t "suppressed"` | ❌ Wave 0 |
| CUST-03 | Inbound Twilio webhook with a STOP body correctly sets `sms_opted_out_at` + inserts a `client_message_events` row, with valid-signature enforcement (reject on bad/missing signature) | unit + integration (mocked Twilio payload + signature) | `npx vitest run tests/unit/webhooks/twilio-inbound.test.ts` | ❌ Wave 0 |
| CUST-03 | A client with `sms_consent_status = 'unknown'`/`'revoked'` is blocked by the gate | unit | `npx vitest run tests/unit/notifications/customer-send-gate.test.ts -t "consent"` | ❌ Wave 0 |
| CUST-04 | A send attempt outside the 8am-8pm recipient-local window is blocked; inside the window is allowed | unit (time-mocked via `vi.useFakeTimers()` + fixed `Date`) | `npx vitest run tests/unit/notifications/quiet-hours.test.ts` | ❌ Wave 0 |
| CUST-04 | Timezone derivation precedence (`clients.state` → area code → `companies.state` → fail-closed) resolves correctly for each fallback tier, including a split-timezone state | unit | `npx vitest run tests/unit/notifications/timezone-derive.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `npx vitest run <specific test file>`
- **Per wave merge:** `npx vitest run tests/unit/notifications tests/unit/webhooks`
- **Phase gate:** full `npx vitest run tests/unit tests/integration` green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/notifications/customer-send-gate.test.ts` — covers CUST-03 (new file, new module)
- [ ] `tests/unit/webhooks/twilio-inbound.test.ts` — covers CUST-03 (new file; no Twilio inbound webhook or test precedent exists in the repo today — this is genuinely net-new test infrastructure, not an extension)
- [ ] `tests/unit/notifications/quiet-hours.test.ts` — covers CUST-04 (new file)
- [ ] `tests/unit/notifications/timezone-derive.test.ts` — covers CUST-04 (new file)
- [ ] A Twilio signature test-vector fixture (URL + params + Auth Token + expected `X-Twilio-Signature`) — needed to unit-test the HMAC-SHA1 verifier against a known-good triple rather than only round-tripping the implementation against itself (which wouldn't catch an algorithm-level bug). Twilio's own docs publish example vectors for this purpose — pull one during implementation.

## Sources

### Primary (HIGH confidence)
- `lib/sms/client.ts`, `lib/notifications/preferences.ts`, `app/api/estimates/[id]/send-sms/route.ts`, `app/api/webhooks/whatsapp/route.ts`, `lib/platform-config.ts`, `types/database.types.ts` (`clients`, `companies`, `estimate_deliveries` shapes) — direct repository inspection
- [Twilio — Advanced Opt-Out tutorial](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out) — Messaging-Service requirement, "does not support changing or reporting on blocked phone numbers via the Console or the REST API" (verified via WebFetch of the live page, 2026-07-21)
- [Twilio — A2P 10DLC changelog: PrivacyPolicyUrl/TermsAndConditionsUrl](https://www.twilio.com/en-us/changelog/a2p-10dlc-campaign-registration-will-require-privacy-policy-and-) — effective June 30, 2026, new campaigns only (verified via WebFetch)
- npm registry live queries (2026-07-21): `libphonenumber-js@1.13.9`, `date-fns-tz@3.2.0`, `luxon@3.7.2`

### Secondary (MEDIUM confidence)
- Twilio Support articles (via WebSearch synthesis, consistent across multiple official `support.twilio.com`/`help.twilio.com` URLs): default STOP filtering on bare toll-free/long-code numbers, `OptOutType` field on inbound webhook payloads, no API for adding REVOKE/OPTOUT keywords, March 2026 SMS/MMS/RCS opt-out unification
- [Twilio — X-Twilio-Signature validation mechanics](https://www.twilio.com/docs/usage/webhooks/webhooks-security) (via WebSearch synthesis) — HMAC-SHA1 over URL+sorted-params
- [Twilio Toll-Free Verification for ISVs](https://support.twilio.com/hc/en-us/articles/13263383206299-Toll-Free-Verification-for-ISVs), [ISV A2P 10DLC Onboarding](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv) — per-end-customer registration identity model (via WebSearch synthesis, not independently WebFetched due to 403s on the direct support.twilio.com URL)
- FCC 2024 "any reasonable means" opt-out Report & Order, phased effective dates through April 2025 (multiple law-firm secondary sources via WebSearch — [TermsFeed](https://www.termsfeed.com/blog/tcpa-2025-any-reasonable-means-opt-out/), [National Law Review](https://natlawreview.com/article/new-fcc-tcpa-consumer-consent-revocation-mandates-effective-april-11-2025))
- TCPA quiet-hours state list (Florida/Oklahoma 8am-8pm) — [LeadFriendly TCPA calling hours by state](https://www.leadfriendly.com/guides/tcpa-calling-hours-by-state) (single secondary source for the specific windows; corroborated directionally by [Referrizer](https://support.referrizer.com/article/tcpa-quiet-hours-and-state-specific-rules-for-text-campaigns) and [Klaviyo's Florida mini-TCPA explainer](https://help.klaviyo.com/hc/en-us/articles/4405332994843) but not independently verified against each state's current statute text)
- Express consent vs. EBR vs. marketing/transactional distinction — multiple WebSearch-surfaced compliance-vendor blog sources (ActiveProspect, Quo/OpenPhone, TermsFeed) — directionally consistent with each other, none is a primary legal source

### Tertiary (LOW confidence — explicitly flagged, needs legal validation)
- "January 2026 FCC rule" restricting third-party consent reuse — likely a conflation with the now-repealed one-to-one consent rule ([ComplianceHub.Wiki: "The One-to-One Consent Rule Is Dead"](https://compliancehub.wiki/tcpa-2026-consent-revocation-one-to-one-rule-vacated-compliance/), [Morrison Foerster on the Eleventh Circuit vacatur](https://www.mofo.com/resources/insights/250130-eleventh-circuit-vacates-fcc-s-tcpa-one-to-one-consent-rule)) — surfaced explicitly as a contradiction found during research, not resolved
- Platform-as-SMS-processor TCPA liability allocation between Xtimator and its tenants — no source found that resolves this for the specific SaaS-reseller pattern; flagged as needing direct counsel input, not inferred from general TCPA commentary
- Washington/Connecticut/Maryland quiet-hours specifics — mentioned in only one lower-confidence secondary source, not corroborated

## Metadata

**Confidence breakdown:**
- Twilio API mechanics (Q1): HIGH — verified against live official Twilio docs via WebFetch, cross-referenced across multiple pages
- Toll-Free/10DLC single-tenant mechanics (Q2): MEDIUM — consistent with prior STACK.md research, re-confirmed
- Multi-tenant ISV registration model (Q2, new finding): LOW-MEDIUM — thin official coverage, WebSearch-synthesized, high-stakes — explicitly flagged as an operational decision rather than asserted as settled
- TCPA consent basis (Q3): MEDIUM — consistent secondary-source convergence on the express-consent/EBR framework, but genuinely "not legal advice" and flagged accordingly; one specific claim (Jan 2026 rule) found to likely be inaccurate/conflated during research and corrected
- Quiet hours (Q4): MEDIUM for the federal baseline, LOW-MEDIUM for the specific state list — recommend the conservative blanket-window approach specifically because the state-specific detail is the least-verified part of this research
- Schema recommendation (Q5): HIGH — directly derived from existing, already-shipped codebase patterns (`notification_preferences`, `estimate_deliveries`), not speculative

**Research date:** 2026-07-21
**Valid until:** 2026-08-20 (30 days) for the Twilio API mechanics; re-verify the A2P/Toll-Free registration requirements and any state quiet-hours list against live sources at actual implementation/registration time regardless of this date, given the pace of 2026 carrier-compliance rule changes already observed in this research (March 2026 RCS unification, June 2026 URL requirement, ongoing 2026 BRN rollout)

---
*Research for: Xtimator v4.21 Notification Center — Phase 176: End-Customer Consent, Opt-Out & Quiet Hours*
*Researched: 2026-07-21*
