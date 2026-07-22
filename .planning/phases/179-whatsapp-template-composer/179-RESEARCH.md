# Phase 179: WhatsApp Template Composer & Meta Approval Panel - Research

**Researched:** 2026-07-22
**Domain:** Meta WhatsApp Cloud API — message template (HSM) creation, review lifecycle, and send-time parameter validation
**Confidence:** HIGH (all load-bearing claims verified against `developers.facebook.com` official docs fetched live this session; no CONTEXT.md exists yet for this phase — it is a net-new owner-requested phase, FUT-01 pulled forward)

## Summary

The current `submitTemplateToMeta()` (`lib/actions/admin-whatsapp-templates.ts:110`) POSTs `components: []` to `/{waba-id}/message_templates` — an intentionally de-risked MVP that registers a template shell but never authors real content, so nothing meaningful has ever been submitted to Meta programmatically. Meta's Cloud API is unambiguous about what a real submission requires: a `BODY` component is mandatory, every `{{1}}`/`{{2}}` positional placeholder in that body **must** carry a matching `example.body_text` sample value or Meta rejects the template at submission time, and the template's parameter model (`parameter_format: "positional"` vs `"named"`) is fixed forever once approved. This directly resolves the FUT-01 open question flagged in `.planning/research/PITFALLS.md` Pitfall 3: Meta's Cloud API returns a **hard error at send time** (code `132000`, "The number of variable parameter values included in the request did not match the number of variable parameters defined in the template") when parameter count is wrong — it does not silently garble content on a count mismatch. It silently garbles content only on an **order** mismatch (right count, wrong position), which Meta cannot detect — that risk is exactly what an ordered, labeled composer UI (backed by `variables_schema`) is designed to prevent.

The `whatsapp_notification_templates.variables_schema` jsonb column already exists and is already read by `getApprovedTemplateForEvent()` (`lib/notifications/whatsapp-registry.ts:129`) to compute `expectedVariableCount` for the Phase 174 send-time guard — but it is currently always written as `[]` (never populated with real content) because nothing in the admin panel writes ordered position labels into it. This phase's composer is what makes that column, and the guard built on top of it, real for the first time.

**Primary recommendation:** Build a body-composer UI that authors an **ordered array of position labels** (e.g. `[{ label: 'Client name', example: 'John Smith' }, { label: 'Job title', example: 'Kitchen remodel' }]`), derives the `{{1}}`/`{{2}}`... body text and the Meta `example.body_text` array from that same ordered array (single source of truth — never let a human type raw `{{n}}` syntax by hand), submits real `components` to Meta (`category: 'UTILITY'`, `parameter_format: 'positional'`, one `BODY` component), persists the label array into `variables_schema` on success, and adds a direct "Check status now" `GET /{template-id}?fields=status,quality_score,rejected_reason` action alongside the existing webhook sync.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FUT-01 | WhatsApp HSM body editing in the template editor (positional `{{n}}` parameter model needs its own design pass + Meta API validation research) — deferred from Phase 173/174, pulled into this phase per owner request 2026-07-22 | This entire document. §1 answers the exact creation payload; §3 answers the parameter-validation-at-send-time question the deferral explicitly named; §5 gives the composer design that bridges positional params to a labeled UI. |

**Note on formal requirement IDs:** This is a net-new, owner-requested phase (see `.planning/STATE.md` `stopped_at`) that has not yet been added to `.planning/REQUIREMENTS.md` with its own `REQ-ID`s. The planner/orchestrator should mint phase-specific IDs (e.g. `TMPLCOMP-01..0N`) during `/gsd:plan-phase 179` scoping, anchored to FUT-01 as the origin requirement. Recommended requirement breakdown based on this research: (1) body composer with ordered position-label UI, (2) real Meta submission payload (name/category/language/components), (3) `variables_schema` write-through tying the composer to the existing Phase 174 count guard, (4) direct "Check status now" GET action, (5) edit-and-resubmit flow for rejected templates.

## Standard Stack

No new npm packages are required. This phase extends the existing hand-rolled `fetch()`-based Meta Graph API client pattern already proven in production (`lib/whatsapp/client.ts`, `lib/actions/admin-whatsapp-templates.ts`).

