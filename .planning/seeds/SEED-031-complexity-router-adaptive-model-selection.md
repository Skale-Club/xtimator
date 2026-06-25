---
id: SEED-031
status: dormant
planted: 2026-06-24
planted_during: v4.6 Pricing Intelligence (n8n MVP gap analysis session)
trigger_when: Latência de geração vira reclamação de usuários OU milestone de qualidade/SLA de estimate OU implementação de tiers (Free/Pro/Business com qualidade diferenciada de AI)
scope: Medium
revised: 2026-06-24
revision_note: Reescrito após discussão. Mudanças-chave — (1) gate HEURÍSTICO determinístico, não LLM classificador; (2) gate UNIDIRECIONAL (rebaixa só com certeza, escala só com sinal); (3) motivado por LATÊNCIA + QUALIDADE, não custo; (4) modelos são SLOTS configuráveis no painel super-admin via OpenRouter — ZERO model hard-coded no código.
---

# SEED-031: Job Complexity Gate — Admin-Configurable Model Slots per Job Complexity

Antes de iniciar o LangGraph de geração, um **gate heurístico determinístico** (JS puro, sem IA) classifica a complexidade do job a partir de sinais baratos. A classificação escolhe um **slot de modelo** — e o model ID real de cada slot (qualquer modelo do OpenRouter) é configurado pelo **super-admin no painel**, não cravado no código.

## Princípios de design (travados em discussão 2026-06-24)

### 1. Gate HEURÍSTICO, não LLM classificador
No n8n o roteamento usa um LLM (GPT-4.1 Mini) porque lá a intenção conversacional é ambígua e depende do contexto do Redis. No Xtimator NÃO há ambiguidade conversacional — a transcrição inteira e a metadata do projeto já estão na mão. Complexidade de job é detectável por sinais determinísticos:
- contagem de palavras da transcrição
- nº de serviços / cômodos detectados
- nº de fotos anexadas
- vertical (limpeza vs HVAC vs construção)
- presença de keywords de alto risco ("commercial", "permit", "inspection", "HVAC", "electrical", "subcontractor")

JS puro: **zero hop de IA, zero latência adicional, zero ponto de falha novo, determinístico e testável no eval harness.** Não colocar LLM no loop de classificação.

### 2. Gate UNIDIRECIONAL (risco assimétrico)
Errar para baixo (mandar job complexo pro modelo barato) faz o dono enviar um orçamento ruim a um cliente real — downside ordens de magnitude maior que a economia. Logo o gate tem direção:
- **Rebaixa para o slot rápido SOMENTE com altíssima confiança de que o job é trivialmente simples.**
- **Escala para o slot premium quando detecta sinal de complexidade.**
- **Na dúvida → fica no slot padrão (default).**

Não é uma tricotomia neutra simples/médio/complexo — é um gate com default seguro que só desvia quando o sinal é forte.

### 3. Motivado por LATÊNCIA + QUALIDADE, não custo
A conta de custo não fecha: custo por estimate no Sonnet é de poucos centavos (~$0.05-0.12); um tenant com 100 estimates/mês gasta ~$8-12/mês em IA. Economizar isso não justifica um hop a mais + risco. Os valores REAIS são:

| Eixo | Mecanismo | Valor |
|---|---|---|
| **Latência** (jobs simples) | gate → slot rápido | cumpre a promessa "do áudio ao orçamento em <5min"; gratificação instantânea em ~8s vs ~25s |
| **Qualidade** (jobs complexos) | gate → slot premium + price research ON | escala qualidade onde importa (commercial, multi-trade) |

Custo vira efeito colateral bem-vindo, não a tese.

### 4. Modelos são SLOTS configuráveis no painel super-admin
**ZERO model ID hard-coded no código do router.** O gate só decide um slot lógico:
- `model_fast` — jobs rebaixados (latência)
- `model_default` — padrão (= comportamento atual)
- `model_premium` — jobs escalados (qualidade)

