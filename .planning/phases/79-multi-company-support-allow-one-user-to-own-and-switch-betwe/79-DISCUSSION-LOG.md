# Phase 79: Multi-company foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 79-multi-company-support-allow-one-user-to-own-and-switch-betwe
**Areas discussed:** Phase scope decomposition, Add-company flow UX, Cache strategy, Storage paths, Phase 79 split shape, Trial clock for additional companies, Active-company cookie fallback

---

## Phase scope decomposition

| Option | Description | Selected |
|--------|-------------|----------|
| Splitar em sub-fases | Phase 79 vira foundation (company_members + migration + cookie + active company resolution); fases 80-83 entregam: RLS rewrite, server-action sweep, switcher UI + add-company, billing per-company. Mais 'shippable' por incremento. | ✓ |
| Vertical slice MVP em uma fase | Phase 79 entrega só o mínimo end-to-end: schema + cookie + switcher + add-company funcionando, mas mantém queries antigas onde der. Mais rápido pra mostrar a feature, porém com queries mistas durante a transição. | |
| Tudo na Fase 79 | Bundle a milestone inteira em um plano monstro. Provavelmente o planner vai pedir split de qualquer jeito. | |

**User's choice:** Splitar em sub-fases
**Notes:** v4.0 milestone tem ~7 chunks distintos no PROJECT.md (schema, active tracking, switcher UI, add-company flow, RLS rewrite, billing per-company, server-action sweep) — não cabem em uma fase.

---

## Add-company flow UX

| Option | Description | Selected |
|--------|-------------|----------|
| Reusar /onboarding com query ?mode=add | Mesma wizard atual. Em mode=add: a action faz INSERT-always, define a nova como active company no cookie, redireciona pra /dashboard da nova company. Reaproveita 100% do código da wizard. | ✓ |
| Rota separada /companies/new | Wizard nova/simétrica, com cópia diferente, pular language step se já escolhido antes. Mais código, intent mais claro. | |
| Modal in-app sem sair da página | Pop-up com form minimal (só company name + industry), depois leva pra settings pra completar resto. Mais rápido pro usuário, porém fora do padrão estabelecido em Fase 2. | |

**User's choice:** Reusar /onboarding com query ?mode=add
**Notes:** Reuso máximo da wizard existente (Phase 2 — 8 steps com brand identity + defaults). `createOrUpdateCompany` ganha parâmetro `mode: 'first' | 'add'` para alternar o branch.

---

## Cache strategy para getCachedCompany

| Option | Description | Selected |
|--------|-------------|----------|
| Trocar key para activeCompanyId + revalidateTag('company') no switch | `getCachedCompany(activeCompanyId)` em vez de `(userId)`. Switch action chama `revalidateTag('company')`. Mantém unstable_cache pra performance. | ✓ |
| Remover unstable_cache e ler direto da DB sempre | Sem cache, sem chance de stale data. Custo: ~30ms a mais por request. Simples porém mais lento. | |
| Cache por userId + filtrar in-memory por active id | Carrega TODAS as companies do usuário em cache, switch só muda cookie. Ruim se usuário tiver muitas companies. | |

**User's choice:** Trocar key para activeCompanyId + revalidateTag('company') no switch
**Notes:** Aproveita infra existente do `unstable_cache` e do tag system. Phase 79 só muda a key; Phase 80 wires o `revalidateTag` call no switch action.

---

## Storage paths para logo

| Option | Description | Selected |
|--------|-------------|----------|
| Migrar para `${company.id}/logo.${ext}` | Plano inclui migration script que move arquivos existentes pra novo path e atualiza `companies.logo_url`. Sem ambiguidade dali pra frente. | ✓ |
| Manter user.id e bloquear upload novo até refactor futuro | Add-company sem logo (só inicial). Usuário sobe logo depois via Settings. Adia o trabalho. | |
| Path com sufixo: `${user.id}/${company.id}-logo.${ext}` | Não quebra nada existente, não exige migration de storage. Funciona porém path não reflete owner real. | |

**User's choice:** Migrar para `${company.id}/logo.${ext}`
**Notes:** Decisão correta arquiteturalmente. Movido para Phase 80 (bundled com add-company logo upload code path) para não inflar Phase 79.

---

## Phase 79 split shape (cut detalhado)

