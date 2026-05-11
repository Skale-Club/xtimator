---
id: SEED-011
status: dormant
planted: 2026-05-10
planted_during: v2.0 WhatsApp Estimate Channel (post-milestone analysis)
trigger_when: When polishing WhatsApp UX, addressing perceived latency complaints, or planning a WhatsApp UX iteration milestone
scope: Small
---

# SEED-011: WhatsApp Conversational Polish (Typing & Read Receipts)

## Why This Matters

A geração de uma estimativa via WhatsApp leva **20-40 segundos**:
- Download do áudio da Meta (~2s)
- Transcrição Whisper (~5-10s)
- Download e análise Vision das fotos (~5-15s)
- Geração da estimativa pelo Claude (~8-15s)

Durante esse tempo, do ponto de vista do usuário, **nada acontece**. Não há check de "mensagem entregue", não há "digitando…", apenas silêncio. Em conversas de WhatsApp esse silêncio sinaliza que a outra parte não viu ou não está respondendo — o usuário começa a enviar mais mensagens, achando que a primeira foi perdida.

Dois calls simples à Meta API resolvem isso completamente:

## A Implementação

### 1. Mark as Read

Logo no início de `handleInboundMessage()`, antes de processar:

```typescript
await markMessageAsRead(message.id, phoneNumberId)
```

Resultado: o ✓ azul do WhatsApp aparece no celular do usuário em <1s — confirma que a Xtimator recebeu.

Endpoint Meta:
```
POST /{phone-number-id}/messages
{
  "messaging_product": "whatsapp",
  "status": "read",
  "message_id": "wamid.XXX"
}
```

### 2. Typing Indicator

Após o read receipt, enviar typing indicator antes de começar o processamento pesado:

```typescript
await sendTypingIndicator(message.id, phoneNumberId)
```

Resultado: "typing…" aparece em baixo do nome no chat — sinaliza que a Xtimator está "pensando".

Endpoint Meta (mesma chamada do read, com campo extra):
```
POST /{phone-number-id}/messages
{
  "messaging_product": "whatsapp",
  "status": "read",
  "message_id": "wamid.XXX",
  "typing_indicator": { "type": "text" }
}
```

O indicator dura ~25s ou até a primeira mensagem ser enviada. Se o processamento passar disso, enviar de novo antes do timeout.

## Casos de Borda

- **Erro no processamento**: ainda enviar resposta de erro (cancela o typing automaticamente).
- **Mensagem duplicada (já processada)**: pular tudo (já respondemos antes; mandar read seria estranho).
- **Status webhook**: já é ignorado em `route.ts:48` — sem mudança.
- **Múltiplos read receipts no debounce buffer (SEED-010)**: marcar todas as msgs do buffer como lidas em batch ao processar.

## Scope Estimate

**Small** — algumas horas, 1 phase ou até parte de outra:

1. Adicionar 2 funções em `lib/whatsapp/client.ts`:
   - `markMessageAsRead(messageId, phoneNumberId)`
   - `sendTypingIndicator(messageId, phoneNumberId)`
2. Chamar `markMessageAsRead()` em `handler.ts` logo após dedup check passar
3. Chamar `sendTypingIndicator()` antes de operações de download/Whisper/Vision
4. Re-enviar typing indicator antes do timeout (25s) para processamentos longos
5. Testes unitários: mock Meta API, garantir que read é chamado antes de processar, typing é chamado antes do work pesado

## Breadcrumbs

- `lib/whatsapp/client.ts` — adicionar funções aqui; já tem `sendWhatsAppMessage()` como referência de auth/POST pattern
- `lib/whatsapp/handler.ts:80-86` — atual início de `processInboundMessage()`; ponto de inserção do mark-as-read após dedup
- `lib/whatsapp/handler.ts:87-110` — switch por tipo de mensagem; inserir typing indicator antes
- `app/api/webhooks/whatsapp/route.ts:91-98` — dedup check; após confirmar que NÃO é duplicata, então marca como read
- Meta API docs: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/mark-message-as-read
- Meta API docs: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-reaction (typing)

## Notes

- Esse seed é **independente** do SEED-010 (debounce), mas combina muito bem com ele — durante o buffer de 5s+ é exatamente quando typing indicator faz mais diferença.
- Mark-as-read **deve vir antes** do typing — ordem natural do WhatsApp (mensagem recebida → lida → outra parte digitando resposta).
- Custo: zero. Esses calls não contam contra o limite de mensagens da Meta — são metadata.
- Risco: nenhum. Se Meta API falhar, o envio do read/typing é fire-and-forget — não bloqueia processamento.
- Polish de qualidade enterprise — diferença sutil mas perceptível entre "bot funcional" e "bot polido".
