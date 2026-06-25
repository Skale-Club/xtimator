---
id: SEED-033
status: activating
planted: 2026-06-24
planted_during: v4.6 Pricing Intelligence (n8n MVP gap analysis — WhatsApp ↔ generation deep-dive)
trigger_when: User activated 2026-06-24. Surface as milestone candidate after v4.6 close-out; pairs naturally with any "owner assistant" or "multi-channel chat" scope.
scope: Large
---

# SEED-033: Industry Knowledge Base — Channel-Neutral Conversational Assistant

Um assistente de conhecimento que o **dono da empresa** consulta para tirar dúvidas de OFÍCIO ("como faço a remoção de odor de pet em carpete?", "qual o processo correto de pré-tratamento?"). A fonte é uma base de conhecimento **curada por indústria** (a plataforma escreve uma KB robusta de carpet cleaning, house cleaning, painting, etc.), com um nível **opcional por empresa** (overlay privado). O dono NUNCA navega a KB como documento — ele só a consulta **conversacionalmente** via chat do Xtimator (web), WhatsApp ou MCP.

## A distinção central (não-negociável)

Existem DOIS tipos de conhecimento na plataforma, e eles NÃO se misturam:

| | QUERY (já existe) | KNOWLEDGE (este seed) |
|---|---|---|
| Pergunta | "qual o último estimate do João?" | "como faço pré-tratamento de mancha de pet?" |
| Fonte | dados privados DESTA empresa | know-how da INDÚSTRIA (+ overlay da empresa) |
| Escopo | tenant-scoped (RLS por empresa) | **industry-scoped** (compartilhado) + **company-scoped opcional** |
| Quem cria | a própria empresa (seus estimates) | **super-admin** cura a base por indústria; admin da empresa cura o overlay opcional |
| Privacidade | secreto por empresa | neutro/compartilhado (industry) + privado (overlay) |

Mesma distinção já travada no `price_research_cache` (dado neutro compartilhado vs dados da empresa). A KB de indústria é um **ativo da plataforma**, servido a qualquer empresa cujo `companies.industries[]` inclua aquela indústria.

## Decisões travadas (2026-06-24)

1. **Dois níveis de KB, em DOIS painéis DIFERENTES (não confundir):**
   - **Industry KB (base) — painel SUPER-ADMIN (só nós, Xtimator):** curada pela plataforma, escopada por indústria (`lib/industries.ts` — 12 indústrias). Uma KB robusta de carpet cleaning serve TODOS os carpet cleaners. **O dono da empresa NÃO acessa nem edita** — é ativo da plataforma.
   - **Company KB (overlay opcional) — painel do DONO da empresa (tenant settings):** cada empresa adiciona suas próprias entradas privadas ("nosso processo específico") no **painel DELA** (settings do tenant), NÃO no super-admin. Opcional — empresa sem overlay usa só a industry KB.
   - Retrieval **mescla os dois**: entradas da(s) indústria(s) da empresa + entradas company-scoped da própria empresa.
   - ⚠️ **Os dois NÃO são o mesmo painel:** industry KB = super-admin (nós, escopo plataforma); overlay = settings do tenant (o dono, escopo da empresa dele). São superfícies de curadoria distintas, com RLS distinta (ver Escopo).

2. **Sem browser de KB para o dono.** O conteúdo NÃO é exibido como documento navegável ao dono da empresa. A KB é uma superfície de **retrieval conversacional** apenas — acessível só por consulta em chat. Não construir um "KB viewer" no app do dono.

3. **Acesso por 3 canais (channel-neutral):** chat do Xtimator (web), WhatsApp, MCP. A KB é um **módulo de domínio neutro** (`lib/knowledge/`), não uma feature de WhatsApp. Cada canal é apenas um consumidor — igual ao `generateEstimateForProject` que já serve web/WhatsApp/MCP.

4. **Retrieval: pgvector-only no v1; reranker é otimização guiada por dados (fase 2).** Como a KB é curada e escopada por indústria (corpus pequeno e limpo, não a internet), pgvector + embeddings basta. O reranker (cross-encoder) resolve um problema que o LLM já resolve a jusante quando se entrega top-5 passagens a ele e o corpus é pequeno — logo seu valor marginal no v1 é baixo. NÃO copiar o Cohere do n8n no dia 1. As alavancas de qualidade que importam mais no v1: (a) chunking, (b) embeddings decentes, (c) prompt de RAG. **Gatilho para adicionar reranker** — ligar SOMENTE quando ao menos um for verdadeiro: (i) o eval/produção mostrar miss de retrieval (passagem certa fora do top-5); (ii) o overlay company-scoped crescer a ponto de o corpus por empresa ficar grande e heterogêneo; (iii) uma indústria acumular muitas passagens quase-duplicadas onde a distinção fina importa. É barato adicionar depois — é uma camada entre `retrieve` e `answer`, NÃO muda o schema.

