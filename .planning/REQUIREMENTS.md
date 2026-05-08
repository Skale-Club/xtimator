# Requirements: v1.4 — Estimate Plain Text & Pricing Tools

## v1.4 Requirements

### Plain-text Estimate Output

- [ ] **PLAINTEXT-01**: Usuário vê o orçamento em formato texto simples na aba "Plain Text" do editor de orçamento (ao lado de PDF e Web Link)
- [ ] **PLAINTEXT-02**: Usuário copia o texto do orçamento com 1 clique (copy-to-clipboard); um toast de confirmação aparece após a cópia
- [ ] **PLAINTEXT-03**: O texto gerado usa o template configurado pela empresa — saudação (`Hey {client_name}`), frase de abertura, listagem de categorias + itens + preços, total, frase de fechamento e assinatura (`{owner_name}`, `{company_name}`)
- [ ] **PLAINTEXT-04**: Usuário pode editar o texto gerado diretamente no preview antes de copiar (override pontual — não altera o template salvo)
- [ ] **PLAINTEXT-05**: Usuário configura o template da empresa em `/settings/estimate-templates` com variáveis suportadas: `{client_name}`, `{company_name}`, `{owner_name}`, `{total}`, `{items_breakdown}`

### Bulk Price Adjustment

- [ ] **BULKPRICE-01**: Usuário seleciona uma categoria do price book e aplica um ajuste percentual (+/-%) em todos os itens dessa categoria de uma vez
- [ ] **BULKPRICE-02**: Antes de confirmar, usuário vê preview dos preços atuais vs novos preços para todos os itens afetados
- [ ] **BULKPRICE-03**: Ajuste confirmado é aplicado atomicamente a todos os itens da categoria (todos ou nenhum)

---

## Future Requirements (Deferred)

- **Markdown variant** — output em `**bold**` para canais que renderizam markdown (Slack, Discord) — v1.5
- **JSON export** — para empresas que querem integrar com CRM próprio — v2
- **Envio direto via SMS (Twilio) ou WhatsApp Business API** — fora do escopo; usuário copia e cola onde quiser
- **Bulk price adjustment across all categories** — aplicar o mesmo % a todo o price book de uma vez — v1.5
- **Versionamento temporal de preços** (preço de 2024 vs 2026) — v2
- **Per-company AI provider selection** — hoje é platform-level; futuro per-company — v2

## Out of Scope

- Disclaimer de IA no texto do orçamento — decisão intencional; o texto é comunicação profissional do dono da empresa
- Integrações de mensageria nativas (Twilio SMS, WhatsApp Business API) — copy-paste cobre o caso de uso do v1.4
- Template por idioma (EN/PT-BR/ES por estimate) — i18n do template fica para v1.5 com PLAINTEXT-06+
- Ajuste de preço retroativo em orçamentos já enviados — price book só afeta geração futura

## Traceability

| REQ-ID | Feature Area | Phase | Status |
|--------|-------------|-------|--------|
| PLAINTEXT-01 | Plain-text Estimate | TBD | Pending |
| PLAINTEXT-02 | Plain-text Estimate | TBD | Pending |
| PLAINTEXT-03 | Plain-text Estimate | TBD | Pending |
| PLAINTEXT-04 | Plain-text Estimate | TBD | Pending |
| PLAINTEXT-05 | Plain-text Estimate | TBD | Pending |
| BULKPRICE-01 | Bulk Price Adjustment | TBD | Pending |
| BULKPRICE-02 | Bulk Price Adjustment | TBD | Pending |
| BULKPRICE-03 | Bulk Price Adjustment | TBD | Pending |