### Core (existing, reused)
| Component | Purpose | Why Standard (for this codebase) |
|-----------|---------|-----------------------------------|
| `fetch()` to `graph.facebook.com/{version}/...` | All Meta Graph API calls | Matches `lib/whatsapp/client.ts` and `submitTemplateToMeta()` — no SDK; Meta has no official Node SDK worth adopting for this narrow surface |
| `getWhatsAppPlatformConfig()` (`lib/platform-config.ts:488`) | Resolves `accessToken` + `wabaId` from `platform_integrations` (DB), env fallback for local dev | Already the single source of Meta credentials — per CLAUDE.md, no new env-var credential path should be introduced |
| `requireAdmin()` / `requireServiceClient()` | Auth + DB access for the composer's server actions | Matches every existing admin-whatsapp-templates.ts function |
| zod | Validate the composer's ordered label/example array shape before persisting to `variables_schema` | Already the project's form-validation standard (react-hook-form + zod per CLAUDE.md) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `fetch()` calls | An unofficial Node WhatsApp Business SDK (e.g. `whatsapp-api-js`) | Not needed for a narrow create/read/status surface; adds a dependency for ~3 endpoints already hand-rolled elsewhere in this codebase; rejected — stay consistent with `lib/whatsapp/client.ts` |

**Installation:** None — no new packages.

## Architecture Patterns

### Recommended file additions/extensions
```
lib/
├── actions/
│   └── admin-whatsapp-templates.ts   # EXTEND: real components[] payload, checkTemplateStatus(), updateTemplate() (edit+resubmit)
├── whatsapp/
│   └── meta-templates-client.ts      # NEW (optional but recommended): thin typed wrapper for
│                                      #   buildTemplateComponents(), createMetaTemplate(), getMetaTemplateStatus()
│                                      #   — mirrors lib/whatsapp/client.ts's "thin typed wrapper" pattern,
│                                      #   keeping raw Graph API shape-building OUT of the server-action file
components/admin/
└── whatsapp-templates-panel.tsx      # EXTEND: replace single-shot create form with a two-step
                                       #   compose (ordered params) -> submit -> status flow
```

### Pattern 1: Single source of truth for the ordered parameter array
**What:** One client-side ordered array `[{ label, example }]` drives THREE derived outputs: (a) the body text with `{{1}}`, `{{2}}`... inserted at the position, (b) Meta's `example.body_text: [[example1, example2, ...]]`, and (c) the `variables_schema` jsonb column written to the DB row on success.
**When to use:** Always, for this composer — never let a human free-type raw `{{n}}` tokens into a textarea, which is exactly the trap Pitfall 3 already named ("editable `{{var}}` templates break the WhatsApp HSM's positional `{{n}}` contract").
**Example:**
```typescript
// Source: pattern derived from lib/notifications/whatsapp-registry.ts's existing
// `variables: (payload) => string[]` projector concept, extended to author-time.
interface ComposerParam {
  label: string    // human-readable, e.g. "Client name" — shown in the UI, NOT sent to Meta
  example: string  // sample value — sent to Meta as example.body_text[0][n]
}

function buildBodyComponent(bodyTemplate: string, params: ComposerParam[]) {
  // bodyTemplate contains literal {{1}}, {{2}}... already in position —
  // the composer UI inserts these via an "Insert variable" button per param,
  // never free-typed.
  return {
    type: 'BODY',
    text: bodyTemplate,
    example: { body_text: [params.map((p) => p.example)] },
  }
}

// Persisted alongside the Meta submission:
const variables_schema = params.map((p) => p.label) // ordered label array —
// this is what makes expectedVariableCount (whatsapp-registry.ts:129) real.
```