## O harness do WhatsApp JÁ EXISTE — só estender

O "harness" não precisa ser criado do zero. Já existe em [`lib/whatsapp/intent-router.ts`](lib/whatsapp/intent-router.ts) (`classifyAndRoute`) — o equivalente menor do router do n8n MVP. Hoje classifica em 4 intents e despacha:

```
mensagem → normalize → classify (gpt-4o) → dispatch
   ├── CREATE            → gera estimate
   ├── EDIT              → edita rascunho
   ├── CONFIRM_OR_CANCEL → envia/descarta
   └── QUERY             → ReAct agent sobre dados DA empresa
```

Este seed adiciona o **5º intent: `KNOWLEDGE`** → chama o módulo `lib/knowledge/` com retrieval escopado por `companies.industries[]` + overlay da empresa.

Regra de desambiguação classifier (a travar): **QUERY = pergunta sobre os REGISTROS/dados da empresa** (estimates, clientes, projetos). **KNOWLEDGE = pergunta de OFÍCIO/processo/how-to** que não depende dos dados da empresa. Default seguro continua `CREATE` (nunca uma ação privilegiada). Caso ambíguo "como devo precificar X?" — preferir QUERY se referencia o price book da empresa, KNOWLEDGE se é best-practice genérica.

## Arquitetura channel-neutral

```
        ┌─ lib/estimate/            (CREATE — já neutro, serve 3 canais)
        ├─ lib/whatsapp/query-tools (QUERY — dados da empresa)
NÚCLEO ─┤
        └─ lib/knowledge/           (KNOWLEDGE — NOVO módulo neutro)
              · retrieve(question, { industries, companyId }) → passages
              · merge industry KB + company overlay
              · pgvector similarity; reranker opcional (fase 2)
                  ↑
     ┌────────────┼────────────┐
  WhatsApp      Chat web        MCP tool
 (5º intent)  (painel "ask")  (ask_knowledge)
```

O módulo `lib/knowledge/` NÃO importa nenhum canal (ENGINE-01 neutrality). WhatsApp, chat web e MCP são consumidores finos.

## Escopo

**Large** — ~5-7 phases:

1. **Schema + pgvector**
   - Habilitar extensão `vector` no Supabase
   - `knowledge_entries` (id, scope 'industry'|'company', industry_id nullable, company_id nullable, title, body, source, embedding vector, created_at, updated_at)
   - Industry entries: RLS service-role-write, leitura escopada por industry (mirror `price_research_cache` posture — neutro/compartilhado)
   - Company entries: RLS tenant-scoped (company_id) como as demais tabelas multi-tenant
   - Índice HNSW/IVFFlat para similaridade
   - Migração idempotente; deploy via CI→GHCR→Coolify (nunca build na VPS)

