---
id: SEED-036
status: activating
planted: 2026-06-24
planted_during: v4.6 Pricing Intelligence (billing/monetization design session)
trigger_when: User activated 2026-06-24. Segunda fonte de receita ao lado da assinatura (SEED-035). Constrói sobre a infra Connect já entregue (Phase 70 + 94).
scope: Medium
supersedes: "SEED-020 'Application fee: 0%' — a Xtimator passa a cobrar 1% application fee sobre pagamentos de estimate"
---

# SEED-036: Estimate Payment Platform Fee (1%) + Gating + Disclosure

A Xtimator passa a receber **1% de tudo que o cliente final paga pela ferramenta**, via `application_fee_amount` no Direct Charge da conta Connect do dono. Mais dois requisitos travados: **gating total** da UI de pagamento (nada de pagamento aparece se o Stripe não estiver conectado) e **disclosure clara da taxa** no momento da conexão.

## Reverte uma decisão do SEED-020

O SEED-020 entregou o fluxo de pagamento Connect com **fee 0%** deliberado ("Xtimator never touches the money, takes zero application fee... monetizes via SaaS plans only"). Este seed **SUPERA** essa decisão: o modelo de receita agora é **assinatura/créditos (SEED-035) + 1% transacional (este seed)**. Duas fontes, não uma. A infra de gating "100% optional" do SEED-020 é MANTIDA e reforçada (ver requisito 2).

## Os três requisitos travados (2026-06-24)

### 1. 1% application fee sobre todo pagamento de estimate
- A cobrança continua **Direct Charge na conta Connect do dono** (o dono segue sendo merchant of record — venda dele, cliente dele, risco de chargeback dele). A Xtimator NÃO custodia dinheiro (sem pesadelo de money-transmitter nos EUA).
- O Stripe roteia automaticamente **1% pra conta-plataforma da Xtimator** via `application_fee_amount`. O gancho JÁ existe no código — [`invoice-service.ts:17`](lib/billing/invoice-service.ts) comenta que o fee foi "OMITTED everywhere... omitting it yields 100% to the connected account". É literalmente **preencher esse campo** em vez de omiti-lo.
- Aplica-se a TODA superfície de pagamento: a invoice da Phase 94 (`application_fee_amount` na invoice) E o checkout da Phase 70 (`payment_intent_data.application_fee_amount`).
- A taxa incide sobre o **valor efetivamente cobrado** — se for deposit (SEED-032), 1% do deposit; se for o total, 1% do total.
- **Percentual configurável no super-admin** (princípio 6 do SEED-035 — `billing_config`). 1% é o valor inicial, não uma constante no código. Permite ajustar ou diferenciar por tier sem deploy.

### 2. Gating TOTAL da UI de pagamento (não-negociável)
**Toda página, tela, botão e elemento relacionado a pagamento só aparece se o Stripe estiver conectado (`stripe_connect_status = 'active'`). Sem conexão → nada de pagamento aparece pro cliente final NEM pro dono no contexto do estimate.**
- Estende o princípio "100% Optional" do SEED-020 (Pay Now só aparece com conta ativa) para uma regra ABRANGENTE e auditável: zero elemento de pagamento órfão em nenhum estado desconectado.
- Cobre: botão "Pay Now" na share page, status de pagamento no editor/lista, link de invoice, "guia de pagamento", qualquer badge/CTA de cobrança, e a menção da taxa.
- Degrade gracioso: empresa sem Connect usa o produto inteiro normalmente (share, PDF, email, accept/decline) — só não vê nada de pagamento.
- **Teste obrigatório:** toda superfície renderiza correta nos DOIS estados (conectado / desconectado) — herda o requisito de teste do SEED-020.

### 3. Disclosure clara da taxa na conexão
**Ao conectar o Stripe, mostrar um aviso explícito explicando que a Xtimator cobra 1% sobre cada pagamento processado — separado e bem claro pro dono.**
- Aparece no fluxo de conexão Connect (antes/durante o OAuth em `/settings/payments`), não escondido em ToS.
- Transparência é também boa prática Stripe: em Direct Charges com application fee, o dono VÊ a taxa no dashboard dele — melhor ele saber de antemão, no nosso fluxo, do que descobrir na fatura.
- Texto claro: "A Xtimator cobra uma taxa de 1% sobre cada pagamento que você receber pela plataforma. Essa taxa é separada das taxas do Stripe." (idioma do dono).
- Idealmente reconfirmar a taxa vigente lida do `billing_config` (não hard-coded no texto) pra nunca divergir do valor real cobrado.

## Arquitetura (infra já 99% pronta)

O fluxo Connect já está ENTREGUE (Phase 70 checkout + Phase 94 invoices). Este seed é cirúrgico:

