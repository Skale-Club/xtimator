---
id: SEED-027
status: harvested
planted: 2026-05-19
planted_during: v3.1.1 MVP Launch Prep + Future-Proofing
trigger_when: Imediatamente após o onboarding de dados estar estável; usuário confirmou "já é pra fazer agora"
scope: Médio
---

# SEED-027: Tour de Funcionalidades Pós-Onboarding

## Why This Matters

Após preencher os dados no onboarding, o usuário é redirecionado para o dashboard — e fica sozinho. Não existe nenhuma orientação sobre como usar o app. Para um produto com um fluxo tão específico (gravar áudio → tirar fotos → IA gera orçamento → enviar PDF), a ausência de um tour é um bloqueio de ativação:

- Usuário não sabe que pode gravar áudio diretamente do celular
- Não sabe que a IA gera o orçamento completo automaticamente
- Não descobre o WhatsApp como canal de envio
- Taxa de ativação (primeiro orçamento gerado) provavelmente baixa sem guia

O tour deve ser **contextual e progressivo** — não um slideshow genérico, mas dicas que aparecem no momento certo, no elemento certo.

## Design do Tour

### Estratégia: Tour em camadas

**Camada 1 — Modal de boas-vindas (aparece 1x após completar onboarding)**

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│         🎉  Welcome to Xtimator, {firstName}!        │
│                                                      │
│   You're set up. Here's how the magic works:         │
│                                                      │
│   🎙️  Record a job site walkthrough                  │
│   📸  Add photos of the scope                        │
│   ✨  AI generates a complete estimate               │
│   📤  Send as PDF or shareable link                  │
│                                                      │
│   Ready to create your first estimate?               │
│                                                      │
│   [Show me around]        [Start estimating →]       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Camada 2 — Tour com spotlight (se clicar "Show me around")**

Sequência de 5 passos com highlight no elemento relevante:

```
Passo 1: "+ New Project" button
  → "Start here. Create a project for each job site."

Passo 2: Audio Recorder (na tela de captura)
  → "Walk the job site and record. No typing needed."

Passo 3: Photo Upload
  → "Add photos so AI understands the scope of work."

Passo 4: Generate Estimate button
  → "One click. AI writes the entire estimate for you."

Passo 5: Send Tab (PDF / Link / WhatsApp)
  → "Send by PDF, shareable link, or WhatsApp — in seconds."
```

**Camada 3 — Tooltips contextuais (aparecem na primeira visita a cada seção)**

| Elemento | Tooltip |
|----------|---------|
| Price Book | "Save your most-used items to speed up future estimates" |
| Client list | "Clients are saved automatically when you send an estimate" |
| Estimate total | "Tap any line to edit, add, or remove items" |
| WhatsApp send | "Clients receive a professional message with the estimate link" |

### Comportamento

- Tour aparece automaticamente apenas na primeira sessão pós-onboarding
- Estado "visto" salvo em `localStorage` key `tour_completed` (não precisa de DB)
- Botão "?" fixo no canto inferior direito permite rever o tour a qualquer momento
- Tooltips contextuais: cada um tem sua própria chave em `localStorage`, aparece apenas 1x

## Implementação Técnica

### Sem bibliotecas de terceiros

Implementar com CSS + Tailwind puro:
- Spotlight: `<div>` com `box-shadow: 0 0 0 9999px rgba(0,0,0,0.6)` + `z-index` sobre o elemento alvo
- Tooltip: `position: absolute` relativo ao elemento destacado
- Sem dependências como Joyride, Shepherd, ou Driver.js (evitar peso no bundle)

### Componentes a criar

```
components/tour/
  tour-provider.tsx        — context + estado do tour
  welcome-modal.tsx        — modal de boas-vindas pós-onboarding
  tour-spotlight.tsx       — overlay com highlight de elemento
  tour-tooltip.tsx         — tooltip posicionado
  tour-step.tsx            — wrapper que registra elementos como alvos
  use-tour.ts              — hook para controlar o tour
  contextual-tooltip.tsx   — tooltip de primeira visita (genérico)
```

### Integração com onboarding

Em `app/onboarding/page.tsx` (ou na action de conclusão):
- Após `redirect('/dashboard')`, setar flag `onboarding_just_completed: true` em `localStorage`
- O `TourProvider` no layout detecta a flag e abre o welcome modal automaticamente

### Integração com layout

```tsx
// app/(app)/layout.tsx
<TourProvider>
  <WelcomeModal />  {/* auto-mostra se flag presente */}
  {children}
</TourProvider>
```

## Breadcrumbs

- [`app/onboarding/page.tsx`](app/onboarding/page.tsx) — ponto de redirect pós-onboarding
- [`app/(app)/layout.tsx`](app/(app)/layout.tsx) — onde injetar TourProvider
- [`components/onboarding/`](components/onboarding/) — padrão de componentes existente
- [`lib/i18n/use-translation.ts`](lib/i18n/use-translation.ts) — o tour deve usar `t()` para suportar PT/ES

**Nota:** o tour deve funcionar em conjunto com SEED-026 — os textos do tour devem passar por `t()` para que usuários PT/ES vejam o tour no seu idioma.

## Scope Estimate

**Médio** — 1 fase, 2-3 dias:

1. TourProvider + welcome modal + localStorage state management
2. Tour spotlight (5 passos) com posicionamento dinâmico
3. Contextual tooltips (5 elementos prioritários)
4. Botão "?" para rever o tour
5. i18n do tour (integrar com `t()`)
6. Testes: tour aparece apenas 1x, "Show me around" inicia spotlight, botão "?" reabre

## Notas

- **Mobile-first:** O tour deve funcionar em iOS Safari e Android Chrome. Spotlight via `box-shadow` funciona em mobile sem JavaScript de posicionamento complexo.
- **Não bloquear:** O tour nunca impede o usuário de usar o app. Sempre há um "Skip" / "X" visível.
- **Conexão com SEED-026:** Os textos do tour devem usar `t()` — implementar após SEED-026 para que i18n esteja pronto.
- **Progressivo:** Não mostrar todos os tooltips de uma vez. Cada tooltip aparece na primeira visita à seção relevante, não no primeiro login.
- **Analytics hook (futuro):** Os steps do tour são bons eventos para analytics (`tour_step_viewed`, `tour_completed`, `tour_skipped`). Não implementar analytics agora, mas nomear as funções de forma que seja trivial adicionar depois.
