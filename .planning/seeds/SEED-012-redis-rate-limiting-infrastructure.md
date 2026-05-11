---
id: SEED-012
status: dormant
planted: 2026-05-10
planted_during: v2.0 WhatsApp Estimate Channel (post-milestone analysis)
trigger_when: When introducing usage tiers, monetization, abuse prevention, or whenever the first paid plan is introduced
scope: Small
---

# SEED-012: Redis-Backed Rate Limiting Infrastructure

## Why This Matters

Hoje o Xtimator **não tem rate limiting em lugar nenhum** — nem no app web, nem no WhatsApp webhook, nem nos endpoints de IA. Isso é tolerável enquanto a base de usuários é pequena e confiável, mas é um problema sério para:

1. **Lançamento público** — um usuário malicioso (ou um bug do cliente) pode gerar centenas de estimativas em segundos, queimando créditos do Anthropic/OpenAI.
2. **Planos pagos** (ver SEED-013) — sem rate limiting, "máximo 10 estimativas/mês no plano free" é declarativo, não enforcement.
3. **WhatsApp abuse** — um usuário mal-intencionado pode spammar o webhook com mensagens, gerando custo de Whisper/Vision sem nada bloqueando.
4. **Compliance** — endpoints sem rate limit são red flag em audit de segurança.

## A Solução: Padrão do Chatbot

O projeto antigo `C:\Users\Vanildo\Dev\chatbot` tem uma implementação enxuta em `/lib/ratelimit.ts`:

```typescript
const MAX = 10
const TTL_SECONDS = 60 * 60

const key = `ip-rate-limit:${ip}`
const [count] = await redis.multi()
  .incr(key)
  .expire(key, TTL_SECONDS, "NX")
  .exec()

if (count > MAX) throw new RateLimitError()
```

Padrão **sliding window aproximado** — simples, performático, suficiente para 99% dos casos. O `EXPIRE NX` garante que o TTL só é setado na primeira vez, preservando o janela mesmo com reqs concorrentes.

## Camadas de Rate Limiting

```typescript
// lib/ratelimit.ts
export const limits = {
  // Por IP (anti-DDoS básico)
  ipPerMinute:        { max: 60,   window: 60 },
  ipPerHour:          { max: 600,  window: 3600 },

  // Por usuário autenticado (uso normal)
  userEstimatePerHour:  { max: 30,  window: 3600 },
  userEstimatePerDay:   { max: 100, window: 86400 },

  // Por número de WhatsApp
  whatsappPerHour:    { max: 20,   window: 3600 },
  whatsappPerDay:     { max: 50,   window: 86400 },

  // Endpoints caros
  photoAnalysisPerMinute: { max: 10, window: 60 },
  translatePerMinute:     { max: 20, window: 60 },
}
```

Os limites concretos vêm de SEED-013 (entitlements por plano). Esse seed apenas constrói o **mecanismo**.

## API Pública

```typescript
// Uso típico em qualquer route handler
import { rateLimit } from '@/lib/ratelimit'

export async function POST(req: Request) {
  const { allowed, retryAfter } = await rateLimit('userEstimatePerHour', userId)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }
  // ... resto do handler
}
```

Helper para WhatsApp:
```typescript
await rateLimit('whatsappPerHour', phoneNumber, {
  onLimit: () => sendWhatsAppMessage(phoneNumber, '⏸️ Hold on — you reached your hourly limit. Try again in 1h.')
})
```

## Estrutura

```
lib/
├── redis.ts              ← cliente Upstash compartilhado
└── ratelimit.ts          ← API rateLimit() + config dos limits
```

O `redis.ts` é o mesmo cliente usado por SEED-010 (debounce buffer) — uma única instância Upstash serve para os dois usos com keys namespaced (`rate:`, `buffer:`).

## Scope Estimate

**Small** — 1 fase, ~1-2 dias:

1. Setup Upstash (se SEED-010 não já fez): vars de ambiente, cliente `lib/redis.ts`
2. `lib/ratelimit.ts` com função `rateLimit(limitName, identifier)`
3. Aplicar nos endpoints críticos:
   - `app/api/webhooks/whatsapp/route.ts` — `whatsappPerHour`
   - `app/api/generate-estimate/route.ts` — `userEstimatePerHour`
   - `app/api/analyze-photos/route.ts` — `photoAnalysisPerMinute`
   - `app/api/translate/route.ts` — `translatePerMinute` (já tem o TODO comment lá)
4. Middleware global para `ipPerMinute` em `proxy.ts`
5. Testes: simular reqs em loop, verificar 429 após N
6. Observability: log de quem está hitting limits (sinal de abuso ou bug)

## Breadcrumbs

- `app/api/translate/route.ts:8` — comment "rate-limit protection only" indica intenção mas não há implementação
- `app/api/generate-estimate/route.ts` — endpoint mais caro (Claude + processamento); maior beneficiário
- `app/api/analyze-photos/route.ts` — Vision API é cara; precisa proteção
- `app/api/webhooks/whatsapp/route.ts:91-98` — dedup já tem padrão similar (insert + unique violation); rate limit é a próxima camada de defesa
- `proxy.ts` — middleware global; bom lugar pra rate limit por IP antes de qualquer rota
- Reference impl: `C:\Users\Vanildo\Dev\chatbot\lib\ratelimit.ts`

## Notes

- **Por que Redis e não Postgres?** Postgres dá conta, mas: latência ~10x maior, contention em writes concorrentes, e poluição da hot path de queries do app. Redis é a ferramenta certa para counters efêmeros.
- **Por que Upstash?** Serverless-first, integra direto com Vercel, free tier generoso (10k reqs/dia), pricing previsível. Já é o provider escolhido em SEED-010.
- **Distributed lock vs counter**: para rate limit, counter é suficiente. Lock seria over-engineering.
- **Sliding window aproximado vs preciso**: o padrão de `INCR + EXPIRE NX` cria "janela tumbling" — pode permitir burst no momento do reset. Para preciso, usar sliding window com sorted set (mais caro). 99% dos casos toleram a imprecisão.
- **429 com Retry-After**: header padrão HTTP — clientes bem-comportados (incluindo navegadores e curl) respeitam automaticamente.
- Esse seed é **pré-requisito** para SEED-013 (entitlements). Não há como enforce planos sem rate limit funcionando.
