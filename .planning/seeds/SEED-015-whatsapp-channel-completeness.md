---
id: SEED-015
status: dormant
planted: 2026-05-10
planted_during: v2.0 WhatsApp Estimate Channel (post-milestone audit of SEED-008 vs delivered MVP)
trigger_when: When iterating on WhatsApp UX after v2.0, when first paying customers complain about not being able to edit estimates before sending, when adding alternate WhatsApp provider (Twilio), or when tightening number verification security
scope: Medium
---

# SEED-015: WhatsApp Channel Completeness

## Why This Matters

A v2.0 (Phases 40-45) entregou um MVP funcional do canal WhatsApp, mas **deixou de fora vários elementos que o SEED-008 original propôs**. O resultado é um sistema utilizável mas com limitações sérias para uso de produção:

1. **Sem edit pré-envio** — o dono não pode corrigir a estimativa antes do cliente receber. Se viu um erro, precisa cancelar e refazer todo o input (gravando áudios, tirando fotos de novo). UX brutalmente quebrada.
2. **Sem OTP verification** — qualquer um com `phoneNumberId` + `wabaId` (público no Meta Business Suite) pode reivindicar um número no Xtimator. Sem proof of ownership, isso é vulnerabilidade.
3. **Sem PDF attachment** — clientes que preferem documento formal (especialmente segmento high-ticket: construction, HVAC commercial) só recebem texto ou link.
4. **Sem provider abstraction** — se a conta Meta for suspensa ou se a Meta mudar termos, não há fallback para Twilio. Lock-in arriscado.
5. **Status pula direto para 'active'** — o flow `pending → verified → active → suspended` foi promessa do schema mas nunca usado. Status é cosmético.

Este seed **não duplica o SEED-008** — ele completa o que ficou de fora. Os gaps abaixo são independentes entre si e podem ser atacados em ordem de prioridade.

## Os Gaps em Detalhe

### Gap 1: Edit Commands Pré-Envio (PRIORIDADE ALTA)

**Estado atual:** `lib/whatsapp/confirm.ts:49-54` aceita só `send` / `cancel`.

**Estado promissor:** parser reconhece comandos estruturados:

```
edit total 450
edit section 1 "Living Room Deep Clean"
edit item 2.3 price 85
edit timeline "Job completes in 2 days"
edit payment "50% upfront, 50% on completion"
client "Maria Silva" 5551234567
add item kitchen "Stove cleaning" 60
remove item 1.2
regenerate         ← refaz a estimativa do zero com mesmo input
```

Cada comando dispara mutation no Supabase (estimate/sections/items/project tables) e re-envia o resumo atualizado. Sessão **permanece em `awaiting_confirm`** — não muda de estado.

Para comandos ambíguos ou inválidos, agente leve (Claude Haiku) interpreta:
```
"aumenta o preço dos quartos em 10%"
"tira a cozinha"
"o cliente é o João, telefone 555..."
```

Esse approach respeita o padrão LLM-first do Xtimator (estimate gen já usa Claude), mas mantém comandos diretos como atalhos sem dependência de IA.

### Gap 2: OTP Verification Durante Setup (PRIORIDADE ALTA)

**Estado atual:** `lib/actions/whatsapp-settings.ts → connectWhatsApp()` faz upsert direto com status='active'. Zero prova de que o usuário controla aquele número.

**Estado promissor:** flow de duas etapas:

```
[1] User submete phoneNumber + phoneNumberId + wabaId
   → status='pending'
   → gera código de 6 dígitos
   → envia código via WhatsApp para phoneNumber
   → retorna sucesso pra UI

[2] User digita código recebido no celular
   → server valida código (TTL 10min, max 3 tentativas)
   → se OK: status='verified' → 'active'
   → revalidate cache
```

Schema:
```sql
ALTER TABLE company_whatsapp
  ADD COLUMN verification_code TEXT,
  ADD COLUMN verification_attempts INT DEFAULT 0,
  ADD COLUMN verification_expires_at TIMESTAMPTZ;
```

