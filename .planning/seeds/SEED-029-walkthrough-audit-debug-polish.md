---
id: SEED-029
status: planted
planted: 2026-05-20
planted_during: v3.1.1 MVP Launch Prep (UX QA cleanup)
trigger_when: Próximo ciclo focado em ativação / first-run UX, ou imediatamente antes do v3.2 deploy em Hetzner — o tour é parte do funil de ativação e está em estado frágil
scope: Medium
---

# SEED-029: Walkthrough Audit, Debug & Polish (Tour & Tooltips QA Round 2)

## Why This Matters

O tour pós-onboarding é o **primeiro contato guiado** que o usuário tem com o produto. Hoje:

- **Owner percebe como "mal feito"** — sinal de que algo está visivelmente quebrado ou desorientado, mesmo que os unit tests passem
- **UAT manual nunca foi executado.** A Phase 75 foi declarada "auto-approved" apenas com lint + unit tests + Playwright skipado (auth fixture ausente). O runbook em `tests/visual/tour-uat-runbook.md` foi adiado para "primeiro deploy em Hetzner".
- **3 gotchas mitigados parcialmente** continuam sinalizados como frágeis na pesquisa da Phase 75 (cookie race, dual selector mobile, rAF loop)
- **Sem confirmação real em browser** desde a Phase 74 — toda a "polish" da Phase 75 foi feita sem olhar a tela

A tour está num estado curioso: **arquitetura sólida, execução não-verificada**. Esse seed existe pra fechar a lacuna entre "passa nos testes" e "funciona pra um usuário real".

## O que sabemos hoje (do audit)

### Arquitetura atual (Phase 75-delivered)

- **Sem biblioteca externa** — implementação custom usando shadcn/Radix
- Componentes em `components/tour/`:
  - `tour-provider.tsx` — contexto, lê cookie `onboarding_complete`, dispara welcome modal
  - `welcome-modal.tsx` — modal de boas-vindas (Dialog)
  - `tour-spotlight.tsx` — 5 passos guiados com spotlight via `position:fixed`
  - `contextual-tooltip.tsx` — tooltips de hover (Radix Tooltip)
  - `tour-step.tsx` — definição dos 5 passos
  - `use-tour.ts` — hook que conversa com localStorage
  - `tour-help-button.tsx` — botão "?" para re-abrir o tour
- Persistência em `lib/tour/persistence.ts` (chaves namespaced `xtimator:tour:v1:...`)
- 5 passos: new-project → projects → clients → price-book → language-toggle

### O que está em risco (consolidado do audit)

| # | Risco | Severidade | Onde |
|---|-------|------------|------|
| 1 | Dual `[data-tour="language-toggle"]` no topbar **e** bottom-nav — mobile pode iluminar elemento invisível | **Alta** | `tour-spotlight.tsx:33-42, 79` |
| 2 | rAF contínuo a cada frame pra trackear posição do alvo — jank em mobile low-end | Média | `tour-spotlight.tsx:73-94` |
| 3 | Sem `aria-hidden`/`inert` no fundo durante spotlight — foco vaza pra sidebar/topbar via Tab | Média | `tour-spotlight.tsx` (falta) |
| 4 | Cookie race no Strict Mode (Phase 75 mitigou mas marca como frágil) | Baixa | `tour-provider.tsx:46-53` |
| 5 | `ContextualTooltip` não checa `prefers-reduced-transparency` (TourSpotlight checa) | Baixa | `contextual-tooltip.tsx` (inconsistente com `tour-spotlight.tsx:65-68`) |
| 6 | Help button `z-50` em `bottom-24 right-4` pode colidir com toasts/Sonner | Baixa | `tour-help-button.tsx:35` |
| 7 | `migrateLegacyKeys()` roda em todo mount do `TourProvider` (idempotente, mas desperdiça ciclos) | Trivial | `tour-provider.tsx:44` |
| 8 | UAT manual (`tour-uat-runbook.md`) nunca executado em EN/PT/ES | **Alta** | bloqueio de produção |
| 9 | Playwright `tour-flow.spec.ts` (15 testes) `test.skip` esperando auth fixture | Média | `tests/e2e/tour-flow.spec.ts` |
| 10 | Cópia dos passos pode estar **desatualizada vs UI atual** (ex: features renomeadas, telas que sumiram) | A descobrir | `tour-step.tsx:8-39` |

