---
id: SEED-008
status: harvested
planted: 2026-05-08
planted_during: v1.4 Estimate Plain Text & Pricing Tools (post-milestone cleanup)
harvested: 2026-05-10
harvested_in: v2.0 WhatsApp Estimate Channel (Phases 40-45)
harvest_completeness: MVP — see Harvest Notes for gaps tracked in SEED-015
trigger_when: Milestone dedicado a canais de integração externos — WhatsApp, SMS, ou automação de comunicação com cliente
scope: Large
---

## Harvest Notes (2026-05-10)

v2.0 delivered a **functional MVP** of the WhatsApp channel. Comparing what this seed proposed vs. what was effectively implemented:

**Delivered:**
- ✅ Central webhook (`POST/GET /api/webhooks/whatsapp`) with HMAC-SHA256
- ✅ Routing by number (`company_whatsapp` table)
- ✅ Inbound processing: audio (Whisper) + text + photo (Claude Vision)
- ✅ Basic session management (state machine with 1 state: `awaiting_confirm`)
- ✅ Outbound delivery: share link + formatted text (configurable)
- ✅ Setup UI at `/settings/integrations` (phone + phoneNumberId + wabaId form)
- ✅ 30-minute session expiry with Vercel Cron + pg_cron safety net
- ✅ Admin panel: Meta access token card

**Not delivered (deferred):**
- ❌ Pre-send edit commands (`edit [item]`, `client [name]`) — only `send`/`cancel` accepted
- ❌ `awaiting_edit` state in the state machine — promised, absent
- ❌ PDF attachment as a delivery format — only share link + formatted text
- ❌ Provider abstraction (`TwilioAdapter` + `MetaAdapter`) — Meta only, hardcoded
- ❌ Number OTP verification during setup — credentials saved without proof of ownership
- ❌ Complete status flow (`pending → verified → active → suspended`) — jumps straight to `active`
- ❌ `provider` column in `company_whatsapp` — only Meta supported
- ❌ Rate limiting (mentioned as "20 projects/day") — covered by SEED-012

These gaps are consolidated in **SEED-015: WhatsApp Channel Completeness**. The original seed is preserved as reference for the complete vision.

# SEED-008: WhatsApp Estimate Channel

## Why This Matters

O Xtimator resolve o problema de gerar orçamentos profissionais a partir de campo. Mas hoje o usuário ainda precisa **abrir o app** para isso. No dia a dia de um service business americano (plumbing, HVAC, cleaning, landscaping), o WhatsApp é o canal de comunicação #1 com clientes — e os donos de negócio já estão lá.

**A visão:** o dono da empresa nunca precisa abrir o Xtimator para gerar um orçamento. Manda uma mensagem de WhatsApp → orçamento gerado → enviado pro cliente. Tudo pelo WhatsApp.

```
[Dono]  → WhatsApp → [Xtimator Bot] → AI pipeline → orçamento
[Dono]  ← confirmação ← [Bot]
[Dono]  → "send it" → [Bot] → WhatsApp/PDF/link → [Cliente]
```

## Fluxo Completo

### Fase 1 — Geração

O dono envia qualquer combinação de:
- 🎙️ **Áudio** — descrição do job (processado pelo Whisper, mesmo pipeline do app)
- ✍️ **Texto** — descrição digitada diretamente no WhatsApp
- 📸 **Foto** — fotos do job site (processadas pelo Claude Vision)
- ❌ **Vídeo** — não aceito (WhatsApp suporta, mas fora do escopo)

### Fase 2 — Confirmação pelo Bot

Antes de enviar ao cliente, o bot apresenta um resumo para confirmação:

```
Here's your estimate for Maria Silva:

🏠 Deep cleaning — 3 bedrooms
━━━━━━━━━━━━━━━━━━━━━━━
Living Room Cleaning:  $120
Master Bedroom:        $95
Bathroom x2:           $80
━━━━━━━━━━━━━━━━━━━━━━━
Total:                 $295

Client: Maria Silva
Send to: (555) 234-5678

Reply:
✅ "send" — send to client
✏️ "edit [item]" — change something
👤 "client [name]" — change client
❌ "cancel" — discard
```

O dono pode corrigir antes de enviar. Sessão expira em 30 minutos sem resposta.

### Fase 3 — Envio ao Cliente

O bot envia ao cliente em 3 formatos opcionais:
- **Texto formatado** — direto no WhatsApp do cliente (via API)
- **PDF** — attachment no WhatsApp (reutiliza pipeline @react-pdf/renderer)
- **Link** — share link existente (`/estimate/[token]`)

O dono escolhe o formato na configuração da conta (default: texto + link).

## Arquitetura Técnica

### Vinculação número → empresa (1:1)

Cada empresa vincula **um número de telefone do WhatsApp Business**. Esse número é do próprio dono (WhatsApp Business individual) ou um número Twilio dedicado.