O super-admin mapeia cada slot → qualquer model ID do OpenRouter no painel de integrações (categoria AI), estendendo o padrão `ai_config.openrouter_default_model` que JÁ existe. Trocar o modelo de qualquer slot é uma config no painel, sem deploy. O Xtimator é model-agnostic — Claude, Gemini, GPT, o que o admin escolher.

## Por que isso importa

**Problema:** Hoje 100% dos estimates rodam no mesmo modelo (`ai_config.openrouter_default_model`), independente de o job ser "limpar 2 quartos" ou "reforma comercial de 20 salas". Jobs simples (60-70% do volume no target market) sofrem a mesma latência que os complexos, e jobs complexos não recebem tratamento premium + research forçado.

**Oportunidade:**
- **Latência:** jobs simples geram quase instantaneamente — reforça o core value prop do produto ("<5min").
- **Qualidade diferenciada:** jobs complexos disparam o melhor modelo configurado + price research ON, sem o dono pedir.
- **Tier story:** o slot premium (e o gate de escalar) pode ser entitlement do tier Business — diferenciação legítima de qualidade entre planos.
- **Flexibilidade total de modelo:** quando sair um modelo novo melhor/mais barato no OpenRouter, o admin troca o slot no painel — o router não muda.

**Origem:** n8n MVP (Carpet Cleaning V.2) usa roteamento multi-modelo por intenção. Tradução para Xtimator: intenção conversacional → complexidade de job; LLM classificador → gate heurístico; modelos cravados → slots configuráveis no painel.

## Quando Surfaçar

Durante `/gsd-new-milestone` quando o escopo tocar em:
- **Performance / latency** — se latência de geração virar reclamação (jobs simples melhoram automaticamente)
- **Subscription tiers / entitlements** — slot premium como feature de tier (casa com SEED-013)
- **Quality / SLA de estimate** — quando medir e diferenciar qualidade por tipo de job
- **Admin / platform config** — qualquer milestone que expanda o painel de super-admin

**Não surfaçar durante:** bug-fixing, estabilidade pura (o gate adiciona um ponto de decisão), antes de ter dados de produção sobre distribuição de complexidade.

## Escopo

**Medium** — ~3-4 phases:

1. **Heuristic complexity gate** — `lib/estimate/router/complexity-gate.ts`
   - Interface: `classifyComplexity(transcript, metadata) → { slot: 'fast' | 'default' | 'premium', signals: {...}, reason }`
   - JS puro, determinístico, sem chamada de IA
   - Default seguro: sem sinal forte → `default`
   - Rebaixa para `fast` só com confiança alta (thresholds conservadores nos sinais)
   - Escala para `premium` ao detectar keywords/contagem de alto risco
   - 100% testável: fixtures de jobs com slot esperado no eval harness

2. **Admin model slots** — estender `ai_config` + painel
   - `ai_config.openrouter_model_fast` / `_default` / `_premium` (default e premium podem cair no `openrouter_default_model` atual se não configurados → retrocompat)
   - UI: na categoria AI do painel ([`lib/admin/integrations-providers.ts`](lib/admin/integrations-providers.ts) + a tela de seletor de provider), adicionar 3 campos de model ID (com o catálogo/autocomplete de modelos OpenRouter)
   - Resolver: estender `getAIProvider(companyId)` para aceitar um slot e ler o model ID correspondente do `ai_config`

3. **Wire no pipeline + research toggle**
   - Chamar o gate em `generateEstimateForProject` logo após `validateProject`, antes de instanciar o provider
   - Passar o slot resolvido para `getAIProviderWithFallback`
   - Slot `premium` ativa `price_research: true` no orchestrator (Phase 108 já tem o hook)
   - Metrificar: `pipeline_events.model_slot` para análise de distribuição

4. **Entitlement gate + observability**
   - `lib/entitlements.ts`: `allowedModelSlots` por tier (Free: sem `premium`; Business: todos)
   - Dashboard interno: distribuição de slots por período
   - Eval: assertion de que o slot correto foi escolhido por fixture; A/B sample de jobs `fast` pra calibrar o limite de qualidade

## Breadcrumbs

