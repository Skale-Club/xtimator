---
id: SEED-007
status: dormant
planted: 2026-05-08
planted_during: v1.4 Estimate Plain Text & Pricing Tools (post-milestone cleanup)
trigger_when: Próximo milestone focado em onboarding de projetos, fluxo de campo, ou UX do client management
scope: Medium
---

# SEED-007: Frictionless Client-Project Association

## Why This Matters

Hoje o wizard de novo projeto tem um passo obrigatório: **selecionar ou criar o cliente antes de qualquer coisa**. O usuário precisa saber o nome do cliente, buscar na lista, ou criar um perfil completo — tudo isso antes de gravar qualquer áudio ou tirar qualquer foto.

No mundo real de um service business no campo, isso é atrito desnecessário:

> *"Eu acabei de chegar no job site, quero gravar a situação enquanto a informação está fresca. Não quero ficar digitando o nome do cliente no meio da rua."*

Além disso, abrir o app de clientes para criar um novo projeto ligado a um cliente existente exige: ir para `/clients` → clicar no cliente → voltar → ir para `/projects/new` → re-selecionar o cliente. Isso é 4 telas para uma ação direta.

## Duas Melhorias

### Melhoria 1: AI-inferred client — sem cadastro obrigatório no onboarding

**Fluxo proposto:**

```
/projects/new → [escolha de modalidade: áudio/texto/foto — SEED-005]
    ↓
Grava/digita/fotografa o serviço imediatamente
    ↓
AI analisa o conteúdo e extrai: nome do cliente (se mencionado)
    ↓
Branch:
  A) Nome encontrado + match com cliente existente → vincula automaticamente
  B) Nome encontrado + sem match → cria novo cliente (só com o nome)
  C) Sem nome mencionado → projeto criado sem cliente (pode vincular depois)
    ↓
[Projeto criado e redireciona para estimate generation]
    ↓
[Banner discreto: "Client not linked — add client info any time"]
```

**O que muda no onboarding:**
- Client select deixa de ser step obrigatório
- O wizard passa de 1 step (client select) para 0 steps — o usuário vai direto para a entrada de conteúdo (audio/text/photo, SEED-005)
- A criação do projeto acontece com `client_id: null` inicialmente (já suportado pelo schema — `client_id UUID REFERENCES clients(id) ON DELETE SET NULL`)
- O AI extrai nome do cliente durante a análise de transcrição/texto/imagem e tenta vincular

**Vinculação pós-criação:**
- Na aba "Overview" do workspace do projeto, se `client_id` é null, um card proeminente aparece: "No client linked — link or create one"
- Simples dropdown com busca (clientes existentes) + opção "Create new client"
- Dados do cliente (email, phone, address) podem ser completados no perfil do cliente depois do projeto ser criado

### Melhoria 2: "New Project" button no client card

**Hoje:**
- `/clients/[id]` tem: avatar, dados de contato, lista de projetos, botões "Edit" e "Delete"
- Para criar um projeto para esse cliente: o usuário precisa ir para `/projects/new` e re-selecionar o cliente

**Proposta:**
- Adicionar botão **"New Project"** no header do `ClientDetailPage` (ao lado de Edit/Delete)
- Clicar redireciona para o fluxo de entrada de conteúdo (SEED-005) com o `client_id` já passado como parâmetro
- O projeto é criado com o cliente já vinculado — sem step de seleção
- URL: `/projects/new?client=<client_id>` ou equivalente via state

```
┌────────────────────────────────────────────┐
│  [Avatar] Maria Silva                      │
│  maria@example.com · (555) 123-4567        │
│                                            │
│  [Edit]  [Delete]  [+ New Project] ←       │
└────────────────────────────────────────────┘
```

## AI Client Extraction — Como Funciona

No prompt de geração de orçamento, o Claude já recebe a transcrição + fotos. Para extração de cliente, adicionar instrução:

```
If the transcript mentions a client name or company, extract it.
Return it in the JSON as "detected_client_name": "..." (null if not found).
```

A action de criação do projeto faz o match:
1. `detected_client_name` retornado pelo Claude
2. Busca case-insensitive nos clientes existentes da empresa
3. Match encontrado → `UPDATE projects SET client_id = ?`
4. Sem match → `INSERT INTO clients (name, company_id) VALUES (?, ?)` → vincula

Isso acontece **após** a geração do orçamento, não antes — não bloqueia o fluxo principal.

## Scope Estimate

**Medium** — 2-3 fases:

1. **Client optional no onboarding** — Remover client select como step obrigatório. Projeto pode ser criado com `client_id: null`. Card "Link client" na aba Overview do workspace. Integração com SEED-005 (a rota de input já não precisa pedir cliente).

2. **AI client extraction** — Após geração do orçamento, Claude retorna `detected_client_name`. Action de post-process faz match/create e vincula. Notificação discreta na UI: "Client detected: Maria Silva — linked automatically" ou "Client not found — create one?"

3. **"New Project" no client card** — Botão no `ClientDetailPage` + `ClientDetailActions`. Wizard de projeto recebe `?clientId=` via searchParam e pula seleção de cliente.

**Fora do escopo:**
- Merge automático de clientes duplicados — v2
- Detecção de cliente por foto (reconhecimento de logo em foto) — v3
- Proposta de "clientes similares" (typo handling) na hora do match — pode ser Claude's discretion

## Breadcrumbs

**Melhoria 1 (AI-inferred client):**
- `components/projects/new-project-wizard.tsx` — remover step de client select; projeto criado com `client_id: null`
- `app/api/generate-estimate/route.ts` — adicionar `detected_client_name` no response do Claude
- `lib/actions/project.ts` (ou equivalente) — post-generation hook para match/create client
- `components/workspace/overview-tab.tsx` — adicionar card "Link client" quando `client_id` é null
- `projects` table: `client_id UUID REFERENCES clients(id) ON DELETE SET NULL` — já suporta null

**Melhoria 2 (New Project no client card):**
- `app/(app)/clients/[id]/page.tsx` — adicionar botão "New Project" no header
- `components/clients/client-detail-actions.tsx` — ou direto na page, seguindo o padrão existente
- `components/projects/new-project-wizard.tsx` — aceitar `clientId` via props/searchParam e pular seleção
- `app/(app)/projects/new/page.tsx` — ler `?clientId=` de searchParams e passar para o wizard

## Notes

- As duas melhorias são independentes e podem ser implementadas em fases separadas. A Melhoria 2 (botão no client card) é trivialmente simples e pode ser uma fase própria pequena.
- A Melhoria 1 integra naturalmente com SEED-005 (multi-modal input) — quando o wizard não tem mais step de client select, a entrada de conteúdo se torna imediata.
- `client_id` já é nullable no schema (`ON DELETE SET NULL`) — nenhuma migração de DB necessária para suportar projetos sem cliente.
- O nome detectado pela AI deve ser mostrado para o usuário antes de criar o cliente automaticamente — evitar criar "Maria" quando o usuário disse "a Maria do apartamento 201" e já existe "Maria Aparecida" no sistema.