2. **Knowledge domain module** — `lib/knowledge/`
   - `embed(text)` via OpenRouter/OpenAI embeddings (reusar `getIntegrationKey`)
   - `retrieve(question, { industries, companyId, k }) → passages[]` — busca vetorial mesclando industry KB (das `industries[]`) + company overlay; channel-neutral, never-throws. Deixar um ponto de extensão (seam) entre `retrieve` e `answer` onde um reranker opcional plugaria depois — sem implementá-lo no v1 (ver decisão #4)
   - `answer(question, ctx) → string` — RAG: monta prompt com os passages recuperados + injection-hardening (reusar `sanitizeField` + tag `<knowledge>` no padrão do `prompt-builder.ts`) e gera resposta curta/conversacional
   - Fixture adapter para CI determinismo (mirror PriceResearchProvider)

3. **Super-admin: industry KB curation**
   - Painel admin: CRUD de entradas por indústria (categoria nova ou seção sob integrações)
   - Ao salvar/editar, (re)gera embedding
   - Bulk import (markdown/CSV) para popular uma indústria de uma vez

4. **Admin da empresa: company KB overlay (opcional)**
   - UI no painel da empresa para adicionar entradas privadas próprias
   - Mesma geração de embedding; escopo company_id
   - Opcional — ausência de overlay = só industry KB

5. **WhatsApp: 5º intent KNOWLEDGE**
   - Estender o classifier ([`intent-router.ts:157`](lib/whatsapp/intent-router.ts)) com a 5ª label + regra de desambiguação QUERY vs KNOWLEDGE
   - `dispatchKnowledge` → `lib/knowledge/answer` escopado pela company resolvida; resposta via `sendOwnerReplyChunks` (já existe)
   - Default seguro `CREATE` preservado

6. **Chat web do Xtimator** (assistant panel)
   - Painel "pergunte ao assistente" no app web que consome o MESMO `lib/knowledge/` (e idealmente também roteia QUERY/CREATE — pode reusar uma versão neutra do harness)
   - NOTA: este item pode virar milestone próprio (chat web é superfície grande); a KB já fica pronta para ele

7. **MCP tool**
   - `ask_knowledge(question)` no MCP server (casa com [[SEED-030-mcp-server-xtimator]]) — mesma função neutra

## Breadcrumbs

- [`lib/whatsapp/intent-router.ts`](lib/whatsapp/intent-router.ts) — `classifyAndRoute` (o harness) + `classify` (adicionar 5ª label) + `dispatchQuery` (modelo para `dispatchKnowledge`)
- [`lib/whatsapp/query-tools.ts`](lib/whatsapp/query-tools.ts) — padrão de tools tenant-scoped read-only (o KNOWLEDGE é análogo mas sobre a KB)
- [`lib/industries.ts`](lib/industries.ts) — taxonomia de 12 indústrias (escopo da industry KB)
- `supabase/migrations/20260620000001_companies_industries_array.sql` — `companies.industries[]` (multi-trade) — o escopo de retrieval
- [`lib/ai/prompt-builder.ts`](lib/ai/prompt-builder.ts) — `sanitizeField` + bloco `## Security` para injection-hardening do conteúdo recuperado (tag `<knowledge>`)
- [`lib/estimate/price-research/cache.ts`](lib/estimate/price-research/cache.ts) — posture RLS service-role/neutro a espelhar para a industry KB
- [`lib/platform-config.ts`](lib/platform-config.ts) — `getIntegrationKey` para o provider de embeddings
- [`lib/admin/integrations-providers.ts`](lib/admin/integrations-providers.ts) — onde a curadoria **super-admin** (industry KB) se encaixa
- `app/(app)/settings/` — onde o **overlay company-scoped** (painel do dono/tenant) se encaixa — superfície DISTINTA do super-admin (ver decisão #1)
- `tests/eval/` — fixtures de retrieval/answer para CI determinismo

## Decisões ainda a travar antes de planejar

1. **Provider de embeddings:** OpenAI `text-embedding-3-small` via OpenRouter, ou outro? (Manter model-agnostic via painel, como SEED-031.)
2. **Idioma da KB:** conteúdo curado em inglês (mercado US) com resposta traduzida ao idioma do dono, ou KB multilíngue? (O Xtimator já traduz output — provavelmente KB em inglês + resposta no idioma do usuário.)
3. **Granularidade de chunk:** entrada inteira como 1 vetor, ou chunking por parágrafo? (Corpus curado é pequeno — começar com entrada-inteira e evoluir.)
4. **Reranker:** DECIDIDO — pgvector-only no v1; reranker entra como camada plugável guiada por dados (ver decisão travada #4 para o gatilho). Resta só escolher o vendor quando o gatilho disparar (Cohere vs alternativa).
5. **Chat web (item 6):** parte deste milestone ou milestone separado? (Inclina a separado — superfície grande.)

## Related Seeds & Decisions

- **[[SEED-030-mcp-server-xtimator]]** — `ask_knowledge` é uma tool MCP natural; o módulo neutro serve os dois
- **[[SEED-031-complexity-router-adaptive-model-selection]]** — mesmo padrão de slots de modelo configuráveis no painel pode reger o modelo de RAG da KB
- **[[SEED-008-whatsapp-estimate-channel]]** + **[[SEED-011-whatsapp-conversational-polish]]** — o harness do WhatsApp que estamos estendendo
- **Phases 105-109 (Price Research)** — a posture de "dado neutro compartilhado + RLS service-role" da industry KB espelha o `price_research_cache`

## Notas

**O insight central:** o n8n trata a Knowledge Base como uma tool do agente WhatsApp. O Xtimator inverte — a KB é um **módulo de domínio channel-neutral** e o WhatsApp é só um dos três consumidores. Isso é o que faz "coexistir perfeitamente com a estrutura que já temos": não é feature de canal, é capacidade de núcleo. Construir uma vez, servir WhatsApp + chat web + MCP.

**Por que industry-scoped é tão poderoso:** curadoria uma vez por indústria → valor para todos os tenants daquela indústria instantaneamente. É efeito de plataforma, não trabalho por cliente. O overlay company-scoped opcional adiciona personalização sem quebrar o ganho de escala.

**Segurança:** conteúdo recuperado entra no prompt do LLM — DEVE passar pelo injection-hardening existente (`sanitizeField` + tag dedicada), igual ao tratamento de web-search da Phase 107. Curado não é sinônimo de confiável quando vira contexto de LLM.