### Pattern 2: Real Meta submission payload (replaces `components: []`)
**What:** The exact `POST /{waba-id}/message_templates` body for a UTILITY template with one BODY component.
**Example:**
```typescript
// Source: developers.facebook.com/documentation/business-messaging/whatsapp/reference/
//         whatsapp-business-account/message-template-api (fetched 2026-07-22)
const payload = {
  name: template.template_name,       // lowercase alphanumeric + underscores, max 512 chars
  category: 'UTILITY',
  language: template.language_code,   // e.g. 'en_US'
  parameter_format: 'positional',     // explicit — do not rely on the undocumented default
  components: [
    {
      type: 'BODY',
      text: 'Hi {{1}}, your estimate for {{2}} is ready.',
      example: { body_text: [['John Smith', 'Kitchen remodel']] },
    },
    // FOOTER/HEADER/BUTTONS optional — omit entirely for v1 (see Common Pitfalls)
  ],
}
```

### Pattern 3: Direct status check (GET) alongside the webhook
**What:** A server action that calls `GET /{template-id}?fields=status,quality_score,rejected_reason,rejection_reason` for an on-demand "Check status now" button, independent of the async webhook.
**When to use:** The webhook (`applyTemplateStatusUpdate`) is fire-and-forget and best-effort; Meta review can complete before the admin panel is even reloaded, or the webhook can be missed/delayed. A direct GET gives an admin certainty without waiting.
**Example:**
```typescript
// Source: developers.facebook.com/documentation/business-messaging/whatsapp/reference/
//         whatsapp-business-account/message-template-api (fetched 2026-07-22)
async function checkTemplateStatus(metaTemplateId: string, accessToken: string) {
  const apiVersion = process.env.META_WHATSAPP_API_VERSION ?? 'v21.0'
  const res = await fetch(
    `https://graph.facebook.com/${apiVersion}/${metaTemplateId}?fields=status,quality_score,rejected_reason`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  return res.json() as Promise<{ status: string; quality_score?: { score: string }; rejected_reason?: string }>
}
```

### Pattern 4: Edit-and-resubmit a rejected template
**What:** `POST /{version}/{TEMPLATE_ID}` (NOT the collection endpoint) with updated `components`/`category` re-triggers review on the SAME template id — no new name/version needed.
**When to use:** The "Resubmit" action for a `rejected` row.
**Example:**
```typescript
// Source: developers.facebook.com/documentation/business-messaging/whatsapp/reference/
//         whatsapp-business-account/message-template-api (fetched 2026-07-22)
// "POST /{Version}/{TEMPLATE_ID} allows updates to approved or rejected templates only."
await fetch(`https://graph.facebook.com/${apiVersion}/${metaTemplateId}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ components: newComponents }),
})
// Response status flips back to PENDING; store id unchanged (no new meta_template_id).
```

### Anti-Patterns to Avoid
- **Free-text `{{n}}` textarea:** Letting an admin hand-type `{{1}}`/`{{2}}` directly into a body textarea reintroduces exactly the risk Pitfall 3 named — a reordering save can silently send the wrong value into the wrong slot with NO error from Meta (see §3). The ordered-array UI (Pattern 1) is a structural fix, not just a nicer UX.
- **Editing an APPROVED template's variable count via the general email/SMS-style template editor:** Per Pitfall 3, WhatsApp variable edits must go through THIS composer (which re-submits to Meta and requires re-approval), never the free-text `{{var}}` editor built for email/SMS/in-app in Phase 173.
- **Sending `components: []` and calling it "submitted":** This is the exact anti-pattern the phase exists to fix — Meta accepts an empty-components POST (creates a template with no body), but it is functionally useless (no HSM to ever send against) and misleads the admin panel into showing a "pending" row that will never be sendable.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Parameter count/order validation at send time | A custom regex-based `{{n}}` counter that tries to predict what Meta will accept | Meta's own send-time validation (error `132000`) as the authoritative source, backed by the EXISTING Phase 174 pre-send guard (`expectedVariableCount` in `whatsapp-registry.ts`) that already refuses to send on a count mismatch BEFORE hitting Meta | Meta is the ground truth for what's approved; duplicating its validation logic client-side risks drift. The existing guard already exists — this phase just needs to feed it real data via `variables_schema`. |
| Template approval polling | A custom setInterval/cron poller hitting Meta every N seconds | The existing `message_template_status_update` webhook (already wired, HMAC-verified) as the primary channel, PLUS the on-demand "Check status now" GET (Pattern 3) for immediate certainty | Meta already pushes status changes; polling wastes API quota and adds latency vs. the near-real-time webhook. On-demand GET covers the "I don't want to wait" case without a poll loop. |

**Key insight:** Nothing here needs new infrastructure — the webhook route, the DB table, the admin auth gate, and the send-time guard all already exist and are already tested (Phase 104.3, Phase 174). This phase's job is narrowly to (1) make the POST payload real, (2) build the composer UI that generates that payload safely, and (3) add the direct-GET status check. Resist the urge to re-architect the surrounding plumbing.

## Common Pitfalls

### Pitfall 1: Missing or malformed `example.body_text` causes automatic rejection
**What goes wrong:** Meta auto-rejects (or outright refuses) a template submission when a body contains `{{n}}` placeholders but the `example.body_text` array is missing, has the wrong number of elements, or is malformed (mismatched braces, non-sequential numbering).
**Why it happens:** `example.body_text` is easy to treat as optional cosmetic metadata; it is not — it is Meta's mechanism for reviewers (and automated screening) to see what real content will look like.
**How to avoid:** Make `example.body_text` structurally required in the composer — derive it from the SAME ordered array that derives the body text (Pattern 1), never a separate optional field an admin could leave blank.
**Warning signs:** A 400 response from Meta's POST citing formatting/example errors; the existing `submitTemplateToMeta` code already surfaces `res.status !== 200` bodies as `error: text`, so this failure mode is visible today, just untested against real content.
**Confidence:** HIGH — official docs (`developers.facebook.com/.../templates/template-review`, fetched 2026-07-22): "Absence of sample variable values when templates use variables" is listed as a rejection trigger; "Variable parameters are missing or have mismatched curly braces" and "Variable parameters are not sequential" as well.

### Pitfall 2: Body cannot start or end with a variable
**What goes wrong:** A body template like `"{{1}}, your estimate is ready"` (starts with a variable) or `"Your total is {{1}}"` (ends with a variable) is rejected.
**Why it happens:** Meta requires literal text bracketing every parameter to reduce spam/templating abuse.
**How to avoid:** The composer's "Insert variable" UI should structurally prevent inserting a variable at position 0 or at the very end of the text — or at minimum, validate this client-side before submit with a clear error, not rely on Meta's rejection as the only signal (24h round-trip cost).
**Confidence:** HIGH — official docs (`template-review` page, fetched 2026-07-22): "The message template cannot start or end with a parameter."

### Pitfall 3: Order mismatch is NOT caught by Meta at send time — only count mismatch is
**What goes wrong:** This is the FUT-01 / Pitfall 3 open question, now resolved: Meta's Cloud API validates parameter **count** at send time (error `132000` when the request's parameter array length doesn't match the approved template's `{{n}}` count) but has **no way to validate order** — if the composer (or a future edit) reorders `variables_schema` relative to what was actually approved in Meta, the send will succeed (200 OK) with the WRONG values landing in the WRONG slots, and nothing in Meta's API will flag it.
**Why it happens:** Meta's template approval locks the BODY TEXT (with `{{1}}`, `{{2}}` in fixed literal positions) — the "order" only exists implicitly in how the sender constructs the `parameters` array at send time. Meta has no way to know "parameter index 1 was supposed to be the client name" vs. "parameter index 1 is now the job title" after an unreviewed local edit to `variables_schema`.
**How to avoid:** `variables_schema`'s ordered label array must be written ONLY as a byproduct of an actual Meta submission/resubmission (Pattern 1/2) — never edited independently of resubmitting to Meta. Any admin edit to the label order for an `approved` template should force a re-submission (Pattern 4) rather than silently rewriting the DB row while leaving the already-approved Meta template untouched.
**Warning signs:** A `variables_schema` row that was edited (via admin UI) more recently than the template's `status` last flipped to `approved` — this is a state Pattern 3/4 discipline should make structurally hard to reach.
**Confidence:** HIGH for the underlying mechanism (official error-codes page, code `132000`, fetched 2026-07-22, cross-referenced against the existing Phase 174 test suite in `tests/unit/notifications/whatsapp-registry.test.ts` which already encodes count-based guarding). The "order mismatch is silent" conclusion is a direct, HIGH-confidence logical inference from Meta's documented behavior (validates count via error code, body text/positions are fixed at approval time, no "semantic label" concept exists in the API at all) rather than a directly-quoted doc sentence — flagged for a one-time live smoke test (send a real approved template with parameters intentionally reordered) before fully trusting this in a security-sensitive design decision.

