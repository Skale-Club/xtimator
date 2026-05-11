---
id: SEED-014
status: dormant
planted: 2026-05-10
planted_during: v2.0 WhatsApp Estimate Channel (post-milestone analysis)
trigger_when: When addressing error handling debt, preparing for public launch, after first user-reported "weird error message" bug, or as part of a code quality milestone
scope: Small
---

# SEED-014: Typed Error Handling System

## Why This Matters

O Xtimator hoje trata erros de forma **ad-hoc** em cada endpoint:

```typescript
// Padrão atual em vários lugares
try {
  // ... work
} catch (err) {
  console.error(err)
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
}
```

Problemas:
1. **Mensagens genéricas** — usuário vê "Something went wrong" para tudo, do timeout ao limit reached.
2. **Sem distinção log vs response** — stack traces vazam, ou erros úteis ficam escondidos no log.
3. **Status codes inconsistentes** — alguns endpoints retornam 500 para erros que deveriam ser 400/403/429/402.
4. **Frontend não consegue tratar** — sem código de erro estruturado, UI não sabe se deve mostrar "tente de novo" ou "faça upgrade".
5. **WhatsApp handler** — `lib/whatsapp/handler.ts:111-118` faz catch-all e manda "An error occurred while processing your message" pra usuário, perdendo todo contexto.

## A Solução: Padrão do Chatbot

O projeto `C:\Users\Vanildo\Dev\chatbot\lib\errors.ts` tem um sistema enxuto e tipado:

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

// Código composto: "${type}:${surface}"
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

Mapeamentos:
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

## Uso

```typescript
// Em endpoints
throw new XtimatorError('tier_limit', 'estimates', 'Monthly quota exceeded', undefined, {
  used: 10,
  limit: 10,
  upgradeUrl: '/settings/billing'
})

// Catch padrão (vira um wrapper):
import { asResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    // ... work that may throw XtimatorError
  } catch (err) {
    return asResponse(err)  // sabe lidar com XtimatorError e Error normal
  }
}
```

`asResponse()` transforma:
- `XtimatorError` → resposta tipada com user message
- `Error` normal → 500 com "Internal error" (log full no console)
- `ZodError` → 400 com lista de fields inválidos

## WhatsApp Adaptation

`lib/whatsapp/handler.ts` precisa de uma versão que **manda erro pelo WhatsApp** em vez de retornar JSON:

```typescript
import { handleWhatsAppError } from '@/lib/errors/whatsapp'

try {
  // ... process message
} catch (err) {
  await handleWhatsAppError(err, fromPhone, projectId)
  // user gets specific message: "Audio too long (max 5min)" vs "Out of quota"
}
```

Mensagens contextuais via WhatsApp:
- `tier_limit:estimates` → "⚠️ You reached 10 estimates this month. Upgrade: {url}"
- `bad_request:audio` → "🎙️ Audio couldn't be processed. Try recording again."
- `rate_limit:whatsapp` → "⏸️ Too many messages — try again in 5min."
- `internal:*` → "❌ Something went wrong on our side. We're looking into it."

## Estrutura

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

**Small** — 1 phase, ~1-2 dias:

1. `lib/errors/index.ts` + `codes.ts` com tipos e mapeamentos
2. `asResponse()` para use em route handlers
3. `handleWhatsAppError()` adapter
4. Helpers (`throwIfNotFound`, `throwIfForbidden`, `throwIfBadRequest`)
5. Refatorar endpoints críticos (não precisa ser todos no Day 1):
   - `app/api/generate-estimate/route.ts`
   - `app/api/webhooks/whatsapp/route.ts`
   - `app/api/analyze-photos/route.ts`
   - `lib/whatsapp/handler.ts`
6. Adicionar testes: garantir que `XtimatorError` produz status correto e user message correta para cada code

## Breadcrumbs

- `lib/whatsapp/handler.ts:111-118` — catch-all atual; primeiro candidato a refator com `handleWhatsAppError`
- `app/api/generate-estimate/route.ts` — múltiplos try/catch ad-hoc
- `app/api/analyze-photos/route.ts` — usa Zod (sirva como teste de integração com ZodError)
- `lib/services/generate-estimate.ts` — throws genéricos que viram XtimatorError com surface = 'estimates'
- `lib/queries/share.ts` — retorna `null` para "not found"; bom candidato a `throwIfNotFound`
- Reference impl: `C:\Users\Vanildo\Dev\chatbot\lib\errors.ts`

## Notes

- **Vai contra o instinto de "não over-engineer"** — mas o ganho é tangível: bugs mais rastreáveis, mensagens melhores pra usuário, frontend pode tratar erros específicos.
- **Não precisa migrar tudo de uma vez** — coexiste pacificamente com try/catch antigo. Refatorar por endpoint conforme tocar.
- **Sentry/observability integration**: `XtimatorError` com `cause` e `meta` é input perfeito para Sentry. Já está estruturado pra isso.
- **WhatsApp UX win**: hoje qualquer falha vira "An error occurred" — com codes, usuário recebe "Photo too blurry — try better lighting" ou "Audio too long — max 5 minutes". Massive difference.
- **i18n-ready**: `userMessageByCode` aceita lookup por idioma facilmente. Integra com SEED-001 (i18n) sem trabalho extra.
- Combina muito bem com SEED-013 (entitlements) — `tier_limit` é um type dedicado, com 402 status e CTA de upgrade.
