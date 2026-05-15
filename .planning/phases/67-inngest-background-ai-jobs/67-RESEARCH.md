# Phase 66: Inngest Background AI Jobs - Research

**Researched:** 2026-05-15
**Domain:** Background job orchestration for long-running AI calls in a Next.js 16 App Router app
**Confidence:** HIGH (Inngest SDK + serve handler + step.run patterns verified against official docs; polling pattern verified)

## Summary

Phase 66 introduces Inngest as the background job runner for the three long-running AI flows (Whisper transcription, Claude Vision photo analysis, Claude estimate generation) plus the WhatsApp inbound handler. Today these calls happen synchronously inside Next.js API routes / server actions and take 20-60s — far longer than Vercel Free's 10s function timeout. After this phase, every entry point dispatches an Inngest event and returns a job identifier in <1s; the actual AI work runs inside an Inngest function with retries, idempotent step checkpoints, and observability for free.

Inngest's official Next.js App Router setup is exactly what's needed: a single `app/api/inngest/route.ts` that exports `GET`, `POST`, `PUT` from `serve({ client, functions })`. Functions are created with `inngest.createFunction({ id, idempotency, ... }, { event }, async ({ event, step }) => …)`. Each external API call is wrapped in `await step.run('id', async () => …)` so retries skip already-checkpointed work — meaning no double-charges to OpenAI/Anthropic. The free tier (50,000 monthly executions; verified 2026-05-15, not the 5k assumed in the prompt) is more than enough headroom for MVP.

Frontend status updates use the documented "send event → poll the REST API" pattern: `inngest.send()` returns event IDs; `GET https://api.inngest.com/v1/events/{eventId}/runs` (Bearer-auth with `INNGEST_SIGNING_KEY`) returns runs with `status` ∈ {Running, Completed, Failed, Cancelled} and a serialized `output`. Wrap that in a `GET /api/jobs/[jobId]` route so the browser never sees the signing key, and the existing `CaptureStepper` consumes it via `setInterval(fetch, 1500)`.

**Primary recommendation:** Add `inngest@^4.4.0`, create `lib/inngest/client.ts` + `app/api/inngest/route.ts`, define three event-driven functions (`transcribeAudioJob`, `analyzePhotosJob`, `generateEstimateJob`) that wrap each external call in `step.run()`, change the three API routes to `inngest.send()` + return `{ jobId: ids[0] }`, refactor `lib/whatsapp/handler.ts` to dispatch instead of awaiting Whisper/Vision inline, and add a `GET /api/jobs/[jobId]` proxy that calls the Inngest REST API server-side. Keep the synchronous code path completely removed — there's no benefit to a parallel "compatibility" path because the routes already use a service-layer module (`lib/services/generate-estimate.ts`) the Inngest functions reuse verbatim.

## User Constraints (from CONTEXT.md)

> No CONTEXT.md exists for Phase 66 (this research is the discovery step before discuss). Constraints below are extracted from REQUIREMENTS.md, ROADMAP.md, the prompt's "Critical context" section, and CLAUDE.md.