### Pitfall 4: `mapMetaEventToStatus` doesn't handle most of Meta's real event vocabulary
**What goes wrong:** `applyTemplateStatusUpdate`'s `mapMetaEventToStatus()` (`lib/actions/admin-whatsapp-templates.ts:226`) only maps `APPROVED`, `REJECTED`, `PENDING`, `PENDING_DELETION` to known statuses; every other real Meta event (`PAUSED`, `DISABLED`, `FLAGGED`, `IN_APPEAL`, `LIMIT_EXCEEDED`, `LOCKED`, `ARCHIVED`, `UNARCHIVED`, `REINSTATED`, `DELETED`) falls through to `default: return event.toLowerCase()` — which writes an arbitrary lowercase string into the `status` column that the UI's `STATUS_VARIANT` badge map (`whatsapp-templates-panel.tsx:27`, only knows `approved|pending|draft|rejected`) will render with the fallback `outline` badge and no dedicated handling.
**Why it happens:** The Phase 104.3 implementation only anticipated the happy-path lifecycle (draft → pending → approved/rejected); Meta's real webhook vocabulary is much larger (confirmed via the official webhook reference page, fetched 2026-07-22).
**How to avoid:** This phase should extend `mapMetaEventToStatus` to at least handle `PAUSED` and `DISABLED` explicitly (these are the two states that mean "stop sending this template NOW" — directly relevant to the Phase 174 send guard) and give the panel a badge/tooltip for them, rather than leaving them to degrade to a generic `outline` badge with a raw lowercase string.
**Warning signs:** A `whatsapp_notification_templates.status` value that doesn't match any of `draft|pending|approved|rejected` in production.
**Confidence:** HIGH — official webhook reference (`developers.facebook.com/.../webhooks/reference/message_template_status_update/`, fetched 2026-07-22) lists the full event enum; cross-checked directly against the current `mapMetaEventToStatus` switch in the codebase.

