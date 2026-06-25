---
id: SEED-035
status: activating
planted: 2026-06-24
planted_during: v4.6 Pricing Intelligence (billing/monetization design session)
trigger_when: User activated 2026-06-24 como o motor de receita obrigatório. Próximo milestone de monetização; substitui o modelo count-based atual por créditos.
scope: Large
---

# SEED-035: Credit-Based Subscription Billing — assinatura + créditos de IA com margem

Assinatura mensal (ex: $49/mês) que concede uma cota de **créditos**. Os créditos são consumidos conforme o cliente usa a NOSSA IA. 1 crédito = uma fração do custo real OpenRouter/Whisper **× markup**, garantindo lucro por construção. Stripe é só o **trilho de pagamento**; a inteligência de créditos é **nossa**.

## Princípios travados (sessão 2026-06-24)

### 1. Stripe é o TRILHO, o credit ledger é NOSSO
- **Stripe Billing** cobra a assinatura recorrente (plano base) + os **top-ups** avulsos (checkout one-time). Customer portal, faturas, cartão = Stripe. O founder está nos EUA com EIN + Stripe — sem fricção.
- **NÃO usamos o metered/usage-based billing do Stripe.** O metering de IA vive no NOSSO `credit_ledger`. Stripe não sabe o que é "crédito" — ele só processa o $X/mês e os top-ups.
- Por quê: amarrar a lógica de créditos ao metered billing de um gateway te faz refém dele. Mantendo o ledger nosso, trocar de gateway no futuro é trocar só o trilho.
- **Dois fluxos de pagamento distintos** (NÃO confundir): (1) **Dono → Xtimator** = ESTE seed (assinatura+créditos); (2) **Cliente final → Dono** = [[SEED-020-stripe-connect-customer-payments]] (Stripe Connect, pagamento do estimate/deposit). São cobranças diferentes.

### 2. Modelo de crédito: HÍBRIDO (backend custo-real, frontend simples)
- **Backend:** cada operação de IA debita `custo_real × MARKUP`. Margem garantida por construção — à prova de mudança de preço de modelo E sinérgico com os model slots (SEED-031: job roteado pro modelo barato → menos custo → menos crédito debitado → créditos do cliente duram mais → margem sobe).
- **Frontend:** saldo simples ("você tem 1.240 créditos") + guia aproximado por ação ("um estimate ≈ 10-15 créditos"). O cliente nunca vê matemática de token.
- Denominação interna: **1 crédito = $0.01 de valor-IA cobrado** (charged value). Débito de uma operação = `custo_real × MARKUP / 0.01` créditos.

### 3. Regra de consumo: debita onde NÓS gastamos IA
> **Todo ponto que ativa a NOSSA IA debita crédito. Onde não há gasto nosso, não há débito.**

Os pontos JÁ instrumentados em `lib/quota.ts` (`usage_events`) viram débitos de crédito:

| Evento (já existe) | Ativa | Debita |
|---|---|---|
| `audio_minutes` (gravação→transcrição) | Whisper | ✅ |
| `photo_batch` (análise de foto) | Vision | ✅ |
| `estimate` (geração) | OpenRouter | ✅ |
| `price_research` | OpenRouter web | ✅ |
| `knowledge` (RAG KB — SEED-033) | embeddings | ✅ (novo) |
| conversa leve (glue chat/WhatsApp) | — | ❌ absorvido |

Consequências por canal (caem sozinhas porque metrificamos no ponto de gasto real):
- **WhatsApp + chat web:** operações pesadas (geração/transcrição/foto/research/knowledge) debitam. ✅
- **MCP via ChatGPT/Claude:** a CONVERSA roda no assistente do usuário (gasto deles, não nosso) → **zero crédito**. Só quando o MCP dispara uma operação NOSSA (geração) → debita. ✅
- **Conversa do chat web:** roda no NOSSO OpenRouter (diferente do MCP), mas é **absorvida** (não debita) — mantida barata via slot barato (Haiku/Flash, SEED-031) + rate-limit anti-abuso. O markup nas operações pesadas cobre essa fração leve.

### 4. Overage: top-up
- Créditos do mês acabaram → o cliente **compra pacotes avulsos de crédito** (checkout one-time Stripe) → credita o ledger. Não bloqueia o dono no meio de um job.
- Combinar com prompt de upgrade de plano quando o padrão de uso justificar (top-up recorrente = candidato a tier maior).

### 5. Markup 4-5x (margem ~75-80%)
- Débito = custo real × 4.5 (configurável no painel super-admin — ver princípio 6).
- **Princípio de dimensionamento do grant (protege margem mesmo no uso de 100%):** dimensione o grant para que o **custo real OpenRouter do grant INTEIRO** seja uma fração pequena e fixa da assinatura (≤30%). Assim o power-user no limite ainda dá lucro; o cliente leve (maioria) é margem quase pura.

