---
id: SEED-010
status: dormant
planted: 2026-05-10
planted_during: v2.0 WhatsApp Estimate Channel (post-milestone analysis)
trigger_when: When iterating on WhatsApp UX, planning a v2.x WhatsApp milestone, or addressing user complaints about "blocked second message"
scope: Medium
---

# SEED-010: WhatsApp Multi-Message Debounce Buffer

## Why This Matters

O fluxo WhatsApp atual do Xtimator **assume que o usuário envia uma única mensagem por estimativa**. Na realidade, um empreiteiro andando por uma obra envia naturalmente uma sequência:

```
[18:32:01] 🎙️ áudio descrevendo a cozinha
[18:32:18] 📸 foto da pia
[18:32:34] 📸 foto do balcão
[18:33:02] 🎙️ áudio descrevendo a sala
[18:33:24] ✍️ "esqueci, tem azulejo quebrado no banheiro"
```

**O que o sistema faz hoje** (`lib/whatsapp/handler.ts:126`):
1. Primeira mensagem (áudio) chega → cria projeto → transcreve → gera estimativa imediatamente
2. Sessão entra em `awaiting_confirm`
3. Todas as mensagens seguintes são **bloqueadas** com "Reply *send* or *cancel*"

O empreiteiro recebe a estimativa baseada **só na cozinha**, e as outras 4 mensagens são desperdiçadas. Para gerar a estimativa completa, ele precisa cancelar e recomeçar — repetindo todo o input. UX quebrada para o caso de uso real.

## A Solução: Debounce com Redis

Inspirado no padrão do projeto antigo (n8n + Chatwoot + Upstash), o webhook não processa cada mensagem imediatamente. Em vez disso:

```
Mensagem chega
  ↓
PUSH no buffer Redis (key = phone_number)
  ↓
Wait 500ms (deixa Redis estabilizar)
  ↓
GET buffer
  ↓
É a mensagem mais recente? (id == last(buffer).id)
  ├─ Não → discard (uma mais nova vai processar)
  └─ Sim → A última msg tem >5s? (usuário parou de digitar?)
      ├─ Não → wait + loop
      └─ Sim → DELETE buffer + processa TODAS as msgs juntas
```

O processamento agregado:
- Concatena todos os áudios transcritos
- Inclui todas as fotos analisadas
- Inclui todos os textos
- Gera **uma única estimativa completa** a partir de tudo

## Configurações

```typescript
const DEBOUNCE_WAIT_MS = 5_000   // tempo de silêncio antes de processar
const BUFFER_TTL_SECONDS = 120   // expira buffer se algo der errado
const STABILIZE_WAIT_MS = 500    // wait inicial antes do primeiro check
```

5 segundos é o sweet spot do n8n original — longo o suficiente para o usuário terminar de gravar/tirar fotos, curto o suficiente para não parecer travado.

## Casos de Borda

- **Cancelamento durante buffer**: se chegar a palavra "cancel" enquanto estiver bufferizando, processa imediatamente o cancel.
- **Buffer órfão**: TTL de 2 minutos no Redis garante que buffers travados são limpos automaticamente.
- **Múltiplos workers**: usar `Redis WATCH/MULTI` ou lock distribuído para evitar dois workers processarem o mesmo buffer.
- **Confirmação durante buffer ativo**: se sessão já está em `awaiting_confirm` e chega nova mensagem que não é "send"/"cancel" — atualmente bloqueia. Com debounce, considerar tratar como input para refinement (integra com SEED-006).

## Stack

- **Upstash Redis** — managed, serverless, integra direto com Vercel
- Cliente já tem padrão de uso no projeto antigo
- Variáveis de ambiente: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

## Scope Estimate

**Medium** — 1 fase, ~2-3 dias:

1. Setup Upstash Redis + cliente em `lib/redis.ts`
2. Refatorar `app/api/webhooks/whatsapp/route.ts` para PUSH em vez de processar direto
3. Criar `lib/whatsapp/buffer.ts` com lógica de debounce
4. Refatorar `processInboundMessage()` para aceitar **array** de mensagens
5. Refatorar `generate-estimate` para aceitar input agregado (texto + áudios + fotos juntos)
6. Testes: simular sequência de mensagens, garantir 1 estimativa final
7. Observability: log de quantas mensagens cada buffer agregou (métrica de uso)

## Breadcrumbs

- `lib/whatsapp/handler.ts:30-55` — atual lógica de session check; ponto onde o early-return de "responda send/cancel" precisa virar agregação
- `lib/whatsapp/handler.ts:87-110` — switch por tipo de mensagem (text/audio/image); virar loop sobre array
- `lib/whatsapp/handler.ts:126` — `generateEstimateForProject()` chamado uma vez por mensagem; vira uma vez por buffer
- `lib/services/generate-estimate.ts` — aceita projeto com múltiplos recordings + photos; já é compatível com input agregado, só precisa garantir que use TUDO
- `app/api/webhooks/whatsapp/route.ts:53` — `after()` fire-and-forget; manter, mas chamar `processBuffer()` em vez de `handleInboundMessage()`
- `lib/whatsapp/confirm.ts` — sessão `awaiting_confirm` continua igual; debounce só afeta input antes da confirmação

## Notes

- Esse seed **conserta** comportamento — não é feature nova. Pode entrar como hotfix em v2.1.
- Considerar combinar com SEED-011 (typing indicator) — durante o buffer (5s+), enviar `typing_indicator` mantém o usuário tranquilo de que algo está acontecendo.
- A estimativa gerada a partir de input agregado vai ser **muito melhor** do que a atual — o Claude tem mais contexto. Isso é um upside além de só consertar a UX.
- Integração com SEED-006 (refinement iterativo): após confirmação, mensagens adicionais entram em modo refine. Antes da confirmação, entram no buffer.