| Option | Description | Selected |
|--------|-------------|----------|
| F79 = foundation pura | Fase 79: schema company_members + migration backfill + active_company_id cookie + helpers getActiveCompanyId/getActiveCompany + atualizar layout. App continua funcionando com 1 company. Sem UI nova. F80: switcher UI + add-company mode. F81: server-action sweep. F82: RLS rewrite. F83: billing per-company. | ✓ |
| F79 = foundation + UI visível (vertical slice) | Fase 79: foundation + switcher dropdown + 'Add company' funcional + onboarding ?mode=add. Usuário já vê valor. Mas queries antigas mostram dados da 1ª company até F80/F81 — risco de bug visível: trocar company no switcher não muda dashboard. | |
| F79 = foundation + server-actions sweep | Fase 79: foundation + reescrever as ~20 server actions. Switcher UI fica pra F80. Mais infra, menos UX nessa fase. | |

**User's choice:** F79 = foundation pura
**Notes:** Sem UX visível em F79 — fase é "pure plumbing". Reduz risco do switcher mostrar dados inconsistentes (porque server actions ainda não derivariam de cookie). Phases 80-83 ficam claros e independentes.

---

## Trial clock para companies adicionais

| Option | Description | Selected |
|--------|-------------|----------|
| Cada company tem trial próprio de 14 dias | Consistente com 'billing per-company' literal. Usuário pode criar nova company e ter 14 dias frescos. Espelha o `createOrUpdateCompany` atual que seta `tier_trial_ends_at = NOW + 14d` no INSERT. | |
| Companies adicionais herdam tier da 1ª company do usuário | Se usuário já é paid na company A, company B nasce paid. Evita 'farm de trials'. Mas exige lógica de herança entre companies do mesmo owner — contradiz 'billing per-company' literal. | ✓ |
| Companies adicionais nascem em 'free' sem trial | Sem trial fresco, sem herança. Usuário precisa pagar explicitamente pra usar features pagas na nova company. Mais conservador. | |

**User's choice:** Companies adicionais herdam tier da 1ª company do usuário
**Notes:** Decisão de negócio explícita: prioriza prevenção de trial-farming sobre "billing per-company" literal. CONTEXT.md D-14/D-15 documentam essa exceção e marcam Phase 83 (billing per-company) para revisitar se dados reais mostrarem que o heurístico está errado.

---

## Active-company cookie fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Resolver pra company mais recentemente criada do usuário | Query company_members ordenado por created_at desc, pega top 1. Se 0 memberships → redirect /onboarding (igual hoje). Define cookie e segue. | ✓ |
| Resolver pra primeira company criada (ordem histórica) | Top 1 por created_at asc. Garante que volta sempre pra 'company original'. Menos surpresa pra quem tinha 1 antes. | |
| Prompt: tela 'Choose company' se >1 member sem cookie | Página intermediária force-pick. Mais explícito, porém adiciona fricção. Provavelmente over-engineered. | |

**User's choice:** Resolver pra company mais recentemente criada do usuário
**Notes:** Comportamento previsível, sem prompt extra. Cookie validation acontece em todo `getActiveCompanyId()` call — se cookie aponta pra company que o usuário não é mais member, cai no fallback.

---

## Claude's Discretion

Áreas onde o planner/executor tem liberdade técnica (documentadas em CONTEXT.md):
- Exact migration filename (timestamp prefix segue convenção existente)
- `company_members.role`: CHECK constraint vs Postgres enum (planner pode escolher — CHECK é mais simples com só um valor válido hoje)
- Internal file structure de `lib/queries/active-company.ts` (split em múltiplos arquivos vs single)
- Test surface: unit tests obrigatórios pra cookie/fallback logic e migration backfill; UI tests não são necessários (nenhuma UI ship nessa fase)

## Deferred Ideas

Trabalho mapeado pra futuras phases (80-83), todas pertencentes ao milestone v4.0:
- **Phase 80**: Switcher UI + add-company entry point + storage path migration `${user.id}/logo` → `${company.id}/logo`
- **Phase 81**: Server-action sweep — rewrite ~20 actions em `lib/actions/*.ts` + helpers em `lib/queries/company.ts` pra derivar company_id de cookie em vez de user_id
- **Phase 82**: RLS rewrite — ~12 tenant-scoped tables migradas pra gate por membership; drop `companies.user_id` ao final
- **Phase 83**: Billing per-company — Stripe customer per-company, usage_events scoping, trial cron iterando companies não users