### 6. TUDO configurável no painel super-admin (NÃO-NEGOCIÁVEL)
**Nenhum parâmetro de billing pode estar hard-coded no código nem em env var.** Cada peça é configurável no super-admin, em runtime, sem deploy — espelhando o padrão dos model slots (SEED-031) e do `ai_config` que já existe. Mudar um número de cobrança é uma config no painel, jamais um commit.

Lista (não-exaustiva) do que DEVE ser super-admin-configurável:
- **Markup multiplier** (global e/ou por tipo de operação)
- **Denominação do crédito** (1 crédito = $X de valor cobrado)
- **Grant mensal de crédito por tier**
- **Preço da assinatura por tier**
- **Pacotes de top-up** (tamanho + preço de cada pacote)
- **Tarifa de Whisper/STT** usada pra computar o custo de transcrição (e qualquer custo computado, não vindo do OpenRouter)
- **Quais operações metrificam vs são absorvidas** (ex: ligar/desligar débito da conversa do chat)
- **Rate-limit anti-abuso** da conversa absorvida
- **Limiares de saldo baixo** (quando avisar o cliente)
- **Markup/grant por tipo de operação** se quisermos granularidade (ex: research com markup diferente de geração)

Implementação: estender o `ai_config`/`platform_integrations` (mesmo mecanismo encriptado runtime-configurável de `getIntegrationKey`) com uma seção `billing_config`. O `recordAICost`/`checkCredits` LÊ esses valores em runtime — nunca constantes no código. Painel: nova aba "Billing" no super-admin.

## Exemplo trabalhado (ilustrativo — calibrar com custo real medido)

```
Assinatura Pro: $49/mês
Markup: 4.5x
Grant "aparente" ao cliente: $90 de valor-IA/mês (= 9.000 créditos a $0.01)
Custo real OpenRouter no uso de 100% do grant = $90 / 4.5 = $20
Margem bruta de IA no uso máximo = ($49 − $20) / $49 = 59%
Cliente típico (~40% de uso) → custo real ~$8 → margem ~84%
```

Ajustar markup/grant até o custo-real-do-grant-inteiro ficar ≤30% de S (aqui $20/$49 = 41% — subir markup pra 6x OU reduzir grant baixaria pra ~27%). Os números finais saem da CALIBRAÇÃO com custo real medido (fase 1).

## Arquitetura (estende o que já existe)

1. **Capturar custo real por chamada de IA** — FUNDAÇÃO (não existe hoje)
   - `lib/ai/providers/openrouter.ts` hoje captura só tokens (pra Langfuse). Adicionar captura de **custo**: OpenRouter retorna custo via `usage: { include: true }` no request OU via `GET /api/v1/generation?id={id}` (`total_cost`).
   - Whisper/STT: custo = minutos × tarifa (computado).
   - Vision: custo via OpenRouter (mesmo mecanismo) se roteado por lá.
   - Um helper `recordAICost(operation, realCostUsd, ctx)` que converte → créditos e debita o ledger.

2. **Credit ledger** — nova tabela `credit_ledger`
   - (id, company_id, delta_credits, reason 'grant'|'debit'|'topup'|'adjust', operation_type, ref_id, real_cost_usd, markup, balance_after, created_at)
   - Append-only; saldo = soma dos deltas (ou cache `companies.credit_balance` para leitura rápida, reconciliável)
   - RLS tenant-scoped (company_id); débitos via service-role
   - Migração idempotente; deploy via CI→GHCR→Coolify (nunca build na VPS)

3. **`entitlements.ts` ganha o grant de créditos por tier**
   - Adicionar `monthlyCreditGrant: number` ao lado dos counts atuais (convivem na transição)
   - free/trial/pro/business com grants calibrados; manter os counts como guard-rails secundários (ex: cap diário anti-abuso)

4. **`checkQuota` → gate por saldo de crédito** (`checkCredits`)
   - Antes de uma operação de IA: estimar o custo, checar saldo. Saldo insuficiente → oferecer top-up (não hard-fail no meio do fluxo quando possível)
   - Reusar a idempotência do `recordUsage` (débito idempotente por ref)

5. **Stripe como trilho**
   - Webhook `invoice.paid` (assinatura) → credita o `monthlyCreditGrant` do tier no início do ciclo (idempotente via event id — já existe `stripe_processed_events`)
   - Checkout one-time para top-up → webhook → credita o pacote
   - Reusar a infra Stripe existente (phase55/58/70/94)

6. **Frontend: saldo + UX**
   - Widget de saldo de créditos (header/settings), histórico de consumo, guia por ação
   - Estados: saldo baixo (aviso), zerado (CTA top-up/upgrade)
   - Reusar `notifyQuotaThresholds` (já existe) para avisos de saldo baixo

7. **Migração do modelo count-based atual**
   - Hoje tiers são count-based (`maxEstimatesPerMonth` etc). Transição: rodar créditos EM PARALELO aos counts, validar a calibração com dados reais, depois cortar os counts para guard-rails secundários. Não quebrar contas existentes.