- [`lib/ai/index.ts`](lib/ai/index.ts) — `getAIProvider(companyId)` + cadeia de precedência de modelo (`ai_model_override` → `ai_config.openrouter_default_model` → fallback). **Ponto central** — estender para resolver por slot.
- [`lib/ai/provider-with-fallback.ts`](lib/ai/provider-with-fallback.ts) — `getAIProviderWithFallback` — propagar o slot
- [`lib/ai/providers/openrouter.ts`](lib/ai/providers/openrouter.ts) — `OpenRouterAdapter(model: string)` — já aceita qualquer model ID; nada muda aqui
- [`lib/admin/integrations-providers.ts`](lib/admin/integrations-providers.ts) — catálogo da categoria AI + seletor de provider; adicionar os 3 campos de slot
- [`lib/platform-config.ts`](lib/platform-config.ts) — `ai_config` metadata — adicionar as 3 chaves de slot
- [`lib/services/generate-estimate.ts`](lib/services/generate-estimate.ts) — chamar o gate após `validateProject`, antes do provider
- [`lib/entitlements.ts`](lib/entitlements.ts) — `allowedModelSlots` por tier
- [`lib/observability/pipeline-events.ts`](lib/observability/pipeline-events.ts) — campo `model_slot`
- [`lib/estimate/price-research/orchestrator.ts`](lib/estimate/price-research/orchestrator.ts) — slot `premium` força research ON
- [`tests/eval/`](tests/eval/) — fixtures de complexidade

## Critérios heurísticos (esboço — calibrar com dados)

```
FAST slot (rebaixa SÓ com confiança alta):
  - transcrição < ~80 palavras
  - 1 serviço, 1 localização, 0-2 fotos
  - vertical de baixa variância (limpeza residencial, corte de grama)
  - NENHUMA keyword de alto risco
  - → exemplos: "limpar 2 quartos e 1 banheiro", "cortar grama do quintal"

DEFAULT slot (tudo que não cai claramente nos outros dois):
  - o comportamento atual; o porto seguro

PREMIUM slot (escala ao detectar sinal):
  - transcrição > ~300 palavras OU 5+ serviços OU keyword de alto risco
  - "commercial", "permit", "inspection", "HVAC", "electrical", "subcontractor", "multi-unit"
  - → exemplos: "reforma comercial completa", "HVAC install 20-unit building"
```

Thresholds são ponto de partida — após 3-6 meses, analisar `pipeline_events.model_slot` vs taxa de edição/rejeição pós-geração para afinar. Sempre conservador: quando em dúvida, `default`.

## Related Seeds & Decisions

- **[[SEED-013-subscription-tiers-entitlements]]** — `allowedModelSlots` por tier usa essa estrutura; slot premium pode ser feature Business
- **[[SEED-005-multi-modal-project-input]]** — contagem/tipo de fotos é sinal heurístico de complexidade
- **[[SEED-032-advanced-pricing-model-tax-discount-deposit]]** — independente; ambos saíram da análise do calculator do n8n
- **Phases 105-109 (Price Research)** — slot `premium` aciona research ON; o orchestrator da Phase 108 já tem o hook

## Notas

**O insight central:** o n8n usa IA pra rotear porque precisa desambiguar conversa. O Xtimator não precisa — ele tem o job inteiro de antemão, então roteia por regras determinísticas baratas. E o Xtimator NÃO crava modelos: o gate decide um slot lógico, o super-admin pluga qualquer modelo OpenRouter em cada slot pelo painel. Combina o roteamento multi-modelo do n8n com a flexibilidade de model-agnostic + controle total de admin que o Xtimator já tem na infra.

**Não confundir com custo:** se alguém vender esse seed como "corta custo de IA", está errado. O valor é latência (jobs simples instantâneos) + qualidade (jobs complexos com modelo premium + research). Custo é bônus.

**Calibração de qualidade antes de ligar o `fast`:** rodar o eval harness com o slot `fast` apontando para um modelo barato e comparar a qualidade vs `default` numa amostra real antes de habilitar o rebaixamento em produção. O gate só ganha o direito de rebaixar depois que o eval provar que a qualidade aguenta.