## Conceito

Duas etapas, na ordem:

### Etapa 1: Diagnóstico (não-código)

Antes de mexer em qualquer linha, **rodar o app e o tour em browser de verdade** — desktop + mobile, EN + PT + ES — capturando screenshots e gravações. Sem isso a gente continua adivinhando.

Output: um documento `75.2-WALKTHROUGH-FINDINGS.md` (ou similar) com:
- Lista de bugs visuais reais (com screenshot anexado)
- Lista de bugs comportamentais (com gravação anexada)
- Avaliação de cópia: cada passo ainda faz sentido? alvos ainda existem? selectors batem?
- Avaliação de fluxo: ordem dos passos faz sentido? algum passo é redundante? falta algum passo crítico (ex: explicar que a IA gera tudo)?

### Etapa 2: Refatoração cirúrgica

Com a lista em mãos, atacar **na ordem de impacto do usuário**, não na ordem de descoberta:

1. **Conteúdo primeiro.** Se a cópia está errada, a UI mais polida do mundo não salva. Re-escrever os passos com base em o que realmente acontece no app hoje.
2. **Selectors e mobile.** Resolver o dual selector do language-toggle, garantir que mobile renderiza tudo certo.
3. **Acessibilidade.** Adicionar `inert`/`aria-hidden`, focus trap, gating de `prefers-reduced-transparency` no ContextualTooltip.
4. **Performance.** Trocar rAF contínuo por ResizeObserver + scroll listener (ou trazer `@floating-ui/react` que já é uma dep transitiva via Radix).
5. **Telemetria.** Logar `tour_started`, `tour_step_advanced`, `tour_completed`, `tour_skipped` pra ter dado real de funil — hoje o tour é caixa-preta.

## UX Sketch — o que muda visivelmente

Antes (estado atual):
```
[Welcome modal] → [spotlight passo 1/5] → [spotlight 2/5] → ... → [fim]
```
Problemas observáveis prováveis:
- Spotlight gruda em elemento errado no mobile (language-toggle)
- Card do passo pode sair da tela em viewports estreitos
- Sidebar continua tabulável atrás do overlay
- Cópia pode mencionar features renomeadas ou inexistentes

Depois (proposto):
```
[Welcome modal limpo] → [spotlight com Floating UI] → ... → [Done — toast "Tour finished, click ? to revisit"]
```
- Spotlight sempre acerta o alvo certo (visible-target check robusto)
- Card respeita safe-area mobile, sempre dentro da viewport
- Resto da UI fica inert durante o passo (Tab não vaza)
- Cópia revisada com base em o que o usuário **realmente** vai encontrar

## Scope Estimate

**Medium** — 3-4 fases:

### Fase A — Diagnóstico em browser real (S)
- Subir o app local
- Rodar o runbook `tour-uat-runbook.md` em EN, PT, ES
- Repetir em mobile viewport (~390px)
- Capturar **screenshots** e **gravações** de cada bug encontrado
- Produzir o documento `WALKTHROUGH-FINDINGS.md` com lista priorizada
- **Critério de saída:** time consegue olhar a lista e dizer "vai" ou "para o seed" sem mais discussão

### Fase B — Conteúdo + selectors (S-M)
- Re-escrever cópia dos passos com base nos findings
- Resolver dual selector do language-toggle (helper `findVisibleTarget` mais robusto, ou repensar usar `IntersectionObserver`)
- Garantir que **todos os data-tour attrs existem** nas páginas alvo (regression possível de phases recentes)
- Possivelmente adicionar/remover passos (ex: adicionar um passo sobre a IA / capture)

### Fase C — A11y + performance (S-M)
- `inert` ou `aria-hidden` no fundo durante spotlight (preferência: trocar o custom div por `Dialog` do Radix, que já faz isso de graça)
- Focus trap durante o passo
- `prefers-reduced-transparency` consistente entre TourSpotlight e ContextualTooltip
- Substituir rAF contínuo por ResizeObserver + scroll listener (ou Floating UI `autoUpdate`)
- Resolver colisão de z-index entre help button e toasts

### Fase D — Telemetria + Playwright (S)
- Logar 4 eventos via `estimate_activity` ou tabela própria (`tour_events`?): `tour_started`, `tour_step_completed`, `tour_finished`, `tour_skipped`
- Habilitar os 15 testes `tour-flow.spec.ts` que estão skipados (precisa da auth fixture — ver se ela já existe em Phase 76+)
- Adicionar 2-3 testes Playwright novos cobrindo os bugs reais encontrados na Fase A