### Locked Decisions
- **Vercel Free is MVP host** — Inngest is the chosen mitigation for the 10s function timeout (REQUIREMENTS.md "Key Decisions" #1).
- **Inngest stays even after Hetzner migration** — chosen for retries, observability, concurrency, step functions; BullMQ + Redis explicitly deferred (Key Decisions #2).
- **No actual production deploy in this milestone** — every test runs against localhost (Key Decisions #5).
- **Service-layer reuse** — `lib/services/generate-estimate.ts` (Phase 41) is the canonical estimate pipeline; Inngest functions call it, not a fork.
- **Quota recording rules** — `recordUsage()` happens **after** successful Inngest job completion, not on dispatch (INNGEST-02 explicit).
- **Idempotency keys** — explicit `idempotencyKey` per job event. WhatsApp uses `wamid` (message_id) as the natural key; web requests generate one with `crypto.randomUUID()`.
- **WhatsApp webhook ack** — must stay <10s (Meta retries otherwise). Currently uses `after()` from `next/server`, but Whisper + Vision still run on the serverless function and risk 10s timeout. Inngest replaces those inline calls (INNGEST-07).
- **Local dev tool** — `npx inngest-cli dev`; `dev:inngest` package script; documented in README.

### Claude's Discretion
- **Job state storage strategy** — Inngest's REST API exposes run status; whether to additionally persist a `jobs` table in Supabase for richer UI state is a design call (recommendation in §Architecture below).
- **Frontend status delivery** — polling vs Inngest Realtime (`useRealtime` React hook). Recommendation in §Architecture.
- **Migration strategy** — atomic swap vs parallel paths. Recommendation: atomic swap (parallel paths add bug surface for zero benefit because the underlying service layer is unchanged).
- **Step granularity** — how many `step.run()` blocks per function (single block vs split per external call vs per logical sub-task). Recommendation in §Architecture.
- **Error UI** — how the failure surfaces in the capture stepper (`CaptureFailure` component already exists; just needs to be triggered by polling response).

### Deferred Ideas (OUT OF SCOPE)
- BullMQ + Redis as Inngest replacement (Key Decisions #2 — explicitly deferred).
- Server-Sent Events / WebSocket realtime for status (polling is the chosen MVP approach; Realtime is a follow-up).
- Concurrency limits / throttling per company (no per-tenant rate limit beyond what `lib/ratelimit.ts` already enforces at the API entry point).
- Job cancellation UI (no "cancel" button; user can just close the tab).
- Persisting Inngest run history in Supabase for analytics (Inngest dashboard covers this).
- Background jobs for non-AI work (PDF generation, Resend email, Stripe webhooks all stay synchronous — they finish well inside 10s).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INNGEST-01 | `inngest` SDK installed; `lib/inngest/client.ts`; `app/api/inngest/route.ts` registers worker functions | §Standard Stack (inngest@4.4.0); §Architecture Pattern 1 (client + serve handler); §Code Examples |
| INNGEST-02 | `/api/generate-estimate` returns `{ jobId }` in <1s; `usage_events` recorded only on job success | §Architecture Pattern 2 (dispatch route); §Architecture Pattern 3 (recordUsage moves into the function's final step) |
| INNGEST-03 | `/api/transcribe` POST returns `{ jobId }` — Whisper moved to `transcribeAudioJob` | §Architecture Pattern 2; note: this route doesn't exist yet — currently `transcribeRecording()` is a server action in `lib/actions/recording.ts` |
| INNGEST-04 | `/api/analyze-photos` POST returns `{ jobId }` — Vision moved to `analyzePhotosJob` | §Architecture Pattern 2; current route uses `Promise.allSettled` over photos — Inngest version uses one `step.run` per photo |
| INNGEST-05 | Frontend polls `GET /api/jobs/[jobId]`; capture flow shows real Inngest stepper | §Architecture Pattern 4 (status proxy route); §Code Examples (poll loop) |
| INNGEST-06 | Idempotent — `step.run()` per external call; explicit `idempotencyKey` per job | §Architecture Pattern 5 (idempotency at two layers); §Pitfalls (idempotency caveats) |
| INNGEST-07 | WhatsApp inbound handler dispatches via Inngest, not awaited inline | §Architecture Pattern 6 (handler refactor); current handler.ts:330-372 (handleAudioMessage) and :375-442 (handleImageMessage) become `inngest.send()` calls |
| INNGEST-08 | Local dev — `npx inngest-cli dev` + `dev:inngest` script; signing key dev/prod separation | §Standard Stack (inngest-cli); §Code Examples (package.json scripts); §Sources (local-development URL) |

## Project Constraints (from CLAUDE.md)

- **Tech Stack pinned** — Next.js 16.2.3 (App Router), TypeScript strict, Tailwind 4, shadcn/ui, react-hook-form + zod. Inngest must work with App Router route handlers (it does — official `inngest/next` adapter).
- **AI providers** — Anthropic Claude `claude-sonnet-4-20250514` for estimates + photo analysis (multi-provider via `lib/ai/`); OpenAI Whisper `whisper-1` for audio transcription. All keys come from `getIntegrationKey()` in `lib/platform-config.ts` (DB-backed, AES-GCM encrypted) — Inngest functions must use the same loader, not env vars.
- **Service role key never exposed to browser** — `GET /api/jobs/[jobId]` is the only place where the `INNGEST_SIGNING_KEY` is read; the browser only sees the proxied JSON.
- **Secret Handling (CRITICAL)** — `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` go in `.env.local` only. Never in markdown, never in commits. Pre-commit hook `gitleaks` doesn't currently match `signkey-*` or `signkey_*` patterns — when documenting setup, use placeholders like `signkey-prod-<your-key>` and `signkey-test-<your-key>`. Add the patterns to gitleaks config if available.
- **GSD workflow enforced** — implementation must go through `/gsd:execute-phase`, not direct edits.
- **All AI calls server-side** — Inngest functions run on the server (Vercel function or Hetzner container later); browser never invokes Anthropic/OpenAI directly. ✓ this is preserved.
- **Single-vendor preference** — Supabase for auth/DB/storage, Resend for email. Inngest is a new third-party. Acceptable because (a) it solves a real timeout problem; (b) it's portable to Hetzner without code change (only callback URL update).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `inngest` | ^4.4.0 (latest as of 2026-05-15, published 2026-05-13) | Event-driven background functions; ships `inngest/next` adapter for App Router | Official SDK; the Next.js quick-start docs target this exact import path |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `inngest-cli` | latest (curl install or `npx`) | Local dev server on port 8288; auto-discovers `serve` handler at `/api/inngest`; renders dashboard for testing event flows | Required for local dev (INNGEST-08); not a runtime dep |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inngest | Trigger.dev | Similar feature set; slightly less mature Next.js story; same lock-in |
| Inngest | BullMQ + Redis (self-hosted) | Cheapest at scale; but requires Redis ops + own dashboard; defeats the "ship in v3.1.1 + reuse on Hetzner" goal — explicitly deferred per Key Decision #2 |
| Inngest | Vercel Queues / Cron only | Vercel Cron alone can't do retries + observability; Vercel Queues is in beta and not portable to Hetzner |
| Polling `/api/jobs/[id]` | Inngest Realtime (`useRealtime` React hook over WebSocket) | Realtime is more elegant but adds a token-mint endpoint, WebSocket connection management, and more code. MVP polling at 1.5s intervals is fine — voice flow is short-lived (60s typical) so overhead is bounded |
| Polling | Server-Sent Events from a custom Next.js route | SSE on Vercel Free works but each open connection counts against function-invocation budget; polling is cheaper |

**Installation:**
```bash
npm install inngest
# inngest-cli for local dev (one-time, global):
curl -sSfL https://cli.inngest.com/install.sh | sh
# OR per-project via npx (no install):
# npx inngest-cli@latest dev -u http://localhost:9633/api/inngest
```

**Version verification:**
```bash
npm view inngest version
# → 4.4.0  (verified 2026-05-15)
```
- `inngest@4.4.0` published 2026-05-13 (most recent stable on the dist-tag `latest`).
- 4.x is the current major; the API surface used here (`createFunction`, `step.run`, `serve` from `inngest/next`) is stable across the 4.x line.

## Architecture Patterns

### Recommended Project Structure

```
lib/
└── inngest/
    ├── client.ts              # exports `inngest = new Inngest({ id: 'xtimator', ... })`
    ├── functions/
    │   ├── index.ts           # barrel export — listed in serve({ functions: [...] })
    │   ├── transcribe-audio.ts        # transcribeAudioJob — wraps Whisper
    │   ├── analyze-photos.ts          # analyzePhotosJob   — wraps Claude Vision
    │   ├── generate-estimate.ts       # generateEstimateJob — calls lib/services/generate-estimate.ts
    │   └── whatsapp-process.ts        # whatsAppProcessJob — replaces the inline path in handler.ts
    └── events.ts              # event name + payload type constants (zod schemas optional)

app/api/
├── inngest/route.ts           # the single serve handler (GET/POST/PUT)
├── jobs/[jobId]/route.ts      # status proxy — calls Inngest REST API server-side
├── transcribe/route.ts        # NEW — dispatches transcribeAudioJob
├── generate-estimate/route.ts # MODIFIED — returns { jobId } instead of full estimate
└── analyze-photos/route.ts    # MODIFIED — returns { jobId }
```

### Pattern 1: The serve handler + client (INNGEST-01)

The Inngest client is a singleton; the serve handler is one file with one purpose.

```typescript
// lib/inngest/client.ts
import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'xtimator',
  // INNGEST_EVENT_KEY env var is auto-detected; explicit prop only if needed.
})
```

```typescript
// app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import {
  transcribeAudioJob,
  analyzePhotosJob,
  generateEstimateJob,
  whatsAppProcessJob,
} from '@/lib/inngest/functions'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    transcribeAudioJob,
    analyzePhotosJob,
    generateEstimateJob,
    whatsAppProcessJob,
  ],
  // streaming: 'allow',  // optional — extends max function duration on Vercel
})
```

**Source:** [Inngest Next.js Quick Start](https://www.inngest.com/docs/getting-started/nextjs-quick-start) — verified the `GET, POST, PUT` triplet and `serve({ client, functions })` signature.

### Pattern 2: API route → dispatch → return jobId in <1s (INNGEST-02/03/04)

Pre-flight checks (auth, rate limit, quota check) stay synchronous in the route. The expensive AI call moves into the Inngest function. The route returns the event ID as the job ID.

```typescript
// app/api/generate-estimate/route.ts (refactored)
import { NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest/client'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/ratelimit'
import { XtimatorError, asResponse } from '@/lib/errors'
import { checkQuota } from '@/lib/quota'

export async function POST(request: Request) {
  const requestId = crypto.randomUUID()
  try {
    // 1. Auth + rate limit + quota check (all synchronous, fast)
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) throw new XtimatorError('unauthorized', 'auth', 'Not authenticated')

    const userId = claims.sub
    // ... rate limit checks (unchanged) ...

    const { data: companyRow } = await supabase
      .from('companies').select('id').eq('user_id', userId).single()
    if (!companyRow) throw new XtimatorError('not_found', 'company', 'No company found')
    const companyId = companyRow.id as string

    const { allowed } = await checkQuota(supabase, companyId, 'estimate')
    if (!allowed) {
      return NextResponse.json(
        { error: 'plan_limit_reached', upgradeUrl: '/settings/billing' },
        { status: 402 }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body?.projectId) throw new XtimatorError('bad_request', 'estimates', 'projectId is required')

    // 2. Dispatch — this is the only "work" left in the route
    const { ids } = await inngest.send({
      name: 'estimate/generate.requested',
      data: { companyId, projectId: body.projectId, requestId },
      // Event-level idempotency key — same projectId+requestId never runs twice in 24h
      id: `estimate-${body.projectId}-${requestId}`,
    })

    return NextResponse.json({ jobId: ids[0] }, { status: 202 })
  } catch (error) {
    return asResponse(error)
  }
}
```

**Note:** HTTP 202 Accepted (not 200) is the semantically correct status for "the request was accepted but processing is asynchronous."

### Pattern 3: The Inngest function — quota recording in the final step

```typescript
// lib/inngest/functions/generate-estimate.ts
import { inngest } from '@/lib/inngest/client'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { requireServiceClient } from '@/lib/supabase/service'
import { recordUsage } from '@/lib/quota'

export const generateEstimateJob = inngest.createFunction(
  {
    id: 'generate-estimate',
    // Function-level idempotency — CEL expression on event data
    idempotency: 'event.data.requestId',
    retries: 2,  // default 4; AI calls are expensive — fewer retries
  },
  { event: 'estimate/generate.requested' },
  async ({ event, step, logger }) => {
    const { companyId, projectId, requestId } = event.data as {
      companyId: string
      projectId: string
      requestId: string
    }

    // step.run() checkpoints the result. If a later step fails and the function
    // retries, this block is SKIPPED (already-successful output replayed from
    // the SDK's run history) — so Anthropic is not re-charged.
    const result = await step.run('call-ai-provider', async () => {
      return await generateEstimateForProject(companyId, projectId)
    })

    // Record usage in its own step — if Anthropic succeeded but DB write fails,
    // a retry skips the AI call and just retries the recordUsage step.
    await step.run('record-usage', async () => {
      const supabase = requireServiceClient()
      await recordUsage(supabase, companyId, 'estimate_generated', 1, requestId)
    })

    return result  // { estimateId, version, clientSuggestion, language }
  }
)
```

**Why two `step.run()` blocks instead of one?** Per the docs: "step.run() return values are serialized as JSON; the step ID is used to memoize state across function versions." A single `step.run()` wrapping both the AI call and the DB write means a DB-write failure forces a re-run of the AI call. Splitting them makes each independently retriable. **This is the central reason Inngest exists** for this use case.

**Sources:** [createFunction reference](https://www.inngest.com/docs/reference/functions/create), [step.run reference](https://www.inngest.com/docs/reference/functions/step-run), [Idempotency guide](https://www.inngest.com/docs/guides/handling-idempotency).

### Pattern 4: Status proxy route — `GET /api/jobs/[jobId]` (INNGEST-05)

The browser never gets the Inngest signing key. The Next.js route fetches run status from Inngest's REST API server-side.

```typescript
// app/api/jobs/[jobId]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const INNGEST_API = 'https://api.inngest.com/v1'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { jobId } = await params
  const signingKey = process.env.INNGEST_SIGNING_KEY
  if (!signingKey) {
    return NextResponse.json({ error: 'Inngest not configured' }, { status: 503 })
  }

  // jobId is the event ID returned from inngest.send()
  const res = await fetch(`${INNGEST_API}/events/${jobId}/runs`, {
    headers: { Authorization: `Bearer ${signingKey}` },
    // Disable Next.js cache — status changes constantly
    cache: 'no-store',
  })
  if (!res.ok) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  const json = await res.json()
  const run = json.data?.[0]
  if (!run) {
    // Event accepted but function hasn't started yet — treat as "running"
    return NextResponse.json({ status: 'Running', output: null })
  }
  return NextResponse.json({
    status: run.status,        // 'Running' | 'Completed' | 'Failed' | 'Cancelled'
    output: run.output ?? null, // serialized return value of the function
  })
}
```

**Source:** [Fetch run status and output](https://www.inngest.com/docs/examples/fetch-run-status-and-output) — verified endpoint URL, auth header format, status enum, polling pattern.

**Critical:** the proxy MUST also do an authorization check — verify the user owns the project this job belongs to. Easiest: include `companyId` in the original event payload and have the proxy refuse jobs whose run-output `companyId` doesn't match the requesting user's company. For MVP a simpler check is "user is signed in" (above); tighten before any production deploy.

### Pattern 5: Idempotency at TWO layers (INNGEST-06)

| Layer | Where set | Format | When it fires | What it prevents |
|-------|-----------|--------|---------------|------------------|
| Event-level | `inngest.send({ id: '…' })` | Free-form unique string per dispatch | Producer side — duplicate sends with same `id` in 24h are stored but don't trigger functions | User double-clicks "Generate Estimate" → only one event reaches the queue |
| Function-level | `createFunction({ idempotency: 'event.data.requestId' })` | CEL expression on event data | Consumer side — same key already running won't trigger a second run within 24h | Two different events that resolve to the same key (e.g., a retry from a different code path) only execute once |

For Xtimator:
- Web requests: event-level `id = 'estimate-{projectId}-{requestId}'` where `requestId` is `crypto.randomUUID()` per HTTP request. Function-level `idempotency = 'event.data.requestId'`.
- WhatsApp: event-level `id = 'estimate-{projectId}-{wamid}'` where `wamid` is the Meta message_id (already used for dedup at the `whatsapp_processed_messages` table). Function-level idempotency uses the same key.
- Whisper: event-level `id = 'transcribe-{recordingId}'` (recording UUID is already unique). Function-level same.

**Source:** [Handling idempotency](https://www.inngest.com/docs/guides/handling-idempotency).

### Pattern 6: WhatsApp handler refactor (INNGEST-07)

Today, `lib/whatsapp/handler.ts` runs Whisper + Vision + estimate generation **inline** inside `processInboundMessages()`. The webhook ack returns first (because of `after()` from `next/server`), but the work continues on the serverless function — which still hits the 10s wall on Vercel Free for long audio.

The refactor: `processInboundMessages()` becomes a dispatcher.

```typescript
// lib/whatsapp/handler.ts (after refactor — sketch)
export async function processInboundMessages(
  messages: WhatsAppMessage[],
  companyId: string,
  fromPhone: string,
  supabase: SupabaseClient
): Promise<void> {
  // Quota check + project draft creation stay here (cheap, <1s)
  // ... existing entitlements check ...
  // ... existing project insert ...

  // For each message, dispatch the right Inngest event instead of awaiting
  const events = messages.map((message) => {
    if (message.type === 'audio') {
      return {
        name: 'whatsapp/audio.received',
        id: `wa-audio-${message.id}`,
        data: { companyId, projectId, message, ownerPhone: `+${fromPhone}` },
      }
    }
    if (message.type === 'image') {
      return {
        name: 'whatsapp/image.received',
        id: `wa-image-${message.id}`,
        data: { companyId, projectId, message, ownerPhone: `+${fromPhone}` },
      }
    }
    return {
      name: 'whatsapp/text.received',
      id: `wa-text-${message.id}`,
      data: { companyId, projectId, message, ownerPhone: `+${fromPhone}` },
    }
  })

  await inngest.send(events)

  // A FINAL Inngest function (whatsAppFinalizeJob) waits for all per-message
  // jobs to complete (step.waitForEvent), then calls generateEstimateForProject,
  // sends confirmation. Triggered by a separate event after dispatch:
  await inngest.send({
    name: 'whatsapp/batch.finalize',
    id: `wa-finalize-${messages[messages.length - 1].id}`,
    data: { companyId, projectId, ownerPhone: `+${fromPhone}`, messageIds: messages.map(m => m.id) },
  })
}
```

The Inngest function `whatsAppFinalizeJob` does:
1. `step.waitForEvent()` for each `messageIds` to receive its corresponding `*.processed` event (or just use `step.sleep` and DB-poll for simplicity in MVP).
2. `step.run('generate', () => generateEstimateForProject(...))`
3. `step.run('confirm', () => sendWhatsAppMessage(ownerPhone, …))`

**Simpler MVP alternative (recommended for v3.1.1):** Skip the `waitForEvent()` orchestration. Each per-message handler stores its result in the existing `recordings` / `photos` tables. The WhatsApp dispatcher fires ONE event after all per-message events: `whatsapp/process.requested`. That single function handles everything sequentially using `step.run`:

```typescript
export const whatsAppProcessJob = inngest.createFunction(
  { id: 'whatsapp-process', idempotency: 'event.data.batchKey', retries: 1 },
  { event: 'whatsapp/process.requested' },
  async ({ event, step }) => {
    const { companyId, projectId, messages, ownerPhone } = event.data

    // One step per message — independently retriable
    for (const msg of messages) {
      await step.run(`process-${msg.id}`, async () => {
        // Whisper / Vision / text save
      })
    }

    const result = await step.run('generate-estimate', () =>
      generateEstimateForProject(companyId, projectId)
    )

    await step.run('confirm', () =>
      sendConfirmationToOwner(ownerPhone, result.estimateId)
    )

    return result
  }
)
```

This collapses the entire current `processInboundMessages` body into one Inngest function with N+2 steps. The webhook handler just collects messages from the debounce buffer and fires ONE event.

### Anti-Patterns to Avoid

- **Awaiting `step.run()` inside a loop without `.run()` per iteration.** `for (const x of items) await someExternalCall(x)` outside `step.run` will re-execute on every retry. Wrap each iteration: `await step.run(\`process-${x.id}\`, () => …)`. Each gets its own retry counter.
- **Putting non-deterministic code outside `step.run()`.** `Date.now()`, `Math.random()`, DB calls, fetches all need to be inside a `step.run()` or wrapped in `step.run` if their result feeds later logic, because the function body is replayed on each retry up to the next un-checkpointed step.
- **Forgetting `await` on `step.run`.** Without await the step doesn't execute as part of the run; the function returns prematurely.
- **Reading secrets at module scope.** `const key = process.env.INNGEST_SIGNING_KEY` at module top runs at deploy time on Vercel — fine for env-driven, but follow the existing `getIntegrationKey()` convention (DB-backed, AES-GCM) for AI provider keys. Only Inngest's own keys (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`) come from env, because Inngest itself ships the integration.
- **Calling `inngest.send()` from a Client Component.** The client should call your `/api/...` route, which then dispatches. Never expose the event key to the browser.
- **Returning huge payloads from `step.run()`.** Outputs are JSON-serialized and stored. The `output` field in run history has a size limit. Don't return whole base64 image buffers — return references (storage paths, IDs).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Background job queue | Custom polling cron + `pg_cron` Postgres queue | Inngest functions | Retries, idempotency, DLQ, observability all built-in; managed serverless; the whole point of this phase |
| Idempotent retries on AI APIs | A `Map<requestId, result>` cache + try/catch wrapper | `step.run()` | Inngest checkpoints at the platform layer — survives function restarts, deploys, container kills |
| Job status state machine | A `jobs` table with status enum + transition logic | Inngest run history + REST API | Already built and exposed; one less table to maintain RLS on |
| Frontend status updates | WebSockets / SSE / Pusher | Polling `GET /api/jobs/[id]` at 1.5s | Voice flow is short-lived; complexity not worth it; can upgrade to Inngest Realtime later |
| Webhook signature verification for Inngest itself | DIY HMAC | `serve()` from `inngest/next` (handles it) | The serve handler validates `INNGEST_SIGNING_KEY` requests automatically |
| Concurrent execution limits | App-level semaphore | `concurrency: { limit: N }` on `createFunction` | Native config; runs across all instances |
| Cron-triggered jobs (future) | Vercel cron + custom auth | `createFunction({}, { cron: '…' }, …)` | Inngest also handles scheduled jobs natively |

**Key insight:** The temptation here is to "add a `jobs` table to track status." Resist it for v3.1.1 — Inngest's own REST API exposes status, output, and timing. Adding a parallel DB table doubles the source of truth and means every code path has to remember to update both. If richer per-tenant analytics ever matter, add it later as a separate read model.

## Runtime State Inventory

This is a refactor that introduces a new external system (Inngest) and changes the contract of three API routes. Despite being mostly additive, several runtime systems do require explicit handling:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | None — Inngest stores its own run history off-platform; no Supabase data migration needed. The existing `recordings`, `photos`, `estimates`, `usage_events` tables are written from inside the Inngest function the same way they are written today (via `lib/services/generate-estimate.ts`), so their data shape is unchanged. **The `usage_events.request_id` column already exists** (used as idempotency key in `recordUsage`) — Inngest job's `requestId` reuses that column. | **Code edit only**, no data migration. |
| **Live service config** | (a) Vercel project — needs `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` env vars set in dashboard before first deploy. (b) Inngest dashboard — must register the deployed app's serve URL (`https://<app>.vercel.app/api/inngest`); on Vercel this is handled automatically via the Inngest-Vercel integration if installed. (c) Meta WhatsApp webhook — already points at `/api/webhooks/whatsapp`; no change needed because that route still ack's <10s, just dispatches differently internally. | **Manual setup steps in HETZNER-DEPLOY.md / .env.example.** Not yet running in prod (v3.2 milestone), so this is documentation only for now. |
| **OS-registered state** | None — no Windows tasks, no systemd units, no pm2 processes for this project. Vercel cron jobs (`/api/cron/cleanup-orphan-projects`, `/api/cron/cleanup-whatsapp-sessions`, `/api/cron/expire-trials`, `/api/cron/trial-warning-emails`) all stay synchronous and unrelated to Inngest. | **None.** |
| **Secrets/env vars** | (a) `INNGEST_EVENT_KEY` — NEW, needed for `inngest.send()` auth; placeholder `signkey-prod-<your-key>` in `.env.example`. (b) `INNGEST_SIGNING_KEY` — NEW, needed for `serve()` to validate requests from Inngest, AND for `/api/jobs/[id]` proxy to call the REST API. (c) Existing keys (`OPENAI_API_KEY` via `getIntegrationKey('openai')`, `ANTHROPIC_API_KEY` via `getIntegrationKey('anthropic')`) — unchanged; Inngest functions read them the same way. | **Add 2 new env vars to `.env.example` and document in README.** Update `gitleaks` config if it doesn't already match `signkey-*` patterns. |
| **Build artifacts / installed packages** | None — `npm install inngest` adds the SDK; no global pip/cargo/binary installs. `inngest-cli` is invoked via `npx` (no global install required) — but if user prefers global install, `~/.local/bin/inngest` is added by the curl install script. | **None.** Doc the choice in README. |

## Common Pitfalls

### Pitfall 1: Assuming `step.run()` is called once, then memoized forever
**What goes wrong:** Developer thinks "step.run is like memoize — it caches the result." They put `if (cached) return cached` logic outside step.run, expecting it to short-circuit.
**Why it happens:** Inngest's execution model: the function body **re-executes from the top on every retry**. Steps that completed in a previous attempt are replayed from the SDK's recorded outputs (zero external work); steps that failed or weren't reached run for real. So `console.log('start')` outside any `step.run` will log on every attempt.
**How to avoid:** Treat the function body as code that may run N times. Anything with side effects MUST be inside `step.run`. Anything reading external state (DB, time) MUST be inside `step.run`.
**Warning signs:** AI provider gets called twice for the same job; logs show "starting estimate generation for X" multiple times.

### Pitfall 2: Long step bodies hitting per-step duration limit
**What goes wrong:** A single `step.run` wraps a 90-second Whisper call. On Vercel Hobby with `maxDuration: 60`, the request to Inngest's runner times out before Whisper returns.
**Why it happens:** Even though the OUTER function has no Inngest timeout, each individual HTTP request to the serve handler still respects Vercel's `maxDuration`. Each `step.run` is one such request.
**How to avoid:** (a) Set `streaming: 'allow'` on `serve()` — extends the effective timeout. (b) On Vercel Pro/Hetzner, set `export const maxDuration = 300` on the route handler. (c) For pathological audio (>10 min), split: download audio → upload to a chunk processor → reassemble. For MVP, Whisper rarely takes >60s for 10-min audio so this should not bite.
**Warning signs:** Function runs show "step timeout" or "ETIMEDOUT" in Inngest dashboard; same job retries N times then fails.

### Pitfall 3: Dispatching from `after()` and losing the event ID
**What goes wrong:** The webhook handler uses `after(() => inngest.send(…))` to keep the response fast — but the route returns 200 before `send()` completes. If `send()` fails (network glitch), the failure is invisible.
**Why it happens:** `next/server`'s `after()` is fire-and-forget; errors are caught and logged but don't propagate.
**How to avoid:** For the WhatsApp webhook (where ack speed is mandatory) — keep `after()` but log errors loudly. For the user-facing API routes — DON'T use `after()`; just `await inngest.send()` synchronously (it's <100ms typical, well within the <1s budget) and return the jobId. The user needs the jobId to poll, so `send()` must complete before response.
**Warning signs:** WhatsApp webhook ack succeeds but no Inngest job appears; user clicks Generate Estimate but `/api/jobs/[id]` returns 404 forever.

### Pitfall 4: Polling rate destroying the page render
**What goes wrong:** `setInterval(poll, 100)` creates 10 requests/sec per user. On Vercel Free with 100k function invocations/day budget, 10 active users × 60s avg job × 10 polls/sec = 6000 invocations per minute → blow through the budget.
**Why it happens:** Aggressive polling out of a "feel responsive" instinct.
**How to avoid:** Poll at 1500ms (1.5s). Use exponential backoff if response is the same as previous: 1.5s → 2s → 3s capped. Stop polling on terminal status. The polling endpoint runs on Vercel — every poll is a function invocation.
**Warning signs:** Vercel dashboard shows 10x higher invocation count than expected; cost estimate spikes.

### Pitfall 5: Recording usage on dispatch instead of completion
**What goes wrong:** Developer puts `recordUsage()` in the API route right before `inngest.send()` — feels like "the user requested it, count it." Then the AI call fails 3 times and the user is charged for nothing.
**Why it happens:** Pre-Inngest mental model: usage = request. Post-Inngest: usage = successful completion.
**How to avoid:** Keep `checkQuota()` in the API route (gate dispatch), but move `recordUsage()` INTO the Inngest function as the LAST `step.run()`. INNGEST-02 mandates this explicitly.
**Warning signs:** `usage_events.delta` count grows for jobs the user reports as "never worked"; quota exhausted but no estimates produced.

### Pitfall 6: Service role client inside `step.run` losing context
**What goes wrong:** Developer calls `requireServiceClient()` outside step.run, function retries, the cached client uses stale env config.
**Why it happens:** Module-scoped Supabase clients read env at first call.
**How to avoid:** Call `requireServiceClient()` INSIDE each `step.run` that needs it. The existing service-role pattern (`lib/supabase/service.ts`) is already lightweight; the cost of re-creating per step is negligible.
**Warning signs:** "JWT expired" or "service role key missing" errors after a deploy mid-job.

### Pitfall 7: Inngest dev server not auto-discovering functions
**What goes wrong:** `npx inngest-cli dev` runs but dashboard shows "No functions found."
**Why it happens:** Default port scanning may not include Xtimator's `9633` port (custom in `package.json` scripts).
**How to avoid:** Always run with explicit `-u`: `npx inngest-cli dev -u http://localhost:9633/api/inngest`. Add it to `package.json` as `"dev:inngest": "npx inngest-cli@latest dev -u http://localhost:9633/api/inngest"`.
**Warning signs:** Dashboard at `localhost:8288` says "0 functions"; dispatched events sit in queue forever.

### Pitfall 8: Idempotency key colliding across users
**What goes wrong:** Idempotency key `'estimate-' + projectId` looks unique, but a project ID never repeats — except when a developer accidentally uses something like `'estimate-' + Date.now() / 1000` (truncated to seconds), causing two requests in the same second to collide.
**Why it happens:** CEL expressions look simple; key construction errors are easy.
**How to avoid:** Use UUIDs (`crypto.randomUUID()`) for the request portion. Combine project ID + per-request UUID. For WhatsApp use the message wamid (already unique per Meta system).
**Warning signs:** Two distinct user actions, only one job run; second user complains "nothing happened."

## Code Examples

Verified patterns from official sources.

### Define an event-triggered function with idempotency

```typescript
// Source: https://www.inngest.com/docs/guides/handling-idempotency
import { inngest } from './client'

export const sendEmail = inngest.createFunction(
  {
    id: 'send-checkout-email',
    idempotency: 'event.data.cartId',  // CEL expression
  },
  { event: 'cart/checkout.completed' },
  async ({ event, step }) => {
    await step.run('send', async () => {
      // ...
    })
  }
)
```

### Send an event and capture event ID

```typescript
// Source: https://www.inngest.com/docs/examples/fetch-run-status-and-output
const { ids } = await inngest.send({
  name: 'imports/csv.uploaded',
  data: {
    file: 'http://example.com/file.csv',
    userId: 'user_xyz',
  },
})
// ids = ["01HWAVEB858VPPX47Z65GR6P6R"]
```

### Poll job status from frontend (adapted to capture-recorder.tsx)

```typescript
// Replace the synchronous fetch in components/capture/capture-recorder.tsx
async function pollJob(jobId: string, signal: AbortSignal) {
  const POLL_MS = 1500
  while (!signal.aborted) {
    const res = await fetch(`/api/jobs/${jobId}`, { signal })
    if (!res.ok) throw new Error('Status check failed')
    const { status, output } = await res.json()
    if (status === 'Completed') return output
    if (status === 'Failed' || status === 'Cancelled') {
      throw new Error(`Job ${status}`)
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  throw new Error('Aborted')
}

// Usage in runPipeline():
const dispatchRes = await fetch('/api/generate-estimate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ projectId }),
})
const { jobId } = await dispatchRes.json()
setStage('analyzing')
const output = await pollJob(jobId, abortControllerRef.current.signal)
// output is the function's return value: { estimateId, version, clientSuggestion, language }
setStage('done')
router.push(`/projects/${projectId}?tab=estimate&estimate=${output.estimateId}`)
```

### Fetch run status server-side (the proxy)

```typescript
// Source: https://www.inngest.com/docs/examples/fetch-run-status-and-output
async function getRuns(eventId: string) {
  const response = await fetch(`https://api.inngest.com/v1/events/${eventId}/runs`, {
    headers: { Authorization: `Bearer ${process.env.INNGEST_SIGNING_KEY}` },
  })
  const json = await response.json()
  return json.data  // array of runs; usually one element
}
```

### Local dev script wiring

```jsonc
// package.json — add this script
{
  "scripts": {
    "dev": "cross-env NODE_OPTIONS=--max-http-header-size=32768 next dev --port 9633",
    "dev:inngest": "npx inngest-cli@latest dev -u http://localhost:9633/api/inngest"
    // Run BOTH in separate terminals: `npm run dev` and `npm run dev:inngest`
  }
}
```

For one-command parallel start, optionally add `concurrently`:
```jsonc
"dev:all": "concurrently \"npm run dev\" \"npm run dev:inngest\""
```

### Step.run with multiple external calls (Inngest's killer feature)

```typescript
// lib/inngest/functions/analyze-photos.ts (sketch)
export const analyzePhotosJob = inngest.createFunction(
  { id: 'analyze-photos', idempotency: 'event.data.requestId', retries: 2 },
  { event: 'photos/analyze.requested' },
  async ({ event, step }) => {
    const { companyId, projectId, requestId } = event.data

    // Load photo list — re-runs on retry but cheap (DB query)
    const photos = await step.run('load-photos', async () => {
      const supabase = requireServiceClient()
      const { data } = await supabase.from('photos').select('*').eq('project_id', projectId)
      return data ?? []
    })

    // ONE step PER photo — each independently retriable, no double-charge
    const descriptions = await Promise.all(
      photos.map((p) =>
        step.run(`vision-${p.id}`, async () => {
          // Claude Vision call + DB update (kept atomic for this photo)
          // ... existing analyzePhoto() body ...
          return { photoId: p.id, description: '…' }
        })
      )
    )

    // Final step — record usage on success only
    await step.run('record-usage', async () => {
      const supabase = requireServiceClient()
      await recordUsage(supabase, companyId, 'photo_analyzed', photos.length, requestId)
    })

    return { results: descriptions }
  }
)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Long synchronous AI calls in API routes | Dispatch to managed background runner | Becomes mandatory once you target serverless platforms with <30s function timeouts (Vercel Hobby = 10s, Pro = 60s, Fluid Compute = 5min) | Frontend must learn polling/SSE; usage accounting must move to job-completion |
| Custom Postgres queue tables | Managed runners (Inngest, Trigger.dev) | 2023-2024 ecosystem shift | Less infra to maintain; vendor dep; dashboard observability comes free |
| Polling REST API | WebSocket/Realtime hooks | Inngest released `useRealtime` ~late 2024 | More elegant for long-lived UI; polling still fine for short jobs |
| Inngest 3.x `inngest.createFunction({ name, ...}, { event }, fn)` | Inngest 4.x `createFunction({ id, ... }, { event }, fn)` (`id` mandatory; `name` optional) | v4 release | Renaming required; the migration is mechanical |
| `pages/api/inngest.ts` Pages Router | `app/api/inngest/route.ts` App Router with named exports | Next.js 13+ App Router | Already on App Router — nothing to change |

**Deprecated/outdated:**
- Inline AI calls in serverless route handlers when targeting low-timeout platforms — clearly the "do not do" pattern as of 2026.
- `inngest.createFunction({ name: '...' }, …)` — `id` is the modern field, `name` is now optional display-only.
- Inngest dev server running on a different port than 8288 — community has converged on 8288 as the assumed default; deviating breaks tutorials.

## Open Questions

1. **Is the existing `requestId` in `recordUsage()` enough as the idempotency key, or should we use a separate `eventId`?**
   - What we know: `recordUsage(supabase, companyId, 'estimate_generated', 1, requestId)` already idempotency-keys on `requestId` at the DB layer (Phase 56 implementation). The Inngest event ID is distinct from the requestId.
   - What's unclear: If a job retries (Inngest re-runs the function), the same `requestId` flows through and `recordUsage` is called twice. The DB-level idempotency on `usage_events.request_id` catches it, BUT — is `request_id` a UNIQUE column? If not, the idempotency only works at the application layer (the SELECT-then-INSERT pattern in `lib/quota.ts`).
   - Recommendation: Phase plan should verify `usage_events.request_id` is either (a) UNIQUE-indexed or (b) the recordUsage code is itself idempotent against duplicate calls. If neither, add a unique partial index in a migration during this phase.

2. **Which polling cadence balances UI feel vs Vercel function-invocation budget?**
   - What we know: Voice flow estimate generation is typically 20-40s; 1.5s polls = ~25 requests per job per user.
   - What's unclear: Is this acceptable for the Hobby plan invocation budget? 10 active users × 25 polls = 250 invocations per estimate generation event.
   - Recommendation: Start at 1.5s. Add a switch to a longer interval (3s) once status crosses a threshold (e.g., "Running" + elapsed > 10s). Revisit after first cost report.

3. **Should we add Inngest Realtime instead of polling?**
   - What we know: `useRealtime` React hook exists, uses WebSocket, auto-closes on terminal status, is the "modern" approach.
   - What's unclear: Adds a token-mint endpoint and a WebSocket connection. The complexity may not be justified for a 30-second job lifecycle.
   - Recommendation: Defer to a future polish phase. Polling MVP first; if it works, leave it alone.

4. **What status does the existing `CaptureStepper` show during the dispatch → first poll latency?**
   - What we know: After dispatch the route returns instantly with `{ jobId }`; the first `/api/jobs/:id` poll comes ~1.5s later; the run may not have started yet (Inngest accepts the event then assigns to a worker).
   - What's unclear: First poll may return `{ status: 'Running', output: null }` even before the function's first step starts. The stepper has no way to distinguish "queued" from "running".
   - Recommendation: Treat any non-terminal status as "current stage = analyzing"; use the run's `output` field (when present) to advance to "generating". For richer per-step UI, embed step-name signals in the function output mid-run via a partial state mechanism (deferred — not needed for MVP).

5. **How does the WhatsApp `whatsAppFinalizeJob` know all per-message events have been processed?**
   - What we know: `step.waitForEvent` is the documented primitive.
   - What's unclear: For a debounced batch of N messages (variable N), generating N waitForEvent calls is awkward.
   - Recommendation: Use the simpler MVP pattern (Pattern 6 alternative above): one Inngest function with N+2 sequential `step.run` blocks. Skip `waitForEvent` orchestration entirely.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 20+ | Inngest SDK + Next.js | ✓ (per CLAUDE.md / package.json `@types/node ^20`) | 20.x assumed | — |
| `npx` (npm 7+) | `npx inngest-cli@latest dev` | ✓ (npm ships with Node 20) | — | curl install one-shot script |
| Internet access on dev machine | First inngest-cli download via npx; later Inngest cloud API for prod | ✓ | — | None — Inngest is cloud-managed |
| Inngest account (free tier) | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` for staging/prod; localhost dev needs nothing | ✗ (assumed not yet created) | — | None — must sign up at inngest.com |
| Port 8288 free on dev machine | inngest-cli dev dashboard | ✓ (assumed) | — | `--port` flag on dev server |
| `INNGEST_EVENT_KEY` env var | Production `inngest.send()` auth | ✗ (will be added in this phase) | — | Local dev: dummy value works (dev server doesn't validate) |
| `INNGEST_SIGNING_KEY` env var | `serve()` validation + `/api/jobs/[id]` proxy auth | ✗ (will be added in this phase) | — | Local dev: dummy value works |

**Missing dependencies with no fallback:**
- An Inngest cloud account is required before any non-localhost deploy. Sign-up takes ~2 minutes; the free tier (50,000 monthly executions) covers MVP comfortably.

**Missing dependencies with fallback:**
- Local dev needs neither real key — the `inngest-cli dev` server accepts dummy values.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (jsdom env, globals, react plugin) |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test -- --run tests/unit/inngest/` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INNGEST-01 | `lib/inngest/client.ts` exports a configured `Inngest` instance with `id: 'xtimator'` | unit | `npm test -- --run tests/unit/inngest/client.test.ts` | ❌ Wave 0 |
| INNGEST-01 | `app/api/inngest/route.ts` exports `GET`, `POST`, `PUT` from `serve({ client, functions })` | unit (smoke) | `npm test -- --run tests/unit/inngest/route.test.ts` | ❌ Wave 0 |
| INNGEST-02 | `/api/generate-estimate` returns `{ jobId }` shape and HTTP 202 in <1s; does NOT call `generateEstimateForProject` directly; calls `inngest.send()` with the right event name and idempotency `id` | unit (with vi.mock on `inngest.send`) | `npm test -- --run tests/unit/api/generate-estimate-dispatch.test.ts` | ❌ Wave 0 |
| INNGEST-02 | `recordUsage` is NOT called by the route (only inside the Inngest function) | unit | (same file as above; assertion on `recordUsage` mock) | ❌ Wave 0 |
| INNGEST-02 | `generateEstimateJob` Inngest function calls `generateEstimateForProject` inside a `step.run` and `recordUsage` inside a separate `step.run` | unit (Inngest provides test utilities; or just exercise the bare async handler with mock `step`) | `npm test -- --run tests/unit/inngest/generate-estimate-job.test.ts` | ❌ Wave 0 |
| INNGEST-03 | NEW `app/api/transcribe/route.ts` returns `{ jobId }`; existing `transcribeRecording()` server action becomes dispatch-only OR a new dispatch path is added | unit | `npm test -- --run tests/unit/api/transcribe-dispatch.test.ts` | ❌ Wave 0 |
| INNGEST-03 | `transcribeAudioJob` calls Whisper inside `step.run` | unit | `npm test -- --run tests/unit/inngest/transcribe-job.test.ts` | ❌ Wave 0 |
| INNGEST-04 | `/api/analyze-photos` returns `{ jobId }`; quota check still happens BEFORE dispatch | unit | `npm test -- --run tests/unit/api/analyze-photos-dispatch.test.ts` | ❌ Wave 0 |
| INNGEST-04 | `analyzePhotosJob` issues one `step.run` per photo | unit | `npm test -- --run tests/unit/inngest/analyze-photos-job.test.ts` | ❌ Wave 0 |
| INNGEST-05 | `GET /api/jobs/[id]` proxies to Inngest REST API with Bearer auth; returns `{ status, output }`; requires sign-in | unit (mock global fetch) | `npm test -- --run tests/unit/api/jobs-status.test.ts` | ❌ Wave 0 |
| INNGEST-05 | `CaptureRecorder` calls `/api/jobs/[id]` in a polling loop after dispatch; updates `stage` based on status; advances on `Completed` | unit (component test with vi.useFakeTimers) | `npm test -- --run tests/unit/components/capture-recorder-poll.test.tsx` | ❌ Wave 0 |
| INNGEST-06 | All four Inngest functions are configured with explicit `idempotency` CEL expressions referencing `event.data.requestId` (or wamid for WhatsApp) | unit (assert on the function's exported config) | `npm test -- --run tests/unit/inngest/idempotency.test.ts` | ❌ Wave 0 |
| INNGEST-06 | All `inngest.send()` call sites pass an `id` field for event-level idempotency | unit | (covered by the `*-dispatch.test.ts` files above) | ❌ Wave 0 |
| INNGEST-07 | `lib/whatsapp/handler.ts` `processInboundMessages` no longer awaits Whisper/Vision inline — instead calls `inngest.send()` with `whatsapp/process.requested` event | unit | `npm test -- --run tests/unit/whatsapp/handler-dispatch.test.ts` (extend existing handler.test.ts) | ❌ Wave 0 (extend existing) |
| INNGEST-07 | `whatsAppProcessJob` Inngest function processes each message type via separate `step.run` blocks then calls `generateEstimateForProject` | unit | `npm test -- --run tests/unit/inngest/whatsapp-process-job.test.ts` | ❌ Wave 0 |
| INNGEST-08 | `package.json` has `dev:inngest` script with the right URL (`http://localhost:9633/api/inngest`) | unit (read package.json) | `npm test -- --run tests/unit/inngest/dev-script.test.ts` | ❌ Wave 0 |
| INNGEST-08 | `README.md` (or new `docs/INNGEST-DEV.md`) documents the workflow | manual review | grep for "inngest-cli dev" in docs | manual |

### Sampling Rate
- **Per task commit:** `npm test -- --run tests/unit/inngest/ tests/unit/api/` (just the touched suites; ~10s total)
- **Per wave merge:** `npm test` (full suite — ~60s; includes existing 250+ tests)
- **Phase gate:** Full suite green + manual smoke (start dev + dev:inngest, dispatch via UI, verify Inngest dashboard shows the run, verify capture stepper completes) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/inngest/client.test.ts` — covers INNGEST-01 (client config)
- [ ] `tests/unit/inngest/route.test.ts` — covers INNGEST-01 (serve handler exports)
- [ ] `tests/unit/inngest/generate-estimate-job.test.ts` — covers INNGEST-02, INNGEST-06
- [ ] `tests/unit/inngest/transcribe-job.test.ts` — covers INNGEST-03, INNGEST-06
- [ ] `tests/unit/inngest/analyze-photos-job.test.ts` — covers INNGEST-04, INNGEST-06
- [ ] `tests/unit/inngest/whatsapp-process-job.test.ts` — covers INNGEST-07
- [ ] `tests/unit/inngest/idempotency.test.ts` — sanity check on idempotency CEL expressions across all functions
- [ ] `tests/unit/inngest/dev-script.test.ts` — covers INNGEST-08 (package.json grep)
- [ ] `tests/unit/api/generate-estimate-dispatch.test.ts` — covers INNGEST-02 (route returns jobId only)
- [ ] `tests/unit/api/transcribe-dispatch.test.ts` — covers INNGEST-03 (NEW route)
- [ ] `tests/unit/api/analyze-photos-dispatch.test.ts` — covers INNGEST-04 (route refactor)
- [ ] `tests/unit/api/jobs-status.test.ts` — covers INNGEST-05 (proxy route)
- [ ] `tests/unit/components/capture-recorder-poll.test.tsx` — covers INNGEST-05 (frontend polling)
- [ ] Extend `tests/unit/whatsapp/handler.test.ts` (already exists) — covers INNGEST-07 (handler now dispatches)
- [ ] Optional shared mock helper: `tests/setup/inngest-mocks.ts` — exports `mockInngestSend()` factory used by all dispatch tests
- [ ] No framework install needed — vitest already configured.

UAT-INNGEST-01 / UAT-INNGEST-02 (Phase 69) are the human-driven end-to-end validation; they are out of scope for Phase 66's unit tests but the test plan above gives them a green automated baseline to start from.

## Sources

### Primary (HIGH confidence)
- [Inngest Next.js Quick Start](https://www.inngest.com/docs/getting-started/nextjs-quick-start) — official setup pattern (client + serve handler + first function)
- [Inngest Serve Handler Reference](https://www.inngest.com/docs/reference/serve) — confirmed `GET/POST/PUT` triplet, `INNGEST_SIGNING_KEY` env var, streaming option
- [Inngest createFunction Reference](https://www.inngest.com/docs/reference/functions/create) — `id`, `idempotency`, `retries`, handler args (`event`, `step`, `runId`, `logger`, `attempt`)
- [Inngest step.run Reference](https://www.inngest.com/docs/reference/functions/step-run) — memoization, retry semantics, JSON serialization of return value
- [Inngest Idempotency Guide](https://www.inngest.com/docs/guides/handling-idempotency) — event-level vs function-level, CEL expressions, 24h window
- [Inngest Sending Events](https://www.inngest.com/docs/events) — `send()` returns `{ ids: [...] }`, batch up to 512KB
- [Inngest Fetch Run Status and Output](https://www.inngest.com/docs/examples/fetch-run-status-and-output) — REST API endpoint, status enum, complete polling code
- [Inngest Local Development](https://www.inngest.com/docs/local-development) — `inngest dev -u <url>`, port 8288, dummy keys ok in dev
- [Inngest Vercel Deployment](https://www.inngest.com/docs/deploy/vercel) — env vars, auto-sync, streaming for max duration
- `npm view inngest version` (executed 2026-05-15) → `4.4.0` (published 2026-05-13)

### Secondary (MEDIUM confidence)
- [Inngest Errors & Retries](https://www.inngest.com/docs/guides/error-handling) — verified retry counter is per-step
- [Inngest Pricing](https://www.inngest.com/pricing) — free tier = 50,000 monthly executions (corrected from prompt's 5k figure)
- [Inngest React Realtime Hooks](https://www.inngest.com/docs/features/realtime/react-hooks) — useRealtime exists; deferred for MVP
- [Inngest Working with Loops](https://www.inngest.com/docs/guides/working-with-loops) — confirms one `step.run` per iteration is the correct pattern

### Tertiary (LOW confidence)
- [Inngest Discussion #874 — Idempotency](https://github.com/orgs/inngest/discussions/874) — community thread on idempotency edge cases (consulted for Pitfall 8)
- General WebSearch summaries on common pitfalls (cross-checked against official docs before being included in §Pitfalls)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Inngest 4.4.0 verified on npm; `inngest/next` adapter confirmed in official quick start
- Architecture: HIGH — every pattern (client, serve, createFunction, step.run, idempotency, polling) lifted from official docs verbatim
- WhatsApp refactor strategy: MEDIUM — the simplified single-function pattern (Pattern 6 alternative) is a synthesis, not a verbatim doc example; should be confirmed during planning by sketching the full job flow
- Polling cadence + cost: MEDIUM — recommendations are reasonable defaults; actual Vercel invocation cost is project-specific and may need tuning
- `usage_events.request_id` uniqueness: LOW — flagged as Open Question #1; phase plan should verify and add migration if needed

**Research date:** 2026-05-15
**Valid until:** 2026-07-15 (60 days — Inngest SDK is stable in the 4.x line; APIs unlikely to break in this window)
