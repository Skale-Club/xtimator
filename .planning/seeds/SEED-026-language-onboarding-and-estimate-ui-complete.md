---
id: SEED-026
status: harvested
planted: 2026-05-19
planted_during: v3.1.1 MVP Launch Prep + Future-Proofing
trigger_when: Next milestone after v3.1.1 — or immediately when prioritized; user confirmed "já é pra fazer agora"
scope: Medium
---

# SEED-026: Language Step in Onboarding + Complete SEED-016 Deferred UI

## Why This Matters

O onboarding atual (10 passos) nunca pergunta o idioma do usuário. Isso cria dois problemas:

1. **Dashboard language não é configurado na entrada** — o usuário descobre o `LanguageToggle` no topbar por acaso, ou nunca. Mercado hispânico e brasileiro são target explícito do produto, e o primeiro momento de configurar idioma deve ser o onboarding.

2. **SEED-016 foi colhido com backend completo mas UI incompleta** — o cascade resolver (`lib/i18n/resolve-estimate-language.ts`) existe, o schema DB foi migrado, mas os seguintes itens ficaram adiados:
   - Dropdown "Generate in:" no modal de geração de orçamento
   - EstimatePDF com labels i18n + bandeira no preview/share
   - Parâmetro `language` no body do `/api/generate-estimate`
   - Campo `default_estimate_language` no Company Settings
   - Campo `preferred_language` no Client edit form

Este seed fecha ambas as lacunas como uma única fase coesa.

## Três mercados, três idiomas

O produto foca em 3 idiomas (EN/PT/ES) que cobrem:
- Contratistas americanos (EN)
- Mercado hispânico nos EUA (ES) — maior mercado de serviços de construção nos EUA
- Mercado brasileiro (PT) — segundo maior mercado-alvo

Nenhum concorrente direto oferece orçamentos multilíngues com IA gerando o conteúdo no idioma correto automaticamente.

## Design da Tela de Idioma no Onboarding

### Passo: Idioma (inserir após Industry, antes de Brand Color)

```
┌────────────────────────────────────────────────────┐
│  In what language do you work day-to-day?          │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  🇺🇸 English (default)               [●]   │  │
│  │  🇧🇷 Português (BR)                  [ ]   │  │
│  │  🇪🇸 Español                         [ ]   │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  Your estimates will default to this language.     │
│  You can change it per estimate when needed.       │
│                                                    │
│  [Skip]                              [Continue →]  │
└────────────────────────────────────────────────────┘
```

**O que acontece ao selecionar:**
1. Sets `language` in `LanguageContext` (dashboard language imediato)
2. Saves to `localStorage` (persists para a sessão)
3. No `createOrUpdateCompany()`, salva em `companies.default_estimate_language` (cascade layer 3)

**Nota de UX:** a escolha aqui configura AMBOS — o idioma do painel E o idioma padrão dos orçamentos. O usuário pode sobrescrever por orçamento individualmente.

## Seletor de Idioma por Orçamento (SEED-016 deferred UI)

### Modal de geração / aba de orçamento

```
┌─────────────────────────────────────────────────────┐
│  Generate Estimate                                  │
│                                                     │
│  Language  [🇧🇷 Portuguese (BR)  ▼]                │
│            ├─ 🇺🇸 English                          │
│            ├─ 🇧🇷 Portuguese (BR)  ← cascade hint │
│            └─ 🇪🇸 Spanish                          │
│                                                     │
│  Defaulted to Portuguese from your app settings.   │
│  ────────────────────────────────────────────────  │
│  [Cancel]                          [Generate]       │
└─────────────────────────────────────────────────────┘
```

O hint "Defaulted to… from…" expõe qual camada do cascade resolveu o idioma (usando `resolveEstimateLanguageWithSource()`).

## Bandeira no Preview / Share

No `components/share/estimate-view.tsx` e no preview da aba de envio:

```
┌─────────────────────────────────┐
│  PROJECT: Maria's Apartment     │
│  Total: R$ 2.850,00      🇧🇷   │
└─────────────────────────────────┘
```

A bandeira aparece como chip no canto superior direito do card de preview e no PDF cover page.

## Componentes a Criar/Modificar