### Pitfall 5: API version pinning drift
**What goes wrong:** `admin-whatsapp-templates.ts` defaults to `v21.0` via `process.env.META_WHATSAPP_API_VERSION ?? 'v21.0'`; `lib/whatsapp/client.ts`'s doc comment also says "Meta Graph API v21.0". Meta versions have roughly a 2-year deprecation window; v21.0 is still within Meta's current supported range as of this research date, but the composer's new endpoints (template `POST`/`GET` by id) should use the SAME version constant, not a hardcoded literal, to avoid drift between the messaging client and the new template-management code.
**How to avoid:** Reuse the exact `process.env.META_WHATSAPP_API_VERSION ?? 'v21.0'` expression (or better, factor it into one shared constant) rather than re-hardcoding `'v21.0'` in a third file.
**Confidence:** MEDIUM — v21.0 currency confirmed via WebSearch cross-referencing multiple sources (not a single official versioned changelog page with an exact sunset date fetched this session); recommend the planner treat "confirm v21.0 hasn't hit its deprecation window" as a 5-minute pre-flight check via `GET https://graph.facebook.com/v21.0/` or the official Graph API changelog before shipping, rather than trusting this research indefinitely.

## Code Examples

### Full creation payload (verified shape)
```json
// POST https://graph.facebook.com/v21.0/{WABA_ID}/message_templates
// Source: developers.facebook.com/documentation/business-messaging/whatsapp/reference/
//         whatsapp-business-account/message-template-api (fetched 2026-07-22)
{
  "name": "owner_estimate_update",
  "category": "UTILITY",
  "language": "en_US",
  "parameter_format": "positional",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}}, your estimate \"{{2}}\" has been updated.",
      "example": {
        "body_text": [["John Smith", "Kitchen remodel"]]
      }
    }
  ]
}
```
**Response (200):**
```json
{ "id": "1234567890123456", "status": "PENDING", "category": "UTILITY" }
```

