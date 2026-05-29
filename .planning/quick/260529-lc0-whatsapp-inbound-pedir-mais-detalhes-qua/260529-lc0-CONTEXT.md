# Quick Task 260529-lc0: WhatsApp — pedir detalhes quando texto vago - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Task Boundary

No fluxo inbound do WhatsApp, quando a mensagem do cliente é vaga demais para
precificar, o bot deve RESPONDER PEDINDO MAIS DETALHES em vez de gerar e enviar
um estimate de $0 e abrir sessão `awaiting_confirm`.

Validado em produção 2026-05-29: mensagem detalhada gerou estimate de $3.277,50;
mensagem vaga gerou estimate $0,00 + awaiting_confirm (comportamento a corrigir).
</domain>

<decisions>
## Implementation Decisions (LOCKED)

### 1. Detecção de "vago"
- Heurística no job do WhatsApp: o estimate é "vago" quando **total == 0 OU não há
  nenhum line item** (todas as seções vazias / sem `estimate_items`).
- NÃO adicionar flag de IA agora. NÃO alterar `generateEstimateForProject`
  (serviço compartilhado por UI/MCP) — a detecção e o desvio ficam SOMENTE no job
  do WhatsApp (`lib/inngest/functions/whatsapp-process.ts`).

### 2. Experiência da próxima mensagem — Abordagem B (awaiting_details)
- Ao detectar vago, em vez de `confirm-and-session`:
  - **Apagar o estimate $0** recém-gerado (e suas seções/itens) para não poluir.
  - **Reverter o status do projeto** para `draft` (o `generateEstimateForProject`
    seta `estimate_ready` + `total`; precisa voltar pra draft / total 0).
  - **Manter o projeto draft** (não apagar) — ele será complementado.
  - Criar `whatsapp_sessions` com **`state='awaiting_details'`**, `draft_project_id`
    = projeto atual, `draft_estimate_id` = null, com o mesmo TTL/expires.
  - Enviar a mensagem pedindo detalhes (ver decisão 3).
  - Retornar SEM abrir awaiting_confirm.
- No **handler** (`lib/whatsapp/handler.ts`): quando existir sessão ativa em
  `awaiting_details` para o remetente, a(s) nova(s) mensagem(ns) devem
  **complementar o MESMO projeto** (`draft_project_id`), não criar projeto novo:
  re-despachar `EVENT_WHATSAPP_PROCESS` com o `projectId` existente. O job já
  insere recordings (texto/áudio) e photos no `projectId` recebido e regenera;
  a re-avaliação de "vago" roda de novo (loop até ficar precificável).
- Hoje o handler só trata `awaiting_confirm` em `processSingleMessageWithSession`;
  é preciso ramificar para `awaiting_details` (sem passar pelo debounce/criação
  de projeto novo). Idempotência via batchKey/wamid deve continuar valendo.

### 3. Mensagem pedindo detalhes
- Com exemplos do que informar: tipo de serviço, área (m²/cômodos), materiais e
  prazo.
- **Respeitar o idioma resolvido** (pt/en/es). `GenerateEstimateResult` retorna
  `language` — usar esse valor para escolher a cópia localizada (3 idiomas).

### Claude's Discretion
- Nome exato dos helpers, formato do texto localizado, e se a reversão do estimate
  $0 é via delete em cascata ou marcando is_current=false + delete.
- Limite de loop (quantas vezes pedir detalhes) — pode deixar sem limite rígido
  por ora, mas registrar como consideração.
</decisions>

<specifics>
## Specific Ideas

- Pipeline: `app/api/webhooks/whatsapp/route.ts` → `lib/whatsapp/handler.ts`
  (`processInboundWithDebounce`/`processInboundMessages` dispara Inngest) →
  `lib/inngest/functions/whatsapp-process.ts` (`whatsAppProcessJob`).
- `whatsAppProcessJob` passos: por-mensagem (recording/photo) → `refresh-typing`
  → `generate-estimate` (chama `generateEstimateForProject`) → `confirm-and-session`
  (cria `whatsapp_sessions` awaiting_confirm + envia resumo "Reply send/cancel").
- `generateEstimateForProject` (lib/services/generate-estimate.ts): seções vazias
  quando input vago → `grandTotal = 0`; seta projeto `estimate_ready`; retorna
  `{ estimateId, version, clientSuggestion, language }`.
- Empresa de teste: **Skleanings** (`d0a4bf2b-f94c-4461-9dd5-923ae24b0a0f`),
  número `+5517981259735` registrado `active` em `company_whatsapp`.
</specifics>

<canonical_refs>
## Canonical References

- Memória do projeto: arquitetura inbound do WhatsApp (roteamento por número do
  remetente, tier gate, Inngest, free-form 24h window).
- `lib/whatsapp/confirm.ts` — referência do padrão de tratamento de reply de sessão.
</canonical_refs>
