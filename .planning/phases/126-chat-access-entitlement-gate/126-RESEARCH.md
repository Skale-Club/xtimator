# Phase 126: Access/Entitlement Gate + Owner-Only Verification — Research

**Researched:** 2026-06-25
**Domain:** Tier entitlement gating (code-level) + owner-only access verification for the in-app chat
**Confidence:** HIGH (all findings verified directly against the codebase; no external library research required)

## Summary

This is a **thin verification/gating phase** — the FINAL phase of v4.9. The two surfaces it touches already authenticate the owner and resolve the active company: the backend `app/api/chat/route.ts` (Phase 124) does `auth.getClaims()` → 401, then `getActiveCompanyId()` → 400, then reads the `companies` row via the service client; the UI `app/(app)/chat/[[...id]]/page.tsx` (Phase 125) inherits auth from the `(app)` shell layout (which redirects unauthenticated → `/?auth=login`, no-company → `/onboarding`). What's MISSING and what CHATMETER-02 requires is: (a) a **tier entitlement flag** so chat is a Pro/Business feature, (b) the **route enforcing it** (the security boundary), (c) the **page enforcing it for UX** (upgrade prompt instead of a dead chat), and (d) a **structural verification** that chat is never customer-facing.

The codebase already has a proven, idiomatic pattern for EXACTLY this: `lib/entitlements.ts` per-tier boolean flags (`whatsappEnabled`, `priceBookEnabled`, `customDomainEnabled`), `getEntitlements(tier)` resolution, the 403 channel-gate in `app/api/estimates/[id]/send-whatsapp/route.ts`, the 402 quota-block + `upgradeUrl` in `app/api/generate-estimate/route.ts`, and the global `UpgradeModal` fetch-interceptor in the `(app)` layout. **The phase is almost entirely "copy the established entitlement pattern" — there is no novel design.**

**Primary recommendation:** Add `chatEnabled: boolean` to `Entitlements` (free=false, trial=true, pro=true, business=true). Enforce in the route as the security boundary (403 `chat_not_on_plan` with `upgradeUrl`, mirroring the WhatsApp 403 channel-gate). Enforce in the page as UX (render an upgrade prompt instead of `ChatWorkspace` when not entitled — do NOT redirect, an upgrade affordance converts better). Add a static/structural test asserting chat lives only under `app/(app)/` (never under any public/share route) and that the route enforces the gate. No migration — entitlements are code-level.

---

<user_constraints>
## User Constraints

> No CONTEXT.md exists for Phase 126 (no `/gsd:discuss-phase` was run). Constraints below are derived from REQUIREMENTS.md (CHATMETER-02), SEED-034, and the milestone STATE.md locked guardrails.

