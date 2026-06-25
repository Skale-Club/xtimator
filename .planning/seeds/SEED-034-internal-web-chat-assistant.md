---
id: SEED-034
status: activating
planted: 2026-06-24
planted_during: v4.6 Pricing Intelligence (n8n MVP gap analysis — WhatsApp ↔ generation deep-dive)
trigger_when: User activated 2026-06-24, referenciando o template Vercel AI Chatbot como estrutura base. Promove o item 6 do SEED-033 (chat web) a milestone próprio.
scope: Large
reference: https://github.com/vercel/ai-chatbot
---

# SEED-034: Internal Web Chat Assistant (Xtimator chat — 3º canal)

Um chat conversacional **dentro do app web do Xtimator** onde o dono da empresa faz tudo que já faz no WhatsApp — gerar/editar/enviar estimates, consultar seus dados, e tirar dúvidas de ofício (Knowledge Base) — em uma interface de chat rica com streaming. Construído sobre a **estrutura do template [Vercel AI Chatbot](https://github.com/vercel/ai-chatbot)**, mas assentado na infra que o Xtimator já tem.

## O princípio que rege tudo: WhatsApp = CHAT = MCP, três irmãos (paridade total — NÃO-NEGOCIÁVEL)

Os **três canais são irmãos** sobre o mesmo núcleo channel-neutral: WhatsApp, chat web (este seed) e MCP (SEED-030). Nenhum é uma nova IA, nenhum é uma versão reduzida — são três superfícies sobre as MESMAS capacidades de domínio. **Tudo que um canal faz, os outros dois fazem, chamando exatamente os mesmos módulos.** Comportamento idêntico entre canais; a diferença é só a superfície (web / WhatsApp / assistente externo) e a orquestração (tool-calling no chat e MCP, pre-classifier no WhatsApp).

> **Consequência para o MCP (SEED-030):** o escopo de "5 tools MVP" do SEED-030 fica SUPERADO por esta visão de paridade. O MCP deve expor as MESMAS capacidades (CREATE/EDIT/CONFIRM/SEND/QUERY/KNOWLEDGE + intake multimodal) que WhatsApp e chat — não um subconjunto. Mesma extração neutra serve os três.

```
        ┌─ lib/estimate/            (CREATE — gerar/editar estimate)
        ├─ lib/whatsapp/query-tools (QUERY — dados da empresa)   ← extrair p/ neutro
NÚCLEO ─┤
        └─ lib/knowledge/           (KNOWLEDGE — SEED-033)
                  ↑
     ┌────────────┼────────────┐
  WhatsApp     CHAT WEB        MCP
 (harness)   (ESTE SEED)    (SEED-030)
```

Se o chat web reimplementar QUALQUER lógica de geração/consulta/edição, falhamos. Ele reusa os módulos neutros; o template Vercel fornece só a CASCA (UI + streaming + persistência), não o miolo.

### Tabela de paridade — toda capacidade DEVE existir nos três canais

| Capacidade | Onde mora hoje | Chat + MCP usam | Critério de paridade |
|---|---|---|---|
| Intake multimodal (texto/áudio/foto) | [`normalize.ts`](lib/whatsapp/normalize.ts) | mesmo módulo (extrair p/ neutro) | áudio→transcrição e foto→análise idênticos |
| Gerar estimate (CREATE) | [`handler.ts`](lib/whatsapp/handler.ts) → `generateEstimateForProject` | mesma função de núcleo | mesmo estimate dado o mesmo input |
| Editar rascunho (EDIT) | [`agent.ts`](lib/whatsapp/agent.ts) + [`edit-commands.ts`](lib/whatsapp/edit-commands.ts) | mesmas funções de edição | mesmos comandos de edição reconhecidos |
| Confirmar/enviar ou cancelar | [`confirm-actions.ts`](lib/whatsapp/confirm-actions.ts) | mesmas ações | enviar/descartar idênticos |
| Pedir detalhes faltantes | [`ask-details.ts`](lib/whatsapp/ask-details.ts) | mesmo fluxo | mesma detecção de vagueness/awaiting_details |
| Entregar estimate (PDF/link) | [`send-estimate.ts`](lib/whatsapp/send-estimate.ts) + [`pdf-delivery.ts`](lib/whatsapp/pdf-delivery.ts) | mesma entrega | mesmo PDF/link |
| Consultar dados da empresa (QUERY) | [`query-tools.ts`](lib/whatsapp/query-tools.ts) | mesmas tools (extrair p/ neutro) | mesmas respostas tenant-scoped |
| Dúvidas de ofício (KNOWLEDGE) | `lib/knowledge/` (SEED-033) | mesmo módulo | mesma KB industry+overlay |

Os três canais (WhatsApp / chat / MCP) consomem esta MESMA coluna do meio. O que muda por canal é só a orquestração e a superfície de entrega — nunca a capacidade.

**Garantia de não-regressão:** a extração de `lib/whatsapp/` para módulos neutros é refactor NÃO-destrutivo — o WhatsApp passa a chamar as funções extraídas, e testes de paridade comportamental provam que o comportamento do WhatsApp não mudou. Só depois chat e MCP consomem as mesmas funções.

## O que ADOTAR vs o que SUBSTITUIR do template Vercel

O template é a referência de **estrutura e UX**, não de stack. O Xtimator já tem auth, db, storage e gateway de modelo — não trocamos nada disso.

| Camada | Template Vercel | Xtimator (o que usar) | Decisão |
|---|---|---|---|
| Framework | Next.js App Router + RSC + Server Actions | **igual** — já é o nosso | ADOTAR |
| UI | shadcn/ui + Tailwind + Radix | **igual** — já é o nosso | ADOTAR |
| Streaming/chat | **Vercel AI SDK** (`ai`, `useChat`, `streamText`, tool-calling UI) | NÃO temos — hoje é LangChain/LangGraph | **ADOTAR o AI SDK na camada de chat** (ver decisão #1) |
| Auth | Auth.js | Supabase Auth | SUBSTITUIR → Supabase |
| DB / ORM | Neon Postgres + Drizzle | Supabase Postgres (RLS) | SUBSTITUIR → Supabase |
| Storage | Vercel Blob | Supabase Storage / Hetzner | SUBSTITUIR → o nosso |
| Model gateway | Vercel AI Gateway | OpenRouter (seam existente) | SUBSTITUIR → OpenRouter |

Resumo: **pegamos a casca de chat + os padrões de streaming/tool-call do AI SDK, e plugamos na nossa infra.** Não é um fork do template — é portar os padrões dele.

## Decisões a travar antes de planejar

1. **DECIDIDO — AI SDK e LangGraph coexistem, em CAMADAS diferentes (não competem).** "LangGraph vs AI SDK" é a comparação errada: eles operam em camadas distintas.
   - **Camada de chat/streaming = Vercel AI SDK** (`useChat` no front, `streamText` + tool-calling no back). O LangGraph não tem história de UI de chat — fazer "tudo em LangGraph" significaria reimplementar à mão o protocolo de streaming/tool-call que o AI SDK dá pronto (justamente o valor do template pedido). O AI SDK fala com OpenRouter via provider OpenAI-compatible (mesma key, slot do painel — SEED-031).
   - **Motor de estimate = LangGraph (INTOCADO)**, invocado como UMA tool a partir do loop do chat. A geração é job async (Inngest) que retorna um estimate estruturado — NÃO é streaming de token — então a fronteira chat↔motor é uma **chamada de tool, não um bridge de streaming**. Não precisa do `LangChainAdapter` no v1.
   - **Evolução futura (não-fundação):** se um dia quisermos o raciocínio intermediário da geração streamando ao vivo no chat ("o grafo pensando"), aí entra a ponte `LangChainAdapter` do AI SDK para streamar um run LangGraph dentro do `useChat`. Fica deferido.
   - **Por que isso sustenta a paridade:** o chat NÃO reescreve o motor — chama o mesmo `generateEstimateForProject` que o WhatsApp chama. Camadas separadas = núcleo compartilhado = irmão de verdade.

2. **Orquestração: pre-classifier (paridade WhatsApp) ou tool-calling nativo do AI SDK?**
   - O WhatsApp usa um pre-classifier (`classifyAndRoute` → 5 intents). O template Vercel usa **tool-calling nativo** — o modelo decide chamar `createEstimate` / `queryData` / `askKnowledge` em tempo real, com a UI mostrando cada tool-call.
   - Para um chat web rico e em tempo real, **tool-calling nativo é mais natural** (multi-step, mostra o raciocínio, encadeia ações numa só conversa). Recomendação: **chat web usa tool-calling; WhatsApp mantém o pre-classifier.** Ambos chamam as MESMAS funções de domínio neutras — só a orquestração difere.
   - Pré-requisito: extrair as capacidades de domínio (gerar estimate, query-tools, knowledge) para tools channel-neutral que os dois canais compartilham.

3. **Multimodalidade:** o chat aceita áudio + foto (igual ao WhatsApp: `normalizeMessage` áudio→transcrição, foto→análise)? Recomendação: sim — reusar `lib/whatsapp/normalize.ts` ou extraí-lo para `lib/estimate/` neutro. É o core value prop ("do áudio ao orçamento").

4. **Escopo de canais do AI SDK:** o chat web é só pro **dono** (autenticado, tenant-scoped), nunca pro cliente final (consistente com a regra "Xtimator nunca conversa com o cliente final").

## Escopo

**Large** — milestone próprio, ~5-7 phases:

1. **Chat persistence schema** — espelhar `whatsapp_inbox`
   - `chat_conversations` (id, company_id, user_id, title, created_at, updated_at)
   - `chat_messages` (id, conversation_id, role 'user'|'assistant'|'tool', parts jsonb, attachments jsonb, created_at)
   - RLS tenant-scoped (company_id) como as demais tabelas multi-tenant
   - Migração idempotente; deploy via CI→GHCR→Coolify (nunca build na VPS)

2. **AI SDK + OpenRouter bridge**
   - Adicionar `ai` + provider OpenAI-compatible apontando para OpenRouter (mesma `getIntegrationKey('openrouter')`)
   - Resolver modelo pelos SLOTS do painel (casa com SEED-031 — o chat usa o slot configurado, não modelo cravado)
   - Rota `app/api/chat/route.ts` com `streamText` + tools

3. **Channel-neutral domain tools** (o trabalho que destrava os 3 canais)
   - Extrair de `lib/whatsapp/` as capacidades para tools neutras: `createEstimate`, `editEstimate`, `sendEstimate`, `queryCompanyData` (de `query-tools.ts`), `askKnowledge` (de `lib/knowledge/`, SEED-033)
   - WhatsApp passa a chamar as mesmas funções (refactor não-destrutivo — paridade comportamental garantida por testes)

4. **Chat UI** (casca do template)
   - `useChat` + componente de mensagens com message-parts e rendering de tool-calls (ex: "consultando o último estimate do João…")
   - Lista de conversas (sidebar), nova conversa, histórico persistido
   - Input multimodal (texto + áudio + foto) reusando `normalize`
   - shadcn/ui + Tailwind — alinhar ao design system atual (não copiar o tema do template cru)

5. **Tool-call UX + actions inline**
   - Quando o modelo gera um estimate, renderizar um card de estimate inline com ações (abrir no editor, enviar)
   - Streaming de resposta + estados de loading por tool

6. **Entitlement + observability**
   - Gate por tier (chat pode ser feature Pro/Business — casa com SEED-013)
   - `pipeline_events` para tool-calls do chat; telemetria de uso

7. **(opcional) Paridade de notificações**
   - Eventos do chat (estimate gerado/enviado) reusam o registry de notificações existente

## Breadcrumbs

- [`lib/whatsapp/intent-router.ts`](lib/whatsapp/intent-router.ts) — o harness do WhatsApp; o chat web é o canal-irmão (orquestração diferente, mesmas capacidades)
- [`lib/whatsapp/query-tools.ts`](lib/whatsapp/query-tools.ts) — tools tenant-scoped read-only a extrair para neutras (compartilhadas com o chat)
- [`lib/whatsapp/normalize.ts`](lib/whatsapp/normalize.ts) — áudio→transcrição / foto→análise a reusar/extrair para o input multimodal do chat
- [`lib/services/generate-estimate.ts`](lib/services/generate-estimate.ts) — `generateEstimateForProject` (núcleo neutro de CREATE) — o chat chama via tool
- [`lib/knowledge/`](lib/knowledge) — módulo de KB (SEED-033) — a tool `askKnowledge`
- [`lib/ai/index.ts`](lib/ai/index.ts) + [`lib/ai/provider-with-fallback.ts`](lib/ai/provider-with-fallback.ts) — resolução de modelo por slot (SEED-031); o AI SDK bridge lê o mesmo `ai_config`
- `supabase/migrations/20260527000001_whatsapp_inbox.sql` — modelo de paridade para `chat_conversations`/`chat_messages`
- [`lib/platform-config.ts`](lib/platform-config.ts) — `getIntegrationKey('openrouter')` para o provider do AI SDK
- `package.json` — hoje só `@langchain/*`; adicionar `ai` + `@ai-sdk/*` (decisão #1)

## Related Seeds & Decisions

- **[[SEED-033-industry-knowledge-base-conversational-assistant]]** — o chat web É o canal #3 do mesmo núcleo; este seed PROMOVE o item 6 daquele a milestone próprio. Construir `lib/knowledge/` neutro primeiro (ou em paralelo)
- **[[SEED-030-mcp-server-xtimator]]** — o MCP é o canal irmão; mesma extração de tools neutras serve os dois
- **[[SEED-031-complexity-router-adaptive-model-selection]]** — o chat usa os slots de modelo configuráveis no painel
- **[[SEED-008-whatsapp-estimate-channel]]** + **[[SEED-011-whatsapp-conversational-polish]]** — o canal WhatsApp cujo comportamento o chat deve igualar (e cuja lógica vamos extrair para neutro)
- **[[SEED-013-subscription-tiers-entitlements]]** — chat como feature de tier
- **[[SEED-005-multi-modal-project-input]]** — input multimodal do chat

## Notas

**O ganho estratégico não é "ter um chat" — é forçar a extração channel-neutral.** Para o chat web reusar as capacidades sem duplicá-las, somos obrigados a extrair `lib/whatsapp/` para tools de domínio neutras. Isso paga dividendo triplo: WhatsApp + chat web + MCP passam todos a consumir o MESMO núcleo. O chat é o evento que torna a neutralidade de canal real em vez de aspiracional.

**Não forkar o template.** O Vercel AI Chatbot é referência de padrões (estrutura de pastas, `useChat`, message-parts, tool-call rendering, persistência de conversa). Portamos os padrões para a nossa stack — não copiamos auth/db/storage/gateway dele. Tentar rodar o template cru e depois arrancar Auth.js/Drizzle/Neon/Blob seria mais caro que portar os padrões para a base Supabase/OpenRouter existente.

**AI SDK e LangGraph coexistem.** AI SDK = camada de conversa/streaming do chat. LangGraph = motor de geração de estimate (intocado). O chat chama o motor como uma tool; não reescrevemos o LangGraph no AI SDK.