## Calibração (fase obrigatória antes de ligar cobrança real)

- Instrumentar captura de custo real em produção/staging por algumas semanas SEM cobrar → medir o custo real médio por operação (estimate, transcrição/min, foto, research, knowledge).
- Derivar grant/markup/preço dos números reais, não dos chutes deste seed.
- Validar o invariante: custo-real-do-grant-inteiro ≤ ~30% da assinatura.

## Breadcrumbs

- [`lib/quota.ts`](lib/quota.ts) — `checkQuota`/`recordUsage`/`usage_events` + `QuotaType` (estimate/photo_batch/audio_minutes/price_research) — os pontos de débito já instrumentados
- [`lib/entitlements.ts`](lib/entitlements.ts) — tiers free/trial/pro/business (count-based) — adicionar `monthlyCreditGrant`
- [`lib/ai/providers/openrouter.ts`](lib/ai/providers/openrouter.ts) — captura de tokens hoje; adicionar captura de CUSTO (fundação)
- `supabase/migrations/20260513000001_phase55_subscription_tiers.sql` — tiers atuais
- `supabase/migrations/20260514000001_phase58_stripe_processed_events.sql` — idempotência de webhook (reusar pro grant)
- `supabase/migrations/20260517000001_phase70_stripe_connect_columns.sql` + `phase94_invoices` — infra Stripe existente
- [`lib/platform-config.ts`](lib/platform-config.ts) — `getIntegrationKey`/`ai_config`: o mecanismo runtime-configurável a estender com `billing_config` (markup, grants, preços, top-ups, tarifas — TUDO, princípio 6)
- [`lib/admin/integrations-providers.ts`](lib/admin/integrations-providers.ts) — catálogo do painel super-admin; adicionar a aba "Billing"
- [`lib/observability/pipeline-events.ts`](lib/observability/pipeline-events.ts) — correlacionar custo real por geração

## Decisões ainda a travar antes de planejar

1. **Markup configurável no painel?** DECIDIDO — sim, e TUDO mais também (ver princípio 6, não-negociável). Resta só o valor inicial: 4.5x.
2. **Grant: por tier fixo OU $-de-valor-IA fixo?** (recomendado: grant em créditos por tier, derivado da calibração — e o valor editável no painel.)
3. **Estimar custo ANTES da operação (gate preciso) ou debitar DEPOIS (gate por saldo aproximado)?** Geração tem custo variável — provável: gate por saldo > limiar mínimo antes; débito exato depois.
4. **Conversa do chat web — absorver 100% ou debitar um mínimo simbólico?** (recomendado: absorver + rate-limit; revisar se abuso aparecer.)
5. **Trial:** créditos de trial generosos com cap, sem cartão? Casa com o tier `trial` atual.
6. **Rollover de créditos não usados?** (recomendado: NÃO — créditos expiram no fim do ciclo; simplicidade + previsibilidade de custo.)

## Related Seeds & Decisions

- **[[SEED-031-complexity-router-adaptive-model-selection]]** — model slots barateiam o custo real → menos crédito debitado → margem sobe. Sinergia direta. O markup é sobre custo real, então o roteamento beneficia margem E cliente.
- **[[SEED-013-subscription-tiers-entitlements]]** — os tiers cujo entitlement ganha `monthlyCreditGrant`
- **[[SEED-033-industry-knowledge-base-conversational-assistant]]** — o evento `knowledge` entra como ponto de débito novo
- **[[SEED-034-internal-web-chat-assistant]]** — o chat consome créditos nas operações pesadas; conversa absorvida
- **[[SEED-030-mcp-server-xtimator]]** — MCP: conversa externa = zero crédito; só geração debita
- **[[SEED-036-estimate-payment-platform-fee]]** — a SEGUNDA fonte de receita (1% transacional). Modelo completo = assinatura/créditos (este seed) + 1% (SEED-036). Compartilham o `billing_config` no super-admin (princípio 6)
- **[[SEED-020-stripe-connect-customer-payments]]** — fluxo de pagamento #2 (cliente final → dono), NÃO confundir com a assinatura
- **[[SEED-032-advanced-pricing-model-tax-discount-deposit]]** — independente (precificação do ESTIMATE, não da assinatura)

## Notas

**O insight central:** porque o crédito é definido como custo-real × markup, a regra "debita onde gastamos IA" emerge de graça e é consistente entre canais — não precisa de special-casing. MCP-conversa não debita porque não gastamos; geração debita porque gastamos. O metering no ponto de gasto real É a regra de negócio.

**Margem é protegida em três camadas:** (1) markup ≥4.5x por operação; (2) grant dimensionado pra custo-real-do-grant ≤30% da assinatura (power-user no limite ainda lucra); (3) model slots (SEED-031) reduzindo o custo real por baixo. Cliente leve = margem quase pura.

**Não cobrar antes de calibrar.** Os números deste seed são ilustrativos. A fase 1 mede custo real em produção sem cobrar; grant/markup/preço saem dos dados, não dos chutes.