### Locked Decisions (from REQUIREMENTS.md + SEED-034 + STATE.md)
- **CHATMETER-02 scope:** "The chat is owner-only (authenticated, tenant-scoped) and gated by tier entitlement (a Pro/Business feature); it is never reachable by an end customer."
- **Owner-only, tenant-scoped, NEVER customer-facing** — Xtimator never talks to the end customer (SEED-034 Decision #4; PROJECT.md "Customer-facing chat" is explicitly Out of Scope).
- **Chat is a Pro/Business feature** (SEED-034 §6 "Gate por tier (chat pode ser feature Pro/Business — casa com SEED-013)").
- **No migration** — entitlements are code-level (`lib/entitlements.ts`); confirmed: every existing tier flag is a code constant, not a DB column.
- **Reuse the existing tier-gate + 402/403 upgrade pattern** (additional_context + the codebase precedents).
- **Scope fence:** the entitlement gate (route + page) + the owner-only verification ONLY. Backend (124) and UI (125) are DONE and must stay byte-stable except for the gate insertion. This phase closes v4.9.
- **Secret handling (CLAUDE.md / MEMORY.md):** never put real secrets in code/docs; use placeholders. (No secrets are involved in this phase.)
- **GSD/deploy guardrails (STATE.md):** idempotent + authored-only migrations (N/A — no migration here); deploy CI→GHCR→Coolify (never build on the VPS).

### Claude's Discretion (recommend during planning)
- Exact entitlement shape: a `chatEnabled: boolean` flag (RECOMMENDED — mirrors `whatsappEnabled`/`customDomainEnabled`) vs. a minimum-tier helper. The boolean is the established pattern; recommend it.
- Whether the trial tier gets chat (RECOMMENDED: yes — trial mirrors full paid access in every existing flag except `customDomainEnabled`; chat is a generate/query/knowledge value-add the trial should showcase).
- Page UX: redirect vs. inline upgrade prompt (RECOMMENDED: inline upgrade prompt — redirect throws away the conversion moment; every existing quota/limit affordance routes to `/settings/billing` with a CTA, not a silent redirect).
- The exact HTTP status for the route gate: 403 (entitlement, mirrors WhatsApp channel-gate) vs. 402 (payment, mirrors quota). RECOMMENDED: 403 — this is a "your plan doesn't include this feature" gate, identical in kind to the WhatsApp 403, not a "you've used up your quota" 402.

### Deferred Ideas (OUT OF SCOPE)
- Estimate edit-in-chat / send-in-chat (v4.9 v2 — CHATX-01/02).
- MCP parity (SEED-030, a later milestone).
- Any new billing/Stripe wiring, plan-change UI, or tier upsell page beyond reusing the existing `/settings/billing` CTA.
- Per-message/per-conversation metering of the conversation turn (CHATMETER-01 already settled: the turn is absorbed; heavy ops debit via the reused neutral functions).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHATMETER-02 | The chat is owner-only (authenticated, tenant-scoped) and gated by tier entitlement (a Pro/Business feature); it is never reachable by an end customer. | Owner-auth + tenant resolution already exist in BOTH surfaces (route: `getClaims`→401 + `getActiveCompanyId`→400; page: `(app)` layout redirects). This phase adds (1) `chatEnabled` to `lib/entitlements.ts`, (2) a route 403 gate after the company read (`getEntitlements(tier).chatEnabled`), (3) a page-level entitlement check rendering an upgrade prompt, (4) a structural test proving chat is only under `app/(app)/` and never on a public/share route. |
</phase_requirements>

---

## Standard Stack

No new dependencies. Everything needed is already in the repo.

### Core (existing, reused)
| Module | Purpose | Why Standard |
|--------|---------|--------------|
| `lib/entitlements.ts` | Per-tier capability flags + `getEntitlements(tier)` | The single authoritative tier-feature source; every gated feature lives here |
| `app/api/chat/route.ts` | The chat backend — security boundary for the gate | Already reads the `companies` row (service client); `tier` is one extra select column |
| `app/(app)/chat/[[...id]]/page.tsx` | The chat UI surface — UX gate | Already an RSC with auth inherited from `(app)` layout |
| `lib/queries/active-company.ts` | `getActiveCompanyId()` (tenant) + `getActiveCompany()` | Already used by both surfaces; note `getActiveCompany()` does NOT select `tier` (see Pitfall 2) |
| `@/lib/supabase/service` `requireServiceClient()` | Service-role read of `companies.tier` | The route already uses this for the industries/language read |

### Supporting (existing UX affordances to reuse)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `components/billing/upgrade-modal.tsx` | Global fetch-interceptor that toasts on 402 from AI routes → "Upgrade Plan" CTA → `/settings/billing` | Reference for the upgrade affordance; see Pitfall 3 — it intercepts 402 only, and only for `/api/generate-estimate` + `/api/analyze-photos` |
| `app/(app)/settings/billing/page.tsx` | The upgrade destination | The page-level prompt's CTA target (`/settings/billing`) |
| `components/billing/upgrade-buttons.tsx`, `tier-cards-grid.tsx`, `trial-banner.tsx` | Existing upgrade-CTA components | Reuse the button/CTA styling for the chat page's inline prompt |

**Installation:** none — `ai@^6.0.209`, React 19.2.4, vitest already present.

---

## Architecture Patterns

### Pattern 1: Per-tier boolean entitlement flag (THE established pattern)
**What:** Add a boolean to the `Entitlements` type + set it on each of the 4 tiers. Resolve via `getEntitlements(tier).<flag>`.
**When to use:** Any "feature X is available on plan Y" gate. This is exactly CHATMETER-02.
**Example (verified — `lib/entitlements.ts:31-34, 93-95`):**
```typescript
export type Entitlements = {
  // ...existing fields...
  whatsappEnabled: boolean
  pdfEnabled: boolean
  priceBookEnabled: boolean
  customDomainEnabled: boolean
  // ADD:
  chatEnabled: boolean   // CHATMETER-02 — in-app chat is a Pro/Business feature
}

export function getEntitlements(tier: string): Entitlements {
  return tiers[tier as TierName] ?? tiers.free   // defensive free fallback
}
```
Recommended per-tier values:
| Tier | `chatEnabled` | Rationale |
|------|---------------|-----------|
| free | `false` | The gate's whole point — free does NOT get chat |
| trial | `true` | Trial mirrors paid access for every flag except `customDomainEnabled`; showcase the feature |
| pro | `true` | "Pro/Business feature" |
| business | `true` | "Pro/Business feature" |

> NOTE on `as const satisfies`: `tiers` is declared `as const satisfies Record<TierName, Entitlements>` (line 86). Adding a field to the type REQUIRES adding it to all 4 tier literals or `satisfies` fails compilation — TypeScript enforces completeness for you (a feature, not a chore).

### Pattern 2: Route-level 403 channel/feature gate (THE security boundary)
**What:** After resolving tenant + reading the tier, return 403 with a JSON body + `upgradeUrl` if the feature is not entitled. The route is the real boundary — the page gate is convenience only.
**When to use:** Every entitlement-gated API route.
**Example (verified — `app/api/estimates/[id]/send-whatsapp/route.ts:80-86`):**
```typescript
const whatsappEnabled = getEntitlements((company.tier as string) ?? 'free').whatsappEnabled
if (!whatsappEnabled) {
  return NextResponse.json(
    { error: 'WhatsApp delivery is not available on your current plan.' },
    { status: 403 }
  )
}
```
**Insertion point for `/api/chat` (verified — the route ALREADY reads the company row at `route.ts:65-77`):** the cleanest change is to ADD `tier` to the existing `.select('industries, default_estimate_language')` and gate immediately after, BEFORE `resolveChatModel` / `buildChatTools` / `streamText` (so no model call or tool build happens for an unentitled tenant). Recommended shape:
```typescript
const { data: company } = await svc
  .from('companies')
  .select('industries, default_estimate_language, tier')   // + tier
  .eq('id', companyId)
  .maybeSingle()

const tier = (company as { tier?: string | null } | null)?.tier ?? 'free'
if (!getEntitlements(tier).chatEnabled) {
  return new Response(
    JSON.stringify({ error: 'chat_not_on_plan', upgradeUrl: '/settings/billing' }),
    { status: 403, headers: { 'content-type': 'application/json' } }
  )
}
```
> The chat route returns bare `new Response(...)` (not `NextResponse.json`) — match the file's existing style (`route.ts:51, 59`). Either works; consistency wins.

### Pattern 3: RSC page-level entitlement → upgrade prompt (UX, not security)
**What:** In the chat page RSC, resolve the tier and render an upgrade prompt component instead of `ChatWorkspace` when `!chatEnabled`. Do NOT redirect.
**When to use:** Gated full-page features where a dead/blocked UI would confuse the owner.
**Pattern reference (verified — `app/(app)/projects/[id]/page.tsx:128-139`):** the projects page already computes a server-side entitlement boolean (`whatsappSendEnabled`) by reading `getEntitlements(company.tier).whatsappEnabled` and passes it to the client component to gate UI. Mirror this in the chat page.
**Tier source in the chat page:** `page.tsx` currently reads only `claims`/conversations; it must additionally resolve the tier. Two verified options:
  1. Read it via the service client scoped to `getActiveCompanyId()` (mirrors the route), or
  2. Add a small read in the page. **`getActiveCompany()` does NOT return `tier`** (`lib/queries/active-company.ts:123` selects `id, name, logo_url, owner_name, theme_preference, industry, currency_code` — no `tier`). So the page must do its own `tier` read (service client `.from('companies').select('tier').eq('id', companyId)`), the same way the `(app)` layout reads `tier` via `requireServiceClient()` at `layout.tsx:69-73`.
**Recommended page shape:**
```typescript
// after resolving companyId via getActiveCompanyId()
const { data: row } = await requireServiceClient()
  .from('companies').select('tier').eq('id', companyId).maybeSingle()
const tier = (row as { tier?: string | null } | null)?.tier ?? 'free'
if (!getEntitlements(tier).chatEnabled) {
  return <ChatUpgradePrompt />   // a small new component with a /settings/billing CTA
}
// ...existing ChatWorkspace render unchanged...
```

### Pattern 4: Owner-only / never-customer-facing structure (already true — VERIFY it)
**What:** Chat lives ONLY under `app/(app)/chat/...` (the authenticated shell) and `app/api/chat/route.ts` (auth-gated). There is NO public/share route exposing chat. The verification is a STATIC/STRUCTURAL assertion, not a runtime test.
**Verified facts:**
- The `(app)` route group layout (`app/(app)/layout.tsx:32-53`) redirects unauthenticated → `/?auth=login` and no-company → `/onboarding` for ALL children, including `chat`.
- The route authenticates (`route.ts:46-54`) and resolves the tenant from the cookie, NEVER from the body (`route.ts:56-57`, the `company-SECRET` tripwire tested in `route.test.ts`).
- Public/share surfaces (e.g. `estimates/[id]/send-whatsapp`, share-token pages) are SEPARATE; none import or mount the chat.
**Recommended assertion (see Validation Architecture):** a static test that (a) the chat page file exists ONLY under `app/(app)/chat/`, (b) no file under any public route (`app/share`, `app/(public)`, `app/p`, etc. — confirm the actual public dir names) references `ChatWorkspace`/`/api/chat`, and (c) the route source contains the `getClaims`→401 + entitlement gate. This is the structural equivalent of the neutrality grep gate the project already uses (`tests/unit/agent-tools/neutrality.test.ts`, `tests/unit/chat/chat-ui-scope.test.ts`).

### Anti-Patterns to Avoid
- **Gating ONLY in the page (not the route).** The page gate is UX; a determined user can still POST to `/api/chat`. The route MUST be the enforcement boundary. (Mirror send-whatsapp: it gates in BOTH the projects page AND the route.)
- **Trusting tier from the request body.** Resolve tier from the company row keyed by the cookie-resolved `companyId`, never from client input (same posture as `T-lrf-01` already enforced for `companyId`).
- **Adding chat to the `UpgradeModal` 402 interceptor's URL allowlist.** That interceptor only fires on 402 from generate/analyze (`upgrade-modal.tsx:21-23`) and uses the `plan_limit_reached` error code. The chat gate is a 403 feature-gate, a different concern — handle its UX with a dedicated page prompt + (optionally) a client-side 403 toast, not by extending the quota interceptor. (See Open Question 1.)
- **A DB migration / new column for chat entitlement.** Entitlements are pure code constants — confirmed across all existing flags. No migration.
- **Redirecting away from `/chat` for unentitled users.** Loses the upsell moment; render an inline prompt.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-tier feature flag | A new config table / env flag / ad-hoc tier string compare | `Entitlements.chatEnabled` + `getEntitlements(tier)` | The one authoritative pattern; `satisfies` enforces all-tier completeness |
| "What's the company's tier?" | A new query helper | The existing service-client `companies.select('tier')` read (route already does the company read; layout already reads tier) | Two proven call sites; do not add a third pattern |
| Upgrade CTA / destination | A new pricing page or modal | `/settings/billing` + the existing upgrade-button/tier-cards components | Established conversion path used by every quota/limit affordance |
| Owner-auth on the page | A page-level auth check | The `(app)` layout already redirects unauthenticated + no-company | Auth is inherited; re-checking is redundant (the page only needs the TIER) |
| Tenant resolution | Reading company from the body | `getActiveCompanyId()` (cookie-trusted) | Already the route's posture; the `company-SECRET` tripwire test guards it |

**Key insight:** This phase has essentially zero greenfield surface. The risk is NOT "how do I build a gate" — it's "do I gate in the right place (route = boundary, page = UX) and do I avoid touching the frozen 124/125 code beyond the minimal insertion."

---

## Common Pitfalls

### Pitfall 1: Gating in the page but not the route (security hole)
**What goes wrong:** The page hides chat, but `POST /api/chat` still streams for a free-tier user who calls it directly.
**Why it happens:** The page change is more visible, so it feels "done."
**How to avoid:** The route 403 gate is the REQUIRED enforcement; the page prompt is additive UX. The plan must include BOTH, and the route gate must come before `resolveChatModel`/`streamText`.
**Warning signs:** A test that only asserts the page render and not the route 403.

### Pitfall 2: Assuming `getActiveCompany()` carries the tier
**What goes wrong:** Page reads `company.tier` and gets `undefined` → `getEntitlements(undefined)` falls back to `free` → chat is wrongly blocked for paying users.
**Why it happens:** `getActiveCompany()` (`active-company.ts:123`) selects only `id, name, logo_url, owner_name, theme_preference, industry, currency_code` — **no `tier`**.
**How to avoid:** The chat page must do its own `tier` read (service client `companies.select('tier')`), exactly like `app/(app)/layout.tsx:69-73` does. Do not rely on `getActiveCompany()`.
**Warning signs:** `chatEnabled` resolving to false for a pro/business test fixture.

### Pitfall 3: Reusing the 402 `UpgradeModal` interceptor for chat
**What goes wrong:** Expecting the global upgrade toast to fire when chat returns its gate response — it won't.
**Why it happens:** `UpgradeModal` (`upgrade-modal.tsx`) only intercepts **402** responses whose URL includes `/api/generate-estimate` or `/api/analyze-photos`, and only acts on `error === 'plan_limit_reached'`. A 403 from `/api/chat` is ignored by it.
**How to avoid:** Handle the chat gate's UX with the page-level prompt (the primary affordance, since an unentitled user shouldn't reach the live chat at all). If you also want a client-side toast when a 403 sneaks through (e.g. a tier downgrade mid-session), add explicit handling in the chat client (`components/chat/chat-thread.tsx`) — but the page prompt should make that path rare. Do NOT silently extend the quota interceptor.
**Warning signs:** A plan task that says "the existing UpgradeModal handles it."