UI: dois cards no `WhatsAppConnectCard`:
- Conexão (atual) → muda label de botão pra "Send verification code"
- Verificação (novo) → input de 6 dígitos + "Verify"

### Gap 3: PDF Attachment Delivery (PRIORIDADE MÉDIA)

**Estado atual:** `lib/whatsapp/confirm.ts → handleSend` envia share link ou texto formatado. Tabela `company_whatsapp.delivery_format` é enum `share_link | formatted_text`.

**Estado promissor:** terceira opção `pdf_attachment`:

```typescript
const PDF_DELIVERY_FORMATS = ['share_link', 'formatted_text', 'pdf_attachment'] as const
```

Pipeline:
1. Gerar PDF reutilizando `app/api/estimates/[id]/pdf/route.ts`
2. Upload do PDF no Supabase Storage (bucket `estimates-pdf`, 24h TTL)
3. Obter signed URL
4. Meta API call com `type: "document"`:
```json
{
  "messaging_product": "whatsapp",
  "to": "{clientPhone}",
  "type": "document",
  "document": {
    "link": "{signedUrl}",
    "filename": "Estimate-MariaSilva-2026-05-10.pdf",
    "caption": "Your estimate from {companyName}"
  }
}
```

UI: adicionar opção no select de `delivery_format` em `WhatsAppConnectCard`.

### Gap 4: Provider Abstraction (PRIORIDADE BAIXA)

**Estado atual:** `lib/whatsapp/client.ts` chama Meta Graph API hardcoded. Token vem de `platform_integrations`.

**Estado promissor:** interface `WhatsAppProvider`:

```typescript
interface WhatsAppProvider {
  send(to: string, content: MessageContent): Promise<MessageResult>
  sendDocument(to: string, document: DocumentContent): Promise<MessageResult>
  markAsRead(messageId: string): Promise<void>
  verifySignature(rawBody: string, signature: string): boolean
  parseInboundPayload(payload: unknown): InboundMessage[]
}

class MetaWhatsAppProvider implements WhatsAppProvider { /* atual */ }
class TwilioWhatsAppProvider implements WhatsAppProvider { /* novo */ }

// lib/whatsapp/index.ts
export function getProvider(companyId: string): WhatsAppProvider {
  const config = await getCompanyWhatsAppConfig(companyId)
  return config.provider === 'twilio' ? new TwilioWhatsAppProvider() : new MetaWhatsAppProvider()
}
```

Schema:
```sql
ALTER TABLE company_whatsapp ADD COLUMN provider TEXT NOT NULL DEFAULT 'meta';
```

Webhook handler precisa rotear por `provider` (Twilio e Meta têm payloads diferentes).

### Gap 5: Status Flow Real (PRIORIDADE BAIXA)

**Estado atual:** SQL aceita 4 valores (`pending | verified | active | suspended`) mas só `active` é usado. Mortos:
- `pending` deveria ser estado inicial pré-OTP (Gap 2 resolve)
- `verified` deveria ser pós-OTP, pré-ativação manual em admin
- `suspended` deveria ser estado controlado por admin (abuse, payment failure)

Após resolver Gap 2, o flow natural é:
```
pending  → user inseriu credenciais, aguardando OTP
verified → OTP confirmado, pronto pra ativar
active   → admin/billing aprovou (ou auto-aprova em planos pagos)
suspended → admin pausou por abuse ou plano cancelado
```

Inbound webhook só processa mensagens de números com status='active'. Já é assim — a mudança é no setup, não no runtime.

## Sequência Sugerida

```
v2.1 (Hotfix UX)
├── Gap 1: Edit commands ← maior impacto, conecta com SEED-006 e SEED-010
└── Gap 2: OTP verification ← segurança crítica, bloqueia escalation

v2.2 (Polish & Reliability)
├── Gap 3: PDF attachment ← demanda específica de segmentos high-ticket
└── Gap 5: Status flow real ← depende de Gap 2

v3.x (Hedge contra lock-in)
└── Gap 4: Provider abstraction ← só relevante se Meta virar problema
```