**Fora do escopo:**
- Tour para features avançadas (price book detalhado, white label, etc) — esse é um tour de **ativação**, não um tour de poder
- Tour para o painel /admin — tem usuários diferentes (platform admins), seed separado se precisar
- Vídeo embeddado ou Loom — sai do orçamento de complexidade do MVP
- A/B test entre dois copies — primeiro precisamos ter um copy que funcione

## Breadcrumbs

- `components/tour/tour-provider.tsx` — contexto + lê cookie + dispara welcome
- `components/tour/welcome-modal.tsx` — modal de boas-vindas (4 bullets, 2 CTAs)
- `components/tour/tour-spotlight.tsx:33-42, 65-94` — `findVisibleTarget`, rAF loop, reduced-transparency check
- `components/tour/contextual-tooltip.tsx:67` — `collisionPadding`, falta `prefers-reduced-transparency` gate
- `components/tour/tour-step.tsx:8-39` — definição dos 5 passos (cópia + selectors)
- `components/tour/use-tour.ts` — hook que conversa com persistência
- `components/tour/tour-help-button.tsx:35` — botão "?", z-50, possível colisão com toasts
- `lib/tour/persistence.ts` — namespaced localStorage + migrateLegacyKeys
- `tests/unit/tour/tour-state-machine.test.ts` — 9 casos, GREEN
- `tests/unit/tour/tooltip-persistence.test.ts` — 7 casos, GREEN
- `tests/e2e/tour-flow.spec.ts` — 15 testes skipados aguardando auth fixture
- `tests/visual/tour-uat-runbook.md` — runbook manual de 111 linhas, **nunca executado**
- `.planning/phases/75-tour-and-tooltip-qa/75-RESEARCH.md` — 9 gotchas catalogados, leitura obrigatória antes de mexer
- `.planning/known-issues.md` (Phase 75 closeout) — admite explicitamente "risco: bugs não-descobertos podem aparecer no v3.2 deploy"

## Notes

- **Não é refatoração arquitetural.** O state machine + persistence layer da Phase 75 estão sólidos (16/16 unit tests verdes). Esse seed é sobre **fechar a lacuna entre "código correto" e "experiência de usuário real"**, não trocar a fundação.
- **Diagnóstico antes de código.** Se a gente pula direto pra "vamos consertar X e Y", arrisca refatorar coisas que funcionam e deixar passar o bug real (que pode ser cópia ou mobile-specific).
- **Considerar trocar TourSpotlight por `<Dialog>` do Radix.** A11y de graça (focus trap, aria-hidden no fundo, inert, ESC). O "spotlight visual" pode virar um overlay separado posicionado via Floating UI. Reduz código custom em ~150 linhas.
- **A cópia é provavelmente onde está o maior problema percebido pelo owner.** Tour content é fácil de ficar desatualizado conforme o produto evolui. SEED-027 listava "Record audio, Add photos, AI generates, Send PDF" — checar se essas labels ainda casam com o vocabulário atual da UI (ex: "Estimate" vs "Quote", "Project" vs "Job").
- **Coordenação com SEED-027.** Aquele seed era sobre **criar** o tour. Esse é sobre **estabilizar** o tour. Não duplica nem invalida, complementa.
- **Coordenação com SEED-028.** O fluxo Draft → Consolidate é novo (recém-implementado). O tour ainda **não menciona isso** — possível passo adicional na Fase B se a gente quiser que o usuário saiba do workflow.
- **Telemetria de tour é underrated.** Hoje a gente não sabe se o usuário pula no passo 1 ou no 5. Mesmo um log simples em `estimate_activity` ou numa tabela `tour_events` resolve isso e pode justificar futuras decisões de UX baseadas em dados.
- **Mobile é o caso mais arriscado.** Owner pode estar testando em mobile e vendo o language-toggle do topbar invisível "iluminado" embaixo de um overlay — esse seria um bug óbvio e barulhento, mas só visível em browser real.
- **Considerar reduced-motion seriamente.** Spotlight com animação de pulse + transição de posição pode causar tontura em quem ativou reduced-motion. TourSpotlight tem o gate de transparency, mas pode não ter o de motion.
