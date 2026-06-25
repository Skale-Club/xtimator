---
id: SEED-032
status: activating
planted: 2026-06-24
planted_during: v4.6 Pricing Intelligence (n8n MVP gap analysis — calculator deep-dive)
trigger_when: User confirmed activation 2026-06-24 — "isso com certeza nós vamos fazer". Surface as next milestone candidate after v4.6 close-out.
scope: Medium-Large
---

# SEED-032: Advanced Pricing Model — Per-Item Tax, Discounts, Deposit & Markup

A integridade aritmética do Xtimator já é excelente (recálculo determinístico server-side, never-trust-LLM, GUARD-03). O que falta NÃO é uma calculadora melhor — é um **modelo de orçamento mais rico** para a calculadora computar. Hoje cada linha é estritamente `qty × unit_price` e o imposto é uma taxa única flat da empresa. Este seed adiciona os elementos de precificação que todo small service business nos EUA usa: tributação por item, descontos, entrada (deposit) e markup.

## Por que isso importa

**Problema:** O motor de cálculo atual ([`lib/services/generate-estimate.ts:314-332`](lib/services/generate-estimate.ts)) modela cada orçamento como:
```
item.total  = round2(qty × unit_price)
subtotal    = Σ section.subtotal
taxAmount   = round2(subtotal × taxRate)   ← taxa ÚNICA flat da empresa
grandTotal  = round2(subtotal + taxAmount)
```

Isso é matematicamente perfeito mas comercialmente primitivo. Faltam quatro coisas que aparecem em quase todo orçamento real de serviço:

1. **Tributação por item (labor vs materials).** Nos EUA a tributação de serviços varia drasticamente por estado — muitos isentam labor e taxam só materials; outros isentam serviços de limpeza/reparo completamente. Uma `default_tax_rate` única aplicada ao subtotal inteiro produz números fiscalmente errados. **Esse é o gap mais grave** — afeta a corretude legal do documento.

2. **Desconto.** Nenhum mecanismo para "$X off", "10% cash discount", "first-time customer discount". É o item #1 de negociação no campo.

3. **Deposit / entrada.** "$500 deposit to start, balance on completion" / "50% upfront" é padrão na indústria. Hoje não há como expressar saldo a pagar vs entrada.

4. **Markup / margem.** Markup percentual sobre custo (especialmente em materials) — o dono compra material a $X e cobra $X × 1.3. Hoje precisa fazer a conta de cabeça e digitar o preço final.

**Oportunidade:**
- **Receita direta:** orçamentos mais precisos = menos retrabalho do dono = mais confiança na ferramenta = maior retenção. Tributação correta evita problemas fiscais para o cliente.
- **Paridade competitiva:** Jobber, Joist e Housecall Pro têm deposit + discount + per-item tax nativos. É table-stakes que o Xtimator ainda não tem.
- **Casa com SEED-020 (Stripe Connect):** deposit dá ao payment link um valor parcial natural ("pague o deposit de $500 agora").

## Escopo

**Medium-Large** — toca schema, motor de cálculo, AI output schema, editor UI e PDF. Quebra esperada em ~4-5 phases:

1. **Per-item taxability**
   - Schema: `estimate_items.taxable` (boolean, default true) + opcional `tax_category` ('labor' | 'materials' | 'other')
   - Empresa: `companies.tax_config` — taxa por categoria OU regra simples "labor isento"
   - Motor: `taxAmount = Σ(item.total × itemTaxRate)` em vez de `subtotal × flatRate`
   - AI output schema ([`lib/ai/schema.ts`](lib/ai/schema.ts)): IA classifica cada item como labor/materials (a IA já sabe distinguir; só precisa expor o campo)
   - **Manter retrocompat:** quando `tax_config` ausente → comportamento atual (flat) byte-a-byte

2. **Line-level & global discount**
   - Schema: `estimate_items.discount` (amount ou percent) + `estimates.discount` (global)
   - Motor: aplicar desconto de linha antes do subtotal; desconto global após subtotal, antes do tax (ou após — decisão fiscal a confirmar, varia por jurisdição)
   - Decisão a travar: **desconto incide antes ou depois do imposto?** (US: geralmente antes — desconto reduz a base tributável)

3. **Deposit / payment terms**
   - Schema: `estimates.deposit_type` ('none' | 'percent' | 'amount') + `deposit_value` + campo derivado `balance_due`
   - Motor: `depositAmount = grandTotal × pct` ou valor fixo; `balanceDue = grandTotal − depositAmount`
   - Casa com **[[SEED-020-stripe-connect-customer-payments]]** — payment link cobra o deposit

4. **Markup (cost → price)**
   - Schema: `estimate_items.cost` (opcional) + `markup_pct`; `unit_price` derivado de `cost × (1 + markup)`
   - Quando o dono informa custo + markup, o preço é calculado pelo servidor (mais um caso de never-trust-LLM aplicado a markup)
   - Price book ([`lib/actions/price-book.ts`](lib/actions/price-book.ts)) pode armazenar custo + markup por item

