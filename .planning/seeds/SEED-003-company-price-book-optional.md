---
id: SEED-003
status: dormant
planted: 2026-05-06
planted_during: v1.2 Brand Identity & Global Reach (Phase 18 voice-first recorder complete)
trigger_when: Próximo milestone focado em precisão/qualidade dos orçamentos gerados pela IA
scope: Large
---

# SEED-003: Price book opcional por empresa para alimentar a IA na geração de orçamentos

## Why This Matters

Hoje a IA do Xtimator gera orçamentos baseados em senso comum / médias de mercado. Isso funciona como ponto de partida, mas:

- Cada empresa tem sua **estrutura de preços própria** (markup, custos locais, posicionamento de mercado). Um landscaper em Miami cobra diferente de um em Boise.
- Sem ancoragem nos preços reais da empresa, o usuário precisa **reajustar manualmente** muitos itens depois de gerado — atrito que vai contra a promessa de "audio → orçamento profissional em <5 min".
- Empresas mais maduras já têm tabelas de preço prontas (planilhas, sistemas legados). Permitir que elas tragam isso para dentro do Xtimator transforma a IA de "chutador educado" em "assistente que conhece meu negócio".

**Permanece OPCIONAL** — não pode virar barreira de onboarding. Empresas novas/pequenas continuam usando o fallback de senso comum e ajustam manualmente conforme aprendem seus próprios preços.

## When to Surface

**Trigger:** Próximo milestone focado em precisão/qualidade dos orçamentos gerados pela IA.

Surface durante `/gsd:new-milestone` quando o escopo do próximo milestone tocar em qualquer destes:

- Melhorias na qualidade/precisão da geração de orçamentos (Phase 6 follow-up)
- Personalização per-empresa do comportamento da IA
- Configurações avançadas da empresa (cadastros customizados, catálogos, templates)
- Feedback recorrente de usuários sobre preços imprecisos / muito ajuste manual pós-geração
- Diferenciação competitiva ("a IA aprende meu negócio")

## Scope Estimate

**Large** — milestone próprio. Quebras esperadas:

1. **Schema + RLS** — tabela `company_price_book` (company_id, category, item_name, unit, unit_price, notes, created_at, updated_at) com RLS por company_id. Possivelmente uma `price_book_categories` separada para taxonomia consistente.
2. **CRUD UI** — página `/settings/price-book` (ou `/company/price-book`) com:
   - Listagem por categoria, busca, edição inline
   - Import via CSV/planilha (empresas trazem dados existentes)
   - Estado vazio que comunica claramente "isso é opcional, IA usa senso comum se vazio"
3. **Integração com pipeline de IA** — em `app/api/generate-estimate/route.ts`:
   - Antes de chamar Claude, carregar price book da empresa (se existir)
   - Injetar no system prompt como "use estes preços quando o item casar; caso contrário, estime com senso comum"
   - Capturar no output da IA a **origem** de cada linha (`source: "price_book" | "ai_estimate"`)
4. **UI do editor de orçamento** — mostrar badge/indicador da origem do preço (ex: ✓ price book vs. ⚡ IA estimou) e permitir ajuste manual fácil. Usuário entende quando confiar mais e quando revisar.
5. **Aprendizado opcional (stretch)** — quando usuário ajusta um preço estimado pela IA, oferecer "salvar no price book?" para que da próxima vez vire um match direto. Loop de feedback que melhora precisão com uso.

Estimativa grosseira: 3-5 fases (schema/RLS, CRUD UI, IA integration, editor UI, learning loop opcional).

## Breadcrumbs

Pontos de integração no código atual:

- [app/api/generate-estimate/route.ts](app/api/generate-estimate/route.ts) — endpoint atual de geração de orçamento via Claude. Aqui entra o load do price book antes do prompt e o tagging de origem na resposta.
- [lib/actions/company.ts](lib/actions/company.ts) — actions de empresa, padrão a seguir para price book actions.
- [lib/actions/settings.ts](lib/actions/settings.ts) — actions de settings, referência para CRUD do price book.
- [lib/schemas/onboarding.ts](lib/schemas/onboarding.ts) — schemas zod existentes; price book terá seus próprios schemas.
- [lib/queries/project.ts](lib/queries/project.ts) — padrão de queries Supabase com RLS.
- Phase 6 (AI Estimate Generation) e Phase 2 (Company Onboarding) — fases já completas que estabelecem o contexto onde isso se encaixa.

## Notes

- Decisão de design importante: price book é **soft hint**, não constraint duro. Mesmo com price book preenchido, a IA pode legitimamente sugerir item fora da tabela (caso novo) — e isso deve ser tagged como `ai_estimate` para o usuário decidir se adiciona ao price book.
- Considerar **versionamento/efetividade temporal** dos preços (preço de 2024 vs. 2026) — pode entrar como stretch ou ficar para v3.
- Considerar **bulk operations** (reajuste percentual em todos os itens de uma categoria) — empresas vão querer aplicar inflação anual.
- Plantado durante v1.2 para não desviar foco do milestone atual (brand identity + i18n + voice-first recorder).