1. **Adicionar `application_fee_amount`** em [`invoice-service.ts`](lib/billing/invoice-service.ts) (na invoice) e na rota de checkout da Phase 70 (`payment_intent_data`). Valor = `round(amountCents × feePct)` lido do `billing_config`.
2. **`billing_config.estimate_fee_pct`** no super-admin (estende o mecanismo do SEED-035 — princípio 6).
3. **Auditoria de gating:** varrer TODA UI de pagamento e garantir o guard `stripe_connect_status === 'active'`. Componente/hook único `usePaymentsEnabled(company)` pra centralizar o gate e evitar elemento órfão.
4. **Disclosure UI** no fluxo de `/settings/payments` + [`connect-oauth.ts`](lib/billing/connect-oauth.ts) (a tela antes do redirect OAuth).
5. **Webhook:** o `invoice.paid`/`payment_intent` já reconcilia; opcionalmente registrar o `application_fee` recebido pra relatório de receita transacional da plataforma.
6. **Reconciliação/relatório (opcional):** uma view de receita de fees pra Xtimator (quanto de 1% entrou no período) — casa com observabilidade.

## Breadcrumbs

- [`lib/billing/invoice-service.ts:17,55`](lib/billing/invoice-service.ts) — o gancho do `application_fee_amount` deliberadamente omitido; preencher
- `app/api/billing/create-checkout-session/route.ts` (Phase 70 path) — adicionar `payment_intent_data.application_fee_amount` na superfície de checkout do estimate (NÃO a da assinatura — atenção: este arquivo é assinatura; achar a rota de pay do estimate da Phase 70)
- [`lib/billing/connect-oauth.ts`](lib/billing/connect-oauth.ts) — fluxo de conexão; a disclosure entra antes do redirect
- `app/(app)/settings/payments/` — tela de conexão + onde a disclosure aparece
- `supabase/migrations/20260517000001_phase70_stripe_connect_columns.sql` — `stripe_connect_status` (o flag do gate) + `payment_status`/`payment_amount_cents`
- `supabase/migrations/20260619000001_phase94_invoices.sql` — a tabela de invoices (Phase 94)
- [`lib/platform-config.ts`](lib/platform-config.ts) — `billing_config.estimate_fee_pct` (super-admin, princípio 6 do SEED-035)
- `app/api/webhooks/stripe/route.ts` — reconciliação; opcional registrar fee recebido
- SEED-020 / SEED-021 — o fluxo Connect base (entregue / live-mode)

## Decisões a travar antes de planejar

1. **Fee fixo 1% global, ou diferenciável por tier?** (ex: tier Free 2%, Business 0.5%). Recomendado: começar 1% global configurável; granularidade por tier depois se virar lever de pricing.
2. **Fee sobre deposit E sobre o saldo, ou só sobre o total fechado?** (Se SEED-032/deposit existir, definir a base.) Recomendado: 1% sobre cada valor efetivamente capturado.
3. **Mínimo de fee?** (Stripe rejeita fee de $0; pagamentos minúsculos podem gerar fee de centavos.) Definir piso ou arredondamento.
4. **Disclosure: só na conexão, ou também recorrente** (ex: tooltip perene no /settings/payments)? Recomendado: forte na conexão + nota perene discreta.
5. **Reembolso:** quando o dono reembolsa o cliente, o application fee é devolvido? (Stripe: `refund_application_fee` opcional.) Definir política.

## Related Seeds & Decisions

- **[[SEED-020-stripe-connect-customer-payments]]** — o fluxo base; este seed REVERTE o "fee 0%" dele e MANTÉM o gating "100% optional"
- **[[SEED-021-stripe-connect-live-mode-activation]]** — go-live do Connect; a cobrança de fee real depende do live mode ativo
- **[[SEED-035-credit-based-subscription-billing]]** — a OUTRA fonte de receita (assinatura/créditos); o `billing_config`/super-admin é compartilhado (princípio 6). Modelo final = assinatura + 1% transacional
- **[[SEED-032-advanced-pricing-model-tax-discount-deposit]]** — deposit define a base sobre a qual o 1% incide
- **[[SEED-017-stripe-live-webhook]]** — go-live do webhook, pré-requisito de receita real

## Notas

**Por que Opção A (fee) e não Opção B (dinheiro pela plataforma):** o dono continua merchant of record. A Xtimator tira uma comissão limpa via `application_fee_amount` sem custodiar fundos de terceiros — o que evita liability de chargeback e enquadramento como money transmitter nos EUA. Toda a infra (Standard Connect + Direct Charges) já suporta isso nativamente; é preencher um campo que o código deixou explicitamente preparado.

**O modelo de receita completo da plataforma:** (1) assinatura mensal + créditos de IA com margem (SEED-035); (2) 1% sobre cada pagamento de estimate fechado pela ferramenta (este seed). A primeira monetiza o USO da IA; a segunda monetiza o VALOR transacionado — alinhando a receita da Xtimator ao sucesso do cliente (quanto mais o dono fecha, mais a Xtimator ganha).

**Transparência é feature, não burocracia:** a disclosure clara do 1% na conexão constrói confiança e evita o pior cenário (dono descobrir a taxa sozinho no dashboard do Stripe e sentir que foi enganado). Lida do `billing_config` pra nunca divergir do valor real.