### Pitfall 4: Touching frozen 124/125 code beyond the gate (scope creep)
**What goes wrong:** Refactoring the route or workspace breaks the byte-stable scope-fence tests (`tests/unit/chat/chat-ui-scope.test.ts`, `route.test.ts`).
**Why it happens:** "While I'm here" edits.
**How to avoid:** The ONLY route change is `+ tier` in the existing select and the gate block before model resolution. The ONLY page change is the tier read + conditional prompt render. Nothing else in `route.ts` / `chat-workspace.tsx` / `chat-thread.tsx` changes.
**Warning signs:** Diff in `route.ts` touching the `streamText`/`onFinish` block; diff in `ChatWorkspace`.

### Pitfall 5: Edge runtime / `requireServiceClient` in the page
**What goes wrong:** Service client unavailable or wrong runtime.
**Why it happens:** Copy-pasting without checking the page's runtime.
**How to avoid:** The route is explicitly the DEFAULT Node runtime (`route.ts:24-27` doc) and the page is `force-dynamic` RSC — both support `requireServiceClient()`. The layout already calls `requireServiceClient()` in the same shell, so the pattern is proven. No edge opt-in.

---

## Code Examples

### Resolve tier + gate (route — the security boundary)
```typescript
// app/api/chat/route.ts — extend the EXISTING company read (route.ts:65-77)
import { getEntitlements } from '@/lib/entitlements'

const { data: company } = await svc
  .from('companies')
  .select('industries, default_estimate_language, tier')   // + tier
  .eq('id', companyId)
  .maybeSingle()

const tier = (company as { tier?: string | null } | null)?.tier ?? 'free'
if (!getEntitlements(tier).chatEnabled) {
  return new Response(
    JSON.stringify({ error: 'chat_not_on_plan', upgradeUrl: '/settings/billing' }),
    { status: 403, headers: { 'content-type': 'application/json' } }
  )
}
// ...existing resolveChatModel / buildChatTools / streamText unchanged...
```

