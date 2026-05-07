# Requirements: v1.3 Smart Pricing

**Milestone goal:** Empresas cadastram sua tabela de preços real (price book) e a IA usa esses preços como âncoras na geração de orçamentos — com fallback automático para senso comum quando vazio ou sem match. O editor exibe a origem de cada preço para o usuário saber quando confiar e quando revisar.

**Key constraints:**
- Price book é opcional: empresas sem preenchimento continuam funcionando como hoje
- Ajuste manual de preço no editor é exceção per-cliente, NÃO retroalimenta o price book
- RLS por company_id — cada empresa vê e edita apenas seus próprios preços
- Import CSV cobre empresas com tabelas preexistentes
- Categorias são livres (o usuário define, sem categorias predefinidas pelo sistema)

---

## v1.3 Requirements

### Price Book — Gestão

- [x] **PB-01**: Usuário pode ver todos os itens do price book da empresa agrupados por categoria em `/settings/price-book`
- [x] **PB-02**: Usuário pode adicionar um novo item (categoria livre, nome do item, unidade, preço unitário, notas opcionais)
- [x] **PB-03**: Usuário pode editar um item existente
- [x] **PB-04**: Usuário pode excluir um item (com confirmação)
- [ ] **PB-05**: Usuário pode importar itens em lote via upload de arquivo CSV (colunas: categoria, item, unidade, preço; preview antes de confirmar import)
- [x] **PB-06**: Página exibe empty state claro comunicando que o price book é opcional — a IA usa estimativas de mercado se vazio
- [x] **PB-07**: Usuário pode buscar itens do price book por nome ou categoria

### AI Integration — Ancoragem de Preços

- [ ] **AIPRICE-01**: Na geração do orçamento, a IA recebe o price book da empresa como contexto e usa os preços cadastrados como âncoras para itens que coincidem com os detectados no áudio/fotos
- [ ] **AIPRICE-02**: Quando não há match ou o price book está vazio, a IA usa estimativas de mercado (comportamento atual — sem regressão)
- [ ] **AIPRICE-03**: Cada linha do orçamento gerado é tagged com a origem do preço: `"price_book"` (preço vindo do cadastro) ou `"ai_estimate"` (estimado pela IA)

### Estimate Editor — Indicador de Origem

- [ ] **EDITPRICE-01**: Cada item no editor de orçamento exibe um indicador visual da origem do preço (ex: badge "✓ Price book" vs "⚡ IA estimou")
- [ ] **EDITPRICE-02**: Usuário pode editar qualquer preço independente da origem; o indicador é removido ou atualizado após override manual

---

## Future Requirements (Deferred)

- Reajuste percentual em lote por categoria (ex: +10% em "Labor") — v1.4
- Versionamento temporal de preços (preço de 2024 vs 2026) — v2
- Import via Excel (.xlsx) ou Google Sheets — CSV cobre v1.3
- "Salvar no price book?" após ajuste manual — descartado intencionalmente (preço ajustado é exceção per-cliente)

## Out of Scope

- Preços per-cliente no price book — o price book é o padrão da empresa; exceções ficam no orçamento via ajuste manual
- Price book compartilhado entre empresas — RLS garante isolamento por company_id
- Categorias predefinidas pelo sistema por indústria — usuário define categorias livremente
- Bulk delete / bulk edit de itens — CRUD individual cobre v1.3

---

## Traceability

| REQ-ID | Feature Area | Phase | Status |
|--------|-------------|-------|--------|
| PB-01 | Price Book Management | Phase 20 | Pending |
| PB-02 | Price Book Management | Phase 20 | Pending |
| PB-03 | Price Book Management | Phase 20 | Pending |
| PB-04 | Price Book Management | Phase 20 | Pending |
| PB-05 | Price Book Management | Phase 21 | Pending |
| PB-06 | Price Book Management | Phase 20 | Pending |
| PB-07 | Price Book Management | Phase 20 | Pending |
| AIPRICE-01 | AI Integration | Phase 22 | Pending |
| AIPRICE-02 | AI Integration | Phase 22 | Pending |
| AIPRICE-03 | AI Integration | Phase 22 | Pending |
| EDITPRICE-01 | Estimate Editor | Phase 23 | Pending |
| EDITPRICE-02 | Estimate Editor | Phase 23 | Pending |
