---
id: SEED-014
status: harvested
planted: 2026-05-10
planted_during: v2.0 WhatsApp Estimate Channel (post-milestone analysis)
harvested: 2026-05-11
harvested_in: v2.1 Phase 46 (Typed Error Handling Foundation)
harvest_completeness: Foundation complete — XtimatorError + asResponse() + handleWhatsAppError() + throwIf helpers shipped. Refactoring existing endpoints is deferred (coexists peacefully; refactor per-endpoint as touched)
trigger_when: When addressing error handling debt, preparing for public launch, after the first user-reported "weird error message" bug, or as part of a code quality milestone
scope: Small
---

# SEED-014: Typed Error Handling System

## Why This Matters

Xtimator today handles errors **ad-hoc** in every endpoint:

```typescript
// Current pattern in several places
try {
  // ... work
} catch (err) {
  console.error(err)
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
}
```

Problems:
1. **Generic messages** — user sees "Something went wrong" for everything, from timeout to limit reached.
2. **No log vs response distinction** — stack traces leak, or useful errors get buried in logs.
3. **Inconsistent status codes** — some endpoints return 500 for errors that should be 400/403/429/402.
4. **Frontend can't react** — without structured error codes, UI doesn't know whether to show "try again" or "upgrade".
5. **WhatsApp handler** — `lib/whatsapp/handler.ts:111-118` does a catch-all and sends "An error occurred while processing your message" to the user, losing all context.

## The Solution: Chatbot Pattern

The `C:\Users\Vanildo\Dev\chatbot\lib\errors.ts` project has a lean and typed system:

```typescript
type ErrorType =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limit'
  | 'tier_limit'
  | 'offline'
  | 'internal'

type Surface =
  | 'estimates'
  | 'whatsapp'
  | 'auth'
  | 'photos'
  | 'translate'
  | 'pdf'
  | 'billing'
  | 'database'

// Composite code: "${type}:${surface}"
export class XtimatorError extends Error {
  constructor(
    public type: ErrorType,
    public surface: Surface,
    public message: string,
    public cause?: unknown,
    public meta?: Record<string, unknown>
  ) { super(message) }

  get code() { return `${this.type}:${this.surface}` }
  get statusCode() { return statusByType[this.type] }
  get userMessage() { return userMessageByCode[this.code] ?? defaultMessageByType[this.type] }
  get logOnly() { return this.type === 'internal' }

  toResponse(): Response {
    const body = this.logOnly
      ? { error: 'Internal error', code: this.code }
      : { error: this.userMessage, code: this.code, ...(this.meta && { meta: this.meta }) }

    return NextResponse.json(body, { status: this.statusCode })
  }
}
```

Mappings:
```typescript
const statusByType: Record<ErrorType, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  rate_limit: 429,
  tier_limit: 402,
  offline: 503,
  internal: 500,
}

const userMessageByCode: Partial<Record<string, string>> = {
  'tier_limit:estimates': 'You reached your monthly estimate limit. Upgrade your plan to continue.',
  'rate_limit:whatsapp': 'You sent too many messages. Try again in a few minutes.',
  'bad_request:photos': 'One or more photos could not be processed. Try uploading again.',
  'unauthorized:auth': 'Please sign in to continue.',
  // ...
}
```

## Usage

```typescript
// In endpoints
throw new XtimatorError('tier_limit', 'estimates', 'Monthly quota exceeded', undefined, {
  used: 10,
  limit: 10,
  upgradeUrl: '/settings/billing'
})

// Default catch (becomes a wrapper):
import { asResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    // ... work that may throw XtimatorError
  } catch (err) {
    return asResponse(err)  // handles XtimatorError and regular Error
  }
}
```

`asResponse()` transforms:
- `XtimatorError` → typed response with user message
- Regular `Error` → 500 with "Internal error" (full log to console)
- `ZodError` → 400 with list of invalid fields

## WhatsApp Adaptation

`lib/whatsapp/handler.ts` needs a version that **sends errors via WhatsApp** instead of returning JSON:

```typescript
import { handleWhatsAppError } from '@/lib/errors/whatsapp'

try {
  // ... process message
} catch (err) {
  await handleWhatsAppError(err, fromPhone, projectId)
  // user gets specific message: "Audio too long (max 5min)" vs "Out of quota"
}
```

Contextual messages via WhatsApp:
- `tier_limit:estimates` → "⚠️ You reached 10 estimates this month. Upgrade: {url}"
- `bad_request:audio` → "🎙️ Audio couldn't be processed. Try recording again."
- `rate_limit:whatsapp` → "⏸️ Too many messages — try again in 5min."
- `internal:*` → "❌ Something went wrong on our side. We're looking into it."

## Structure

```
lib/errors/
├── index.ts              ← XtimatorError class + asResponse()
├── codes.ts              ← types, surfaces, status map, message map
├── whatsapp.ts           ← handleWhatsAppError() adapter
└── helpers.ts            ← throwIf*() shortcuts: throwIfNotFound, throwIfForbidden
```

Helpers:
```typescript
export function throwIfNotFound<T>(
  value: T | null,
  surface: Surface,
  message = 'Not found'
): asserts value is T {
  if (value == null) throw new XtimatorError('not_found', surface, message)
}
```

## Scope Estimate

**Small** — 1 phase, ~1-2 days:

1. `lib/errors/index.ts` + `codes.ts` with types and mappings
2. `asResponse()` for use in route handlers
3. `handleWhatsAppError()` adapter
4. Helpers (`throwIfNotFound`, `throwIfForbidden`, `throwIfBadRequest`)
5. Refactor critical endpoints (doesn't need to be all on Day 1):
   - `app/api/generate-estimate/route.ts`
   - `app/api/webhooks/whatsapp/route.ts`
   - `app/api/analyze-photos/route.ts`
   - `lib/whatsapp/handler.ts`
6. Add tests: ensure `XtimatorError` produces correct status and correct user message for each code

## Breadcrumbs

- `lib/whatsapp/handler.ts:111-118` — current catch-all; first candidate to refactor with `handleWhatsAppError`
- `app/api/generate-estimate/route.ts` — multiple ad-hoc try/catch
- `app/api/analyze-photos/route.ts` — uses Zod (serves as integration test with ZodError)
- `lib/services/generate-estimate.ts` — generic throws that become XtimatorError with surface = 'estimates'
- `lib/queries/share.ts` — returns `null` for "not found"; good candidate for `throwIfNotFound`
- Reference impl: `C:\Users\Vanildo\Dev\chatbot\lib\errors.ts`

## Notes

- **Goes against the "don't over-engineer" instinct** — but the gain is tangible: more traceable bugs, better user messages, frontend can handle specific errors.
- **No need to migrate everything at once** — coexists peacefully with old try/catch. Refactor per endpoint as you touch each.
- **Sentry/observability integration**: `XtimatorError` with `cause` and `meta` is perfect input for Sentry. Already structured for it.
- **WhatsApp UX win**: today any failure becomes "An error occurred" — with codes, the user gets "Photo too blurry — try better lighting" or "Audio too long — max 5 minutes". Massive difference.
- **i18n-ready**: `userMessageByCode` accepts language lookup easily. Integrates with SEED-001 (i18n) at no extra cost.
- Pairs very well with SEED-013 (entitlements) — `tier_limit` is a dedicated type, with 402 status and CTA to upgrade.