### Onboarding
- `components/onboarding/survey/steps/language-step.tsx` — novo passo
- `components/onboarding/survey/survey-config.ts` — adicionar passo `language` na posição 5
- `lib/schemas/onboarding.ts` — adicionar campo `language?: EstimateLanguage`
- `lib/actions/company.ts` (`createOrUpdateCompany`) — salvar `default_estimate_language`

### Estimate Generation UI
- `components/workspace/estimate/estimate-tab.tsx` ou modal equivalente — dropdown de idioma
- Exibir hint de cascade source (usar `resolveEstimateLanguageWithSource`)
- Conectar ao endpoint `/api/generate-estimate` com `language` no body

### API
- `app/api/generate-estimate/route.ts` — aceitar `language` no body (SEED-016 deferred)
- `lib/services/generate-estimate.ts` — passar `language` para prompt da IA

### PDF + Preview
- `components/pdf/estimate-pdf.tsx` — labels i18n, locale-aware currency/date, bandeira
- `components/share/estimate-view.tsx` — chip de bandeira
- `components/workspace/send/estimate-preview.tsx` — chip de bandeira

### Settings
- `components/settings/company-info-form.tsx` — campo `default_estimate_language`
- Tela de edit do cliente — campo `preferred_language`

## Cascade já implementado — apenas conectar

```
lib/i18n/resolve-estimate-language.ts  ← já existe, usar como está
resolveEstimateLanguage({
  override,          // do dropdown na UI
  clientPreferred,   // de clients.preferred_language
  companyDefault,    // de companies.default_estimate_language (setar no onboarding)
  userAppLanguage,   // de LanguageContext (setar no onboarding)
})
```

## Breadcrumbs

**Já implementado (conectar):**
- [`lib/i18n/resolve-estimate-language.ts`](lib/i18n/resolve-estimate-language.ts) — cascade resolver completo
- [`lib/i18n/language-context.tsx`](lib/i18n/language-context.tsx) — provider + localStorage
- [`components/app-shell/language-toggle.tsx`](components/app-shell/language-toggle.tsx) — dropdown de bandeira (reusar UI)
- [`components/app-shell/flags.tsx`](components/app-shell/flags.tsx) — componentes FlagUS/FlagBR/FlagES
- [`app/api/translate/route.ts`](app/api/translate/route.ts) — tradução via Claude Haiku + DB cache
- [`lib/i18n/use-translation.ts`](lib/i18n/use-translation.ts) — hook `t()`

**Onboarding:**
- [`components/onboarding/survey/survey-config.ts`](components/onboarding/survey/survey-config.ts) — definição dos passos
- [`components/onboarding/survey/steps/`](components/onboarding/survey/steps/) — passos existentes como referência
- [`lib/actions/company.ts`](lib/actions/company.ts) — `createOrUpdateCompany()`
- [`lib/schemas/onboarding.ts`](lib/schemas/onboarding.ts) — schema Zod

**Estimate:**
- [`lib/services/generate-estimate.ts`](lib/services/generate-estimate.ts) — service layer (aceitar language param)
- [`components/workspace/estimate/estimate-tab.tsx`](components/workspace/estimate/estimate-tab.tsx)
- [`components/pdf/estimate-pdf.tsx`](components/pdf/estimate-pdf.tsx)
- [`components/share/estimate-view.tsx`](components/share/estimate-view.tsx)

**Schema DB (já migrado pelo SEED-016):**
- `estimates.language` — coluna existe
- `clients.preferred_language` — coluna existe
- `companies.default_estimate_language` — coluna existe

## Scope Estimate

**Médio** — 1 fase, 3-4 dias:

1. Onboarding language step (UI + schema + action)
2. Generate-estimate API + service layer (conectar language param)
3. Estimate generation modal dropdown + cascade hint
4. PDF i18n + bandeira no preview/share/PDF
5. Settings: company default language + client preferred language
6. Testes

## Notas

- O cascade `userAppLanguage === 'en'` é tratado como "sem preferência" — nunca força inglês se o usuário escolheu PT/ES no onboarding
- Ao salvar a empresa no onboarding, setar `default_estimate_language` apenas se o usuário selecionou PT ou ES (null = inglês por padrão, seguindo English-first principle)
- A bandeira no preview serve como confirmação visual para o usuário de que o orçamento está no idioma correto antes de enviar
- Conexão com SEED-016: este seed completa os deferred items. Marcar SEED-016 como fully harvested após execução.