### Status check (GET by id)
```
GET https://graph.facebook.com/v21.0/1234567890123456?fields=status,quality_score,rejected_reason
Authorization: Bearer {token}
```
```json
{ "id": "1234567890123456", "status": "APPROVED", "quality_score": { "score": "GREEN" } }
```

### Send-time positional parameters (already implemented, verified against official shape)
```typescript
// lib/whatsapp/client.ts:75-78 — CONFIRMED matches Meta's official positional
// send-time shape (developers.facebook.com official examples, cross-checked
// against the current sendWhatsAppTemplate implementation, fetched 2026-07-22).
components.push({
  type: 'body',
  parameters: bodyVariables.map((text) => ({ type: 'text', text })),
})
```

### message_template_status_update webhook payload (confirmed field names)
```json
// Source: developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/
//         reference/message_template_status_update/ (fetched 2026-07-22)
{
  "event": "APPROVED",
  "message_template_id": 1234567890123456,
  "message_template_name": "owner_estimate_update",
  "message_template_language": "en_US",
  "reason": "NONE",
  "message_template_category": "UTILITY"
}
```
This confirms the field names already read by `findTemplateStatusChange()` (`app/api/webhooks/whatsapp/route.ts:38`) are correct and current.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| Positional-only `{{1}}`/`{{2}}` parameters (only format that ever existed) | Explicit `parameter_format: "positional" \| "named"` choice at template creation | Named parameters are a newer Meta Cloud API addition (not available in the older On-Premises API, which was deprecated October 2025 per Meta's own changelog) | This phase should explicitly set `parameter_format: "positional"` rather than relying on the documented default (also positional) — being explicit avoids ambiguity if Meta ever changes the default, and matches the codebase's existing positional-only send path (`sendWhatsAppTemplate`) exactly. Named parameters (`{{client_name}}`-style, sent as `{ type: 'text', parameter_name: 'client_name', text: '...' }`) are a real, documented alternative Meta now supports, but adopting them is a bigger migration (send path, registry projector, DB schema) — out of scope for this phase; note as a possible FUT item if the positional-order-mismatch risk (Pitfall 3) is judged unacceptable long-term. |
| On-Premises API | Cloud API only | October 2025 | Not directly relevant to this phase (Xtimator already uses Cloud API exclusively) but confirms the docs consulted this session are current, not legacy On-Premises docs. |

**Deprecated/outdated:** None directly affecting this phase's design — v21.0 remains within Meta's supported version window per this session's research (see Pitfall 5 for the confidence caveat).

## Open Questions

1. **Should the composer offer `parameter_format: "named"` as an alternative to positional, given it would eliminate the order-mismatch risk (Pitfall 3) entirely?**
   - What we know: Meta's Cloud API supports `{{first_name}}`-style named parameters as a documented alternative to `{{1}}`/`{{2}}` positional, sent at send-time as `{ type: 'text', parameter_name: 'first_name', text: '...' }` instead of position-indexed.
   - What's unclear: Named parameters would require changing `lib/whatsapp/client.ts`'s `sendWhatsAppTemplate` (currently hardcoded to positional `{type:'text', text}`), the `NotificationTemplate.variables` projector shape in `whatsapp-registry.ts`, and the DB schema — a materially bigger change than "add a composer UI."
   - Recommendation: Ship positional-only for this phase (matches everything already built), but flag named-parameter migration as a follow-up idea if Pitfall 3's order-mismatch risk proves troublesome in practice (e.g., after the first real admin-driven edit-and-resubmit cycle).

2. **What is the exact Meta-side behavior when `allow_category_change` is left unset and Meta thinks the content doesn't match `UTILITY`?**
   - What we know: `category` is a required field; templates can be auto-recategorized or rejected with reason `INCORRECT_CATEGORY` if content looks promotional.
   - What's unclear: Whether Meta silently recategorizes (if `allow_category_change: true`) or always requires human resubmission for UTILITY-vs-MARKETING classification — the fetched docs list this as a rejection reason but didn't give the exact recategorization mechanics in the pages fetched this session.
   - Recommendation: Default `allow_category_change: false` (fail closed — surface a rejection to the admin rather than let Meta silently change what the template is categorized as, since Xtimator's dispatch/consent logic elsewhere in this milestone treats `UTILITY` vs `MARKETING` as meaningfully different for opt-in purposes per CUST-03/04).

3. **Exact wording/shape of `rejected_reason` vs `rejection_reason` field name on the GET-by-id response.**
   - What we know: The webhook payload uses `reason` (top-level) plus a `rejection_info.reason` sub-object for `INVALID_FORMAT` rejections. The template GET-by-id reference (WebFetch-summarized, not a verbatim quote) mentioned `rejected_reason` as a queryable field.
   - What's unclear: Whether the GET field name is exactly `rejected_reason` (singular) as summarized, since this came from an AI-summarized WebFetch rather than a directly quoted API reference table — worth a live smoke-test GET call during implementation to confirm the exact field name before wiring `checkTemplateStatus()`.
   - Recommendation: During implementation, make one real `GET .../{id}?fields=status,quality_score,rejected_reason` call against a real template in the platform WABA and adjust the field name if the response differs.

## Environment Availability

Skipped in the traditional local-CLI-tool sense — this phase's only external dependency is the Meta Graph API (`graph.facebook.com`), an HTTPS service the Next.js server already calls successfully in production (per `.planning/STATE.md`'s `stopped_at`: "Migrations ... APPLIED to prod" and the existing shipped Phase 104.3 webhook/status-sync flow). No local dev tool, CLI, or service needs to be installed for this phase.

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| `platform_integrations.meta_whatsapp` row (access token + WABA id) | All Meta API calls (create/read/update templates) | Presumed ✓ (already configured — `submitTemplateToMeta` already calls Meta successfully in production per project history) | — | If missing/wrong-scope: existing `reason: 'scope'` fallback UX already handles this (register an already-approved template by name; rely on webhook) |
| `whatsapp_business_management` scope on the platform token | Template create/read/update | Unconfirmed at research time — verify with a real `submitTemplateToMeta` call or a token-debug call before assuming | — | Same `reason: 'scope'` fallback as above |

**Missing dependencies with no fallback:** None identified — every failure mode already has a designed fallback in the existing code.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing project standard) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/notifications/whatsapp-registry.test.ts tests/unit/notifications/whatsapp-channel.test.ts` |
| Full suite command | `npm run test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID (proposed) | Behavior | Test Type | Automated Command | File Exists? |
|--------------------|----------|-----------|---------------------|--------------|
| TMPLCOMP-01 | Composer derives body text + `example.body_text` from one ordered param array (no independent free-text edit) | unit | `pytest`-equivalent N/A — `npx vitest run tests/unit/admin/whatsapp-template-composer.test.ts` | ❌ Wave 0 |
| TMPLCOMP-02 | `submitTemplateToMeta` sends a real non-empty `components` payload matching the verified shape | unit (mocked fetch) | `npx vitest run tests/unit/admin/admin-whatsapp-templates.test.ts` | ❌ Wave 0 — no test file exists today for `lib/actions/admin-whatsapp-templates.ts` at all |
| TMPLCOMP-03 | On successful Meta submission, `variables_schema` is written as the ordered label array | unit | same file as above | ❌ Wave 0 |
| TMPLCOMP-04 | `checkTemplateStatus` GET action returns status/quality/rejection fields | unit (mocked fetch) | same file as above | ❌ Wave 0 |
| TMPLCOMP-05 | `mapMetaEventToStatus` handles `PAUSED`/`DISABLED` explicitly (Pitfall 4) | unit | `npx vitest run tests/unit/whatsapp/webhook-template-status.test.ts` or extend existing webhook test | Partial — no dedicated webhook-template-status test file found; existing `whatsapp-registry.test.ts` covers the registry side only |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/admin tests/unit/notifications/whatsapp-registry.test.ts`
- **Per wave merge:** `npm run test` (full `vitest run`)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/admin/admin-whatsapp-templates.test.ts` — NEW FILE. No test coverage exists today for `lib/actions/admin-whatsapp-templates.ts` (`listTemplates`, `createTemplate`, `submitTemplateToMeta`, `applyTemplateStatusUpdate` are all currently untested per this session's `find tests -iname "*admin-whatsapp-templates*"` — zero results).
- [ ] `tests/unit/admin/whatsapp-template-composer.test.ts` (or equivalent for the new composer component/logic) — covers the ordered-array → body-text/example derivation.
- [ ] Mock helper for Meta Graph API `fetch` responses (create/get/update template) — none exists today; the existing `whatsapp-registry.test.ts` mocks the Supabase client, not `fetch`.

*(No existing test infrastructure covers ANY of this phase's core logic — `admin-whatsapp-templates.ts` has zero unit tests today, confirmed by direct search.)*

## Sources

### Primary (HIGH confidence — official Meta docs, fetched live 2026-07-22)
- `developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview` — template fundamentals, positional/named parameter_format existence, sub-page links
- `developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/message-template-api` — full POST/GET/GET-by-id/POST-update API reference, required/optional fields, permissions note
- `developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review` — review timeline (~24h), automatic rejection triggers, resubmission flow
- `developers.facebook.com/documentation/business-messaging/whatsapp/templates/components` — character limits (body 1024, header 60, footer 60), button type limits
- `developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes` — error code `132000` (parameter count mismatch), `131009`, `132012`, `132001`, `132015`, `132016`, `132018`
- `developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/message_template_status_update/` — full webhook payload field list and event/reason enums
- `developers.facebook.com/documentation/business-messaging/whatsapp/get-started` — exact required permissions (`business_management`, `whatsapp_business_messaging`, `whatsapp_business_management`)
- Direct repository inspection: `lib/actions/admin-whatsapp-templates.ts`, `components/admin/whatsapp-templates-panel.tsx`, `lib/notifications/whatsapp-registry.ts`, `app/api/webhooks/whatsapp/route.ts`, `lib/whatsapp/client.ts`, `lib/platform-config.ts`, `supabase/migrations/20260621000003_whatsapp_notification_templates.sql`, `tests/unit/notifications/whatsapp-registry.test.ts`, `app/admin/inbox/settings/page.tsx`

### Secondary (MEDIUM confidence — WebSearch synthesized, cross-referenced against official pages where possible)
- Send-time positional parameter JSON shape — WebSearch aggregation of Meta/AWS/community examples, cross-verified directly against the ALREADY-SHIPPED `lib/whatsapp/client.ts:75-78` implementation (exact match)
- Graph API v21.0 currency (not superseded/deprecated as of this research date) — WebSearch only, no single official version-sunset table fetched this session

### Tertiary (LOW confidence — flagged for validation during implementation)
- Exact GET-by-id field name `rejected_reason` (singular, vs. possible `rejection_reason` or nested `rejection_info`) — came from an AI-summarized WebFetch, not a directly quoted API table; verify with a real GET call during implementation (see Open Question 3)
- Pitfall 3's "order mismatch is silent" conclusion — logically inferred from documented Meta behavior (count IS validated via error 132000, order has no validation mechanism in the API), not a directly-quoted "Meta does not validate order" sentence from official docs; recommend one live smoke test before treating as fully proven

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; pattern directly extends already-shipped, already-proven code
- Architecture: HIGH — every pattern is either a direct continuation of existing shipped code or a directly-quoted official API shape
- Pitfalls: HIGH for count-mismatch/rejection-trigger pitfalls (official docs with exact error codes and quoted rejection reasons); HIGH-with-one-flagged-inference for the order-mismatch pitfall (mechanism is HIGH confidence, "therefore silent" conclusion is a sound but not directly-quoted inference)

**Research date:** 2026-07-22
**Valid until:** 30 days (Meta API docs/error codes are relatively stable; re-verify API version currency and the `rejected_reason` field name at implementation time regardless, per the two LOW-confidence flags above)