```sql
-- Nova tabela
CREATE TABLE company_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL UNIQUE, -- E.164 format: +15551234567
  whatsapp_account_id TEXT,          -- Meta WABA ID ou Twilio SID
  provider TEXT NOT NULL,            -- 'twilio' | 'meta'
  status TEXT NOT NULL DEFAULT 'pending', -- pending | verified | active | suspended
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

RLS: apenas a empresa dona pode ver/modificar seu registro.

### Webhook central

Um único endpoint recebe todas as mensagens de todos os usuários:

```
POST /api/webhooks/whatsapp
```

Lógica de roteamento:
1. Extrai `from_number` da mensagem recebida
2. Busca `company_whatsapp WHERE phone_number = from_number`
3. Se encontrado → processa para aquela empresa
4. Se não encontrado → ignora silenciosamente (não é usuário cadastrado)

### Session management

Conversas multi-turn (generate → confirm → edit → send) precisam de estado temporário:

```sql
CREATE TABLE whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  state TEXT NOT NULL, -- 'awaiting_input' | 'awaiting_confirm' | 'awaiting_edit'
  draft_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  draft_estimate_id UUID REFERENCES estimates(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Ou alternativamente: Redis/KV store para sessões efêmeras (sem poluir o Supabase).

### Provider abstraction

Mesmo padrão que `lib/ai/` — uma interface `WhatsAppProvider` com implementações:
- `TwilioAdapter` — Twilio WhatsApp Business API
- `MetaAdapter` — Meta WhatsApp Cloud API (sem intermediário)

```typescript
interface WhatsAppProvider {
  sendMessage(to: string, content: TextContent | MediaContent): Promise<void>
  sendDocument(to: string, pdfBuffer: Buffer, filename: string): Promise<void>
  parseInbound(rawPayload: unknown): InboundMessage
}
```

O provider ativo é configurado no admin panel (mesmo padrão da AI provider selection).

### Identificação de cliente

Ao receber o primeiro áudio/texto/foto, o bot extrai o nome do cliente (SEED-007). Mas o WhatsApp também fornece `contact_name` do remetente — que pode ser usado para identificar o próprio dono da empresa (não o cliente do job).

A identificação do cliente do job vem do conteúdo (mesmo approach do SEED-007, não do número de WhatsApp do remetente).

## Setup por Empresa

Na `/settings/integrations` (nova aba ou section):

```
┌──────────────────────────────────────┐
│  WhatsApp Channel                    │
│                                      │
│  Status: ● Not connected             │
│                                      │
│  Connect your WhatsApp Business      │
│  number to generate estimates        │
│  directly from WhatsApp.             │
│                                      │
│  [Connect WhatsApp]                  │
└──────────────────────────────────────┘
```

Fluxo de conexão:
1. Dono insere o número de telefone
2. Bot envia código de verificação via WhatsApp
3. Dono confirma o código no app
4. Número ativado e vinculado à empresa

## Segurança

- **Autenticação por número**: apenas mensagens do número cadastrado são processadas. Qualquer outro número é ignorado silenciosamente — nunca retorna erro (evita enumeração).
- **Webhook signature verification**: Twilio e Meta assinam webhooks com HMAC-SHA256. Validar antes de processar.
- **Rate limiting**: máximo de N projetos por dia via WhatsApp (configurable per company, default 20).
- **No media storage bypass**: fotos recebidas via WhatsApp são baixadas temporariamente, processadas, e deletadas. Nunca armazenadas permanentemente fora do Supabase Storage.
- **Session expiry**: sessões de confirmação expiram em 30 minutos. Evita orçamentos fantasma.

## Scope Estimate

**Large** — 4-5 fases. Este é um milestone próprio:

1. **Infraestrutura do canal** — `company_whatsapp` table, webhook endpoint, provider abstraction (`TwilioAdapter` ou `MetaAdapter`), signature verification, roteamento por número.

2. **Inbound processing** — Receber áudio/texto/foto via WhatsApp → pipeline existente (Whisper + Claude Vision + generate-estimate). Projetos criados programaticamente (sem wizard).

3. **Confirmation flow** — Session management, bot apresenta resumo formatado, comandos de confirmação/edição/cancelamento, session expiry.

4. **Outbound delivery** — Envio ao cliente: texto formatado, PDF attachment, share link. Configuração de formato preferido por empresa.

5. **Setup e admin** — `/settings/integrations` para conexão do número, verificação, status. Admin panel: visibilidade de usage por empresa, suspensão por abuso.

**Fora do escopo:**
- Vídeo — não aceito (complexidade de processamento vs. valor)
- Multi-number por empresa — uma empresa, um número
- WhatsApp como canal de chat bidirecional com o cliente (além do envio do orçamento) — v3
- Números internacionais — US only (E.164 +1XXXXXXXXXX) no lançamento
- Chatbot conversacional completo (multi-turn sem estrutura) — o bot segue um script previsível, não é LLM livre

## Breadcrumbs

- `lib/ai/index.ts` — padrão `AIProvider` interface + factory. `WhatsAppProvider` segue o mesmo pattern
- `app/api/generate-estimate/route.ts` — pipeline reutilizado; nova rota `app/api/webhooks/whatsapp/route.ts` chama-o programaticamente
- `app/api/estimates/[id]/pdf/route.ts` — endpoint de PDF reutilizado para attachment
- `app/(app)/settings/` — settings pattern para nova aba `/settings/integrations`
- `platform_integrations` table — padrão de integrations no admin panel (Phase 8)
- `company_price_book` table — RLS pattern a replicar em `company_whatsapp`
- `lib/utils/estimate-template.ts` — `resolveTemplate()` + `buildItemsBreakdown()` reutilizados para formatar o texto de confirmação e envio

## Notes

- **Provider recomendado para MVP**: Twilio — melhor DX, sandbox grátis para dev, aprovação mais simples que Meta Cloud API diretamente
- **Meta Cloud API** como segunda opção: sem intermediário, menor custo por mensagem em escala, mas requer Meta Business Verification (processo mais lento)
- O número do dono da empresa é o **mesmo usado no dia a dia** — o dono não precisa de um número separado. WhatsApp Business permite usar o número pessoal ou um número dedicado.
- Cada empresa = um número = isolamento total. Não há risco de mensagens de um dono cair na empresa errada.
- O bot **nunca inicia conversa** — só responde inbound. Isso mantém o comportamento dentro do WhatsApp Business Policy (sem spam).
- Integra naturalmente com SEED-005 (multi-modal input) e SEED-006 (refinement) — o WhatsApp é apenas mais um canal de entrada, o pipeline de processamento é o mesmo.