### Resolve tier + render upgrade prompt (page — UX)
```typescript
// app/(app)/chat/[[...id]]/page.tsx
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireServiceClient } from '@/lib/supabase/service'
import { getEntitlements } from '@/lib/entitlements'

const companyId = await getActiveCompanyId()      // tenant (cookie-trusted)
const { data: row } = await requireServiceClient()
  .from('companies').select('tier').eq('id', companyId!).maybeSingle()
const tier = (row as { tier?: string | null } | null)?.tier ?? 'free'
if (!getEntitlements(tier).chatEnabled) {
  return <ChatUpgradePrompt />   // small new component, CTA → /settings/billing
}
// ...existing listConversations / ChatWorkspace render unchanged...
```

### Add the flag (entitlements)
```typescript
// lib/entitlements.ts — add to the type AND all four tier literals
// free.chatEnabled = false; trial/pro/business.chatEnabled = true
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| n/a | The `Entitlements` boolean-flag + `getEntitlements` pattern | Phase 55 (tier definitions) | Stable; this phase just adds one more flag |

No deprecated/outdated mechanisms involved.

---

## Open Questions

1. **Client-side 403 handling on the chat surface.**
   - What we know: The page prompt prevents unentitled users from reaching the live chat in normal flow. The global `UpgradeModal` will NOT catch the chat 403.
   - What's unclear: Whether a 403 can occur mid-session (e.g. a tier downgrade between page load and a send) and whether that edge case warrants explicit toast handling in `chat-thread.tsx`.
   - Recommendation: Implement the route 403 + page prompt as the spec. Treat mid-session-403 toast handling as OPTIONAL polish — include it only if low-cost; the page prompt covers the dominant path.

2. **Exact public-route directory names for the structural "never customer-facing" assertion.**
   - What we know: Chat is only under `app/(app)/chat/` and `app/api/chat/`. Public/share surfaces are separate.
   - What's unclear: The exact set of public route dirs to scan in the negative assertion (e.g. `app/share`, `app/(public)`, share-token pages) — needs a quick `Glob`/`ls` of `app/` during planning to enumerate them.
   - Recommendation: During planning, enumerate `app/` top-level route groups; the test asserts none of the public/share dirs reference `ChatWorkspace` / `/api/chat`. Model it on `tests/unit/chat/chat-ui-scope.test.ts` (the existing static scope-fence test).

3. **Error code naming for the route 403.**
   - What we know: Quota uses `plan_limit_reached`; the WhatsApp gate uses a human string with no code.
   - Recommendation: Use a stable machine code `chat_not_on_plan` + `upgradeUrl` (more testable than a prose string), but this is low-stakes — pick during planning.

---

## Environment Availability

> SKIPPED rationale: This phase is purely code-level (TypeScript flag + route/page gate + static test). No new external tool, service, runtime, database, or CLI dependency is introduced. `ai`, vitest, React, and Supabase clients are already present and exercised by Phases 124/125.

No external dependencies to probe.

---

## Validation Architecture

> nyquist_validation is enabled (`config.json` `workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`vitest run`) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/chat tests/unit/entitlements.test.ts` |
| Full suite command | `npx vitest run` |

Existing chat test infra (`tests/unit/chat/`): `route.test.ts` (route behavior — the harness to EXTEND for the 403 gate), `chat-ui-scope.test.ts` (static scope-fence — the model for the never-customer-facing assertion), `provider.test.ts`, `tools.test.ts`, plus the UI tests. `tests/unit/entitlements.test.ts` is the model for the new tier-flag tests.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| CHATMETER-02 | `chatEnabled` is false on free, true on trial/pro/business | unit | `npx vitest run tests/unit/entitlements.test.ts` | ✅ extend (add cases to existing file) |
| CHATMETER-02 | `/api/chat` returns 403 `chat_not_on_plan` for a free-tier company; 200 for pro/business | unit | `npx vitest run tests/unit/chat/route.test.ts` | ✅ extend (add cases; harness already mocks auth/active-company/service client/provider) |
| CHATMETER-02 | `/api/chat` gate runs BEFORE `resolveChatModel`/`buildChatTools` (no model build for unentitled) | unit | `npx vitest run tests/unit/chat/route.test.ts` | ✅ extend (assert `resolveChatModelMock` not called on free tier — mirrors the existing 401/no-company assertions) |
| CHATMETER-02 | Chat page renders an upgrade prompt (not `ChatWorkspace`) when not entitled | unit | `npx vitest run tests/unit/chat/<chat-page-gate.test.ts>` | ❌ Wave 0 (new file; or extend an existing page test if one is added) |
| CHATMETER-02 | Structural: chat is referenced ONLY under `app/(app)/chat` + `app/api/chat`; no public/share route references it | unit (static `readFileSync`/glob) | `npx vitest run tests/unit/chat/<chat-access-scope.test.ts>` | ❌ Wave 0 (new file; model on `chat-ui-scope.test.ts`) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/chat tests/unit/entitlements.test.ts`
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`. Watch the KNOWN parallel-only `mcp-route-contract.test.ts` GET-405 flake (passes 8/8 in isolation; not caused by this phase).

### Wave 0 Gaps
- [ ] `tests/unit/chat/chat-access-scope.test.ts` — structural "never customer-facing" assertion (chat only under `app/(app)/chat` + `app/api/chat`; no public/share route references `ChatWorkspace`/`/api/chat`); model on existing `chat-ui-scope.test.ts`. Covers CHATMETER-02 (owner-only verification).
- [ ] Page-gate test — assert the chat page renders the upgrade prompt when `chatEnabled` is false (mock the tier read). May be a new file or folded into an extended page test.
- [ ] Extend `tests/unit/entitlements.test.ts` — `chatEnabled` per-tier cases (free false; trial/pro/business true).
- [ ] Extend `tests/unit/chat/route.test.ts` — 403-on-free + 200-on-pro + "no model build when unentitled" cases (the harness already provides every mock needed; add `tier` to the mocked companies row).

*(Framework install: none — vitest present.)*

---

## Sources

### Primary (HIGH confidence) — all direct codebase reads
- `lib/entitlements.ts` — `Entitlements` type, the 4 tier literals, `getEntitlements`, the `as const satisfies` enforcement.
- `app/api/chat/route.ts` — auth (401), active-company (400), the existing service-client company read (the gate insertion point), Node-runtime note.
- `app/(app)/chat/[[...id]]/page.tsx` — the RSC chat surface; auth inherited from `(app)` layout; no tier read today.
- `app/(app)/layout.tsx` — `(app)` shell auth redirects + the proven `requireServiceClient().select('tier')` read pattern.
- `app/api/estimates/[id]/send-whatsapp/route.ts` — the 403 channel-gate pattern (`getEntitlements(tier).whatsappEnabled` → 403).
- `app/api/generate-estimate/route.ts` — the 402 quota-block + `upgradeUrl: '/settings/billing'` pattern.
- `app/(app)/projects/[id]/page.tsx` — server-side entitlement boolean (`whatsappSendEnabled`) computed from `getEntitlements` and passed to the UI (the page-gate precedent).
- `components/billing/upgrade-modal.tsx` — the global 402 fetch-interceptor (scope + error-code limits → Pitfall 3).
- `lib/queries/active-company.ts` — `getActiveCompanyId()` (tenant) + `getActiveCompany()` select list (confirms NO `tier` → Pitfall 2).
- `lib/quota.ts` — `checkQuota`/`getEntitlements` usage (the quota vs. entitlement distinction).
- `tests/unit/entitlements.test.ts`, `tests/unit/chat/route.test.ts`, `tests/unit/chat/chat-ui-scope.test.ts` — the test harnesses/models to extend.
- `.planning/REQUIREMENTS.md` (CHATMETER-02), `.planning/seeds/SEED-034-...md` (Decision #4 owner-only + §6 tier gate), `.planning/STATE.md` (locked guardrails, Phase 126 scope), `config.json` (nyquist enabled).
- `CLAUDE.md` — secret-handling + GSD/deploy guardrails.

### Secondary / Tertiary
- None — no external research required; the phase is a pure application of existing in-repo patterns.

---

## Project Constraints (from CLAUDE.md)
- **No secrets in code/docs/planning** — use placeholders. (No secrets involved in this phase.)
- **Tech stack:** Next.js 14+ App Router, TypeScript strict, Tailwind, shadcn/ui — all already in use; the upgrade prompt must use shadcn/Tailwind.
- **Security:** service role key never in the browser; all gating server-side (the route + the RSC page both run server-side — compliant).
- **GSD workflow:** edits only through a GSD command (this phase runs under `/gsd:plan-phase` → `/gsd:execute-phase`).
- **Deploy:** CI→GHCR→Coolify, never build on the VPS. (No migration here, so no deploy-ordering concern.)

---

## Metadata

**Confidence breakdown:**
- Entitlement model + flag: HIGH — the exact pattern exists 4× in `lib/entitlements.ts`; adding a 5th flag is mechanical.
- Route gate: HIGH — verbatim precedent in `send-whatsapp/route.ts`; insertion point already reads the company row.
- Page gate / upgrade UX: HIGH — precedent in `projects/[id]/page.tsx` + the `(app)` layout tier read; one new small prompt component is the only greenfield.
- Owner-only / never-customer-facing verification: HIGH — structurally already true (`(app)` group + auth-gated route); the static-assertion model exists (`chat-ui-scope.test.ts`).
- Open items: the exact public-route dir names to scan (enumerate during planning) and optional mid-session-403 toast.

**Research date:** 2026-06-25
**Valid until:** ~2026-07-25 (stable — internal patterns, no fast-moving external deps)