## Scope Estimate

**Medium** — 2-3 fases distribuídas em milestones:

- **Gap 1 (Edit)** — 1 fase, 2-3 dias. Parser + mutations + re-envio do resumo. Optional: agente Claude Haiku para comandos ambíguos.
- **Gap 2 (OTP)** — 1 fase, 1-2 dias. Schema migration + send-code action + verify-code action + UI atualizada.
- **Gap 3 (PDF)** — 0.5 fase, 1 dia. Reutiliza pipeline PDF existente, adiciona signed URL + Meta API call.
- **Gap 4 (Provider)** — 1 fase, 2-3 dias. Refactor + TwilioAdapter implementação.
- **Gap 5 (Status flow)** — 0.5 fase, 0.5 dia. Wiring após Gap 2.

## Breadcrumbs

**Gap 1 (Edit):**
- `lib/whatsapp/confirm.ts:49-54` — `parseCommand()` precisa virar parser estruturado
- `lib/whatsapp/confirm.ts:23-44` — `processConfirmationReply()` dispatcher; adicionar branches para edit/add/remove/regenerate/client
- `lib/queries/estimate.ts` — mutations existentes podem ser reutilizadas
- `app/api/estimates/[id]/refine/` — referência de refinement pipeline (web-side); padrão a portar pra WhatsApp

**Gap 2 (OTP):**
- `lib/actions/whatsapp-settings.ts:connectWhatsApp` — split em `requestVerification()` + `confirmVerification()`
- `components/settings/whatsapp-connect-card.tsx:76+` — adicionar segundo step de UI
- `lib/whatsapp/client.ts:sendWhatsAppMessage` — função existente serve para mandar o código
- `supabase/migrations/` — nova migration para colunas de verification

**Gap 3 (PDF):**
- `app/api/estimates/[id]/pdf/route.ts` — endpoint PDF existente; chamar internamente
- `lib/whatsapp/confirm.ts:handleSend` — ramo `if (deliveryFormat === 'pdf_attachment')`
- Supabase Storage bucket `estimates-pdf` — provisionar com TTL 24h ou usar signed URL

**Gap 4 (Provider):**
- `lib/whatsapp/client.ts` — refatorar inteiro como `MetaWhatsAppProvider`
- `lib/whatsapp/verify.ts` — `verifyWebhookSignature()` vira método da interface
- `app/api/webhooks/whatsapp/route.ts` — roteamento por provider antes de parsing
- Twilio docs: https://www.twilio.com/docs/whatsapp/api

**Gap 5 (Status flow):**
- `lib/whatsapp/handler.ts:33-39` — query filtra `status='active'`; já está correto, só precisa do flow real upstream
- `app/admin/integrations/` — UI admin pra forçar status=suspended (abuse)

## Notes

- **Conexão com SEED-010 (debounce buffer):** edit commands e debounce buffer são features adjacentes. Implementar juntos faz sentido — o usuário envia 5 mensagens (debounce agrega), recebe resumo, então pode editar antes de enviar.
- **Conexão com SEED-013 (entitlements):** PDF attachment pode ser feature de tier pago (Business only). Provider choice (Twilio) também pode ser premium.
- **Conexão com SEED-014 (errors):** edit commands inválidos são candidatos perfeitos para `XtimatorError('bad_request', 'whatsapp', ...)` com user message contextual.
- **Por que dividir SEED-008 em SEED-015?** O SEED-008 foi harvested oficialmente — sua história precisa ser preservada como "vision document" da v2.0. Reabrir o status seria revisionismo histórico. SEED-015 é a continuação natural, marcando o que ficou de fora explicitamente.
- **Decisão deliberada vs esquecimento?** Os gaps acima provavelmente foram cortes conscientes de escopo durante o planejamento da v2.0 (entregar MVP em 6 fases). Esse seed apenas torna explícito o que ficou em backlog implícito.