5. **Editor UI + PDF**
   - Editor: campos de desconto/deposit/taxable por linha e globais
   - PDF + plain-text output: nova estrutura de totais (subtotal → desconto → imposto → total → deposit → balance due)
   - Espelhar nos três canais (web, WhatsApp, MCP) já que o motor é o core compartilhado

## Princípio de design (não-negociável)

**Toda a aritmética nova continua server-side e determinística.** A IA NUNCA computa imposto, desconto, deposit ou markup — ela só fornece os inputs (qty, unit_price ou cost, classificação labor/materials). O servidor é a única autoridade, exatamente como GUARD-03 garante hoje para o total. Estender o padrão existente, não criar um paralelo.

Sequência de cálculo proposta (a travar em discussão):
```
line_net    = round2(qty × unit_price) − line_discount
subtotal    = Σ line_net
disc_global = global_discount (amount ou subtotal × pct)
taxable_base= Σ(line_net onde taxable) − (disc_global rateado)
taxAmount   = Σ(taxable_base_por_categoria × rate_categoria)
grandTotal  = (subtotal − disc_global) + taxAmount
deposit     = grandTotal × deposit_pct  |  deposit_amount
balanceDue  = grandTotal − deposit
```

## Breadcrumbs

- [`lib/services/generate-estimate.ts:255-373`](lib/services/generate-estimate.ts) — o bloco de "Server-side math validation" a estender (GUARD-03 fica intacto)
- [`lib/ai/schema.ts`](lib/ai/schema.ts) — `estimateOutputSchema`: adicionar `taxable`/`tax_category` por item (e opcional `cost`/`markup_pct`)
- [`lib/ai/types.ts`](lib/ai/types.ts) — `LineItemOutput`: type-widen para os novos campos
- [`lib/ai/price-anchoring.ts`](lib/ai/price-anchoring.ts) — anchoring/clamp não muda; markup é camada nova depois do anchoring
- [`lib/actions/price-book.ts`](lib/actions/price-book.ts) — price book ganha custo + markup opcionais por item
- [`lib/actions/estimate.ts`](lib/actions/estimate.ts) — server actions de edição precisam aceitar os novos campos
- Editor: [`components/workspace/estimate/item-row.tsx`](components/workspace/estimate/item-row.tsx) + `item-card-mobile.tsx` — campos de desconto/taxable por linha
- PDF + plain-text output (procurar o renderer de PDF e o gerador de plain text — SEED-004)
- Migração: seguir convenção idempotente + deploy via CI→GHCR→Coolify (nunca build na VPS)

## Decisões a travar antes de planejar

1. **Desconto antes ou depois do imposto?** (afeta a base tributável; US geralmente antes). Provavelmente configurável por empresa.
2. **Tributação: por categoria (labor/materials) ou por flag boolean simples (`taxable`)?** Começar simples (boolean) e evoluir, ou já modelar categorias?
3. **Markup: feature de price book ou de estimate ad-hoc?** Ou ambos?
4. **Deposit interage com Stripe Connect (SEED-020)?** O payment link deve cobrar o deposit ou o total?
5. **Migração de dados existentes:** todos os estimates atuais assumem `taxable=true`, `discount=0`, `deposit=none` — retrocompat garante zero mudança nos números já gerados.

## Related Seeds & Decisions

- **[[SEED-020-stripe-connect-customer-payments]]** — deposit é o valor natural do primeiro payment link; alinhar o contrato
- **[[SEED-003-company-price-book-optional]]** + **[[SEED-023-price-book-optional-category]]** — markup e custo vivem no price book
- **[[SEED-004-plain-text-estimate-output]]** — a nova estrutura de totais (desconto/deposit/balance) precisa aparecer no plain text
- **[[SEED-031-complexity-router-adaptive-model-selection]]** — independente; ambos saíram da análise do n8n MVP
- **Phases 105-109 (Price Research)** — research preenche `unit_price`; markup é uma camada de transformação DEPOIS, ortogonal

## Notas

**O insight central:** O calculator do n8n MVP é uma calculadora livre que o LLM pilota — flexível na expressão, frágil na execução. O Xtimator inverteu: execução determinística blindada, mas modelo de preço rígido. Este seed traz a riqueza de expressão do n8n PARA DENTRO do motor determinístico do Xtimator — o melhor dos dois. A IA ganha mais campos para preencher, mas NUNCA ganha a caneta da aritmética.

**Não confundir com "calculator tool":** explicitamente NÃO vamos dar uma tool de calculadora para a IA. Isso seria um retrocesso (reintroduz os 3 pontos de falha do LLM). O ganho é no modelo de dados + motor server-side, mantendo a IA fora da conta.
