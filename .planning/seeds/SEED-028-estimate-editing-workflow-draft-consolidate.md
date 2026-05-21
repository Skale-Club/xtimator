---
id: SEED-028
status: harvested
planted: 2026-05-20
planted_during: v3.1.1 MVP Launch Prep (workflow polish)
trigger_when: Próximo milestone focado em UX do editor de estimate e/ou maturidade do fluxo draft → versão consolidada do orçamento
scope: Medium-Large
---

# SEED-028: Estimate Editing Workflow — Draft, Consolidate, Float Save & AI Refinement Inline

## Why This Matters

O editor de estimate atual tem três problemas de UX que, juntos, deixam o fluxo "amador":

1. **Autosave a cada 2s é ruim para esse domínio.** Orçamento é documento contratual — o usuário precisa sentir o "commit" da alteração. Autosave silencioso:
   - cria ansiedade ("será que salvou? salvou a versão errada?")
   - dispara saves intermediários enquanto o usuário ainda está pensando no preço
   - polui o histórico de versões / triggers de webhook / notificações
   - faz o status bar do topo competir com o conteúdo
2. **Não há separação clara entre "ainda mexendo" e "fechado/enviável".** Hoje a única semântica é `is_current` (a versão atual sempre é editável). O usuário não tem um momento explícito de *"pronto, esse é o orçamento que vou mandar"*. Sem isso:
   - não dá pra travar a versão que foi enviada ao cliente
   - não dá pra criar um v2 a partir de uma versão "fechada" de forma intencional
   - rastreabilidade fica frágil (qualquer edição muda o documento que o cliente já viu)
3. **Refinamento com IA já existe (SEED-006 harvested) mas a paridade com o setup do projeto é incompleta.** O `/capture` inicial aceita áudio longo + fotos + texto numa UX rica e mobile-first. O painel de refinamento é um campo pequeno colapsável. O usuário aprende uma forma de "falar com a IA" no onboarding e encontra outra, menor, no editor.

Este seed unifica esses três pontos num workflow coerente: **Draft → Edit (com Save flutuante + Refine paridade-com-setup) → Consolidate (read-only, enviável) → New Version (v2) a partir do consolidado**.

## Conceito

### Estados do Estimate

```
            ┌─────────┐    Consolidate    ┌──────────────┐    New version    ┌─────────┐
  Created → │  DRAFT  │ ─────────────────▶│ CONSOLIDATED │ ─────────────────▶│  DRAFT  │ (v2)
            │ (edit)  │                   │  (read-only) │                   │ (edit)  │
            └─────────┘                   └──────────────┘                   └─────────┘
                 │                              │
                 │ Save Draft                   │ Send / PDF / Share
                 │ (mantém DRAFT)               │ (permitido apenas em CONSOLIDATED)
                 ▼                              ▼
```

- **DRAFT** — editável, não enviável, não aparece em links públicos como "versão final"
- **CONSOLIDATED** — read-only, é o que o cliente vê / recebe por PDF / WhatsApp / link
- **Apenas um draft "em aberto" por projeto** — se já existe um draft, "criar nova versão" abre esse mesmo draft. Se a última versão é consolidada, "nova versão" cria um DRAFT v(n+1) a partir dela.

### Save Flutuante (bottom-right)

- **Sem autosave.** Mudanças ficam locais (cliente) até o usuário decidir gravar.
- Botão flutuante posição `fixed bottom-6 right-6`, aparece **apenas quando `state.isDirty === true`**, com micro-animação de entrada.
- Dois CTAs no botão (ou um split-button):
  - **Save Draft** (primário enquanto draft) — persiste no servidor, mantém status DRAFT
  - **Consolidate** (CTA secundário no draft; vira primário quando o usuário indica "vou enviar") — persiste + marca a versão como CONSOLIDATED + libera ações de envio
- Estado visual: `idle` (escondido) → `dirty` (visível pulsando suave) → `saving` (spinner) → `saved` (checkmark 2s, depois somem)
- Em **read-only/consolidated**: o botão flutuante não aparece. No lugar, aparece um botão flutuante "**Create new version**" que duplica a versão atual em DRAFT.

### Refinamento com IA — paridade com setup

A "trigger" do refinamento sai de painel inferior colapsável e vira **modal/drawer full-screen** (mobile) ou **side-panel grande** (desktop), reaproveitando a UX do `/capture`:

- **Texto** — campo amplo, multiline, mesmo placeholder pattern do setup
- **Áudio** — gravador full-screen com waveform, sem cap de 30s (ou cap maior, ex 2min — usuário pode descrever várias mudanças de uma vez)
- **Foto** — drop zone / câmera direta, múltiplas fotos por refinamento
- Mistura livre: pode mandar áudio + 2 fotos + texto numa única instrução
- O resultado **NÃO cria nova versão automaticamente** (mudança vs comportamento atual da SEED-006). Em vez disso, **aplica a mudança ao DRAFT atual** e marca `isDirty`. O usuário decide quando "Save Draft" ou "Consolidate" — isso preserva a semântica de "commit explícito" do save flutuante.
- Exceção: se a versão atual é CONSOLIDATED, o refinamento **automaticamente cria um novo DRAFT v(n+1)** e aplica a mudança ali. Visualmente: "Created v2 draft with your changes".

## UX Sketch

### Estado: DRAFT, sem alterações pendentes

```
┌────────────────────────────────────────────────────────┐
│ Estimate v3  •  Draft                  [Refine with AI]│
│                                                        │
│  [editor — seções, itens, totais — editável]           │
│                                                        │
│                                                        │
│                                                        │
│                                       (nada flutuante) │
└────────────────────────────────────────────────────────┘
```

### Estado: DRAFT, com alterações pendentes

```
┌────────────────────────────────────────────────────────┐
│ Estimate v3  •  Draft                  [Refine with AI]│
│                                                        │
│  [editor com mudanças não salvas]                      │
│                                                        │
│                                                        │
│                              ┌──────────────────────┐  │
│                              │ Save draft  │  Consoli│  │ ← flutuante
│                              │             │  date ▸ │  │   bottom-right
│                              └──────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### Estado: CONSOLIDATED (read-only)

```
┌────────────────────────────────────────────────────────┐
│ Estimate v3  •  Consolidated ✓   [Send] [PDF] [Share]  │
│                                                        │
│  [editor em modo leitura — inputs disabled]            │
│                                                        │
│                                                        │
│                                  ┌──────────────────┐  │
│                                  │ + New version    │  │ ← flutuante
│                                  │   from this      │  │   bottom-right
│                                  └──────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### Refine modal (full-screen, paridade com `/capture`)

```
┌────────────────────────────────────────────────────────┐
│ ✕                Refine v3 draft                       │
│                                                        │
│  ┌──────────────────────────────────────────────┐      │
│  │ Describe what to change…                     │      │
│  │                                              │      │
│  └──────────────────────────────────────────────┘      │
│                                                        │
│  🎙️  [Long-press to record]   📸  [Add photos]         │
│                                                        │
│  Attached:                                             │
│    • audio_001.webm  (0:42)   ✕                        │
│    • bathroom_2.jpg           ✕                        │
│                                                        │
│                              [Cancel]  [Apply changes] │
└────────────────────────────────────────────────────────┘
```

Após "Apply changes": modal fecha, editor mostra as mudanças aplicadas localmente, `isDirty: true`, botão flutuante de Save aparece. Usuário decide quando confirmar.

## Schema Impact

```sql
-- estimates table
ALTER TABLE estimates ADD COLUMN workflow_status text NOT NULL
  DEFAULT 'draft' CHECK (workflow_status IN ('draft', 'consolidated'));
ALTER TABLE estimates ADD COLUMN consolidated_at timestamptz;
ALTER TABLE estimates ADD COLUMN consolidated_by uuid REFERENCES auth.users(id);

-- Apenas estimates consolidated podem ter sent_at, viewed_at, paid_at não-nulos
-- (constraint defensiva — opcional na fase 1, obrigatória depois)

-- Apenas uma versão draft "ativa" por projeto
CREATE UNIQUE INDEX one_active_draft_per_project
  ON estimates (project_id)
  WHERE workflow_status = 'draft' AND is_current = true;
```

Migração de dados: todas as estimates existentes onde `sent_at IS NOT NULL OR status IN (...)` viram `consolidated`; o resto permanece `draft`. (Defensivo — checar `status` real em uso.)

## RLS / Server-side guards

- Endpoints de envio (`/api/estimates/[id]/send`, geração de PDF público, share token público) devem retornar 404/403 se `workflow_status !== 'consolidated'`
- `saveEstimate()` server action: bloqueia escrita se a versão alvo é `consolidated`
- Apenas o `consolidate` server action pode mudar `workflow_status` de draft → consolidated (não via update direto)
- Refinamento via IA aplicado a versão consolidated automaticamente forka para um novo draft (server-side, não cliente)

## Scope Estimate

**Medium-Large** — 4 fases:

### Fase A — Schema + estado workflow_status (S)
- Migração `workflow_status`, `consolidated_at`, `consolidated_by`
- Backfill de dados existentes
- Atualizar tipos TS e queries de estimate
- Server actions: `consolidateEstimate`, `createNewDraftVersion`
- Guards de RLS e de server actions

### Fase B — Save flutuante + remoção do autosave (M)
- Remover `useEffect` de autosave em `components/workspace/estimate/estimate-editor.tsx:156`
- Componente `<FloatingSaveButton />` (novo): aparece quando `isDirty`, fixed bottom-right, mobile-first
- Substituir status bar atual por badge sutil de status (`Draft` / `Consolidated`)
- Em consolidated: `<FloatingNewVersionButton />` substitui o save
- Hotkey `cmd+S` mapeada para "Save Draft"
- Aviso `beforeunload` se `isDirty`

### Fase C — Refine modal full-screen com paridade `/capture` (M-L)
- Extrair / reaproveitar componentes de captura: gravador full-screen, photo dropzone, lista de attachments
- Modal `<RefineEstimateDialog />` (substitui o painel colapsável atual)
- Endpoint `/api/estimates/[id]/refine` aceita `audio[]`, `photos[]`, `instruction` num único form-data
- Comportamento: aplica mudança ao DRAFT atual em memória/servidor (não cria nova versão automaticamente, exceto se estava consolidated)
- Backend transcreve áudio (Whisper) + analisa fotos (Claude Vision) + monta prompt unificado de refinamento

### Fase D — Polish, telemetria, testes E2E (S-M)
- Toasts e empty states ("All changes saved as draft v3")
- Botão "Discard changes" próximo ao save flutuante quando `isDirty`
- Métricas: tempo entre create → consolidate; nº de refinements antes de consolidar; % de drafts abandonados
- Testes Playwright cobrindo: edit → save draft → refine → consolidate → new version

**Fora do escopo:**
- Chat multi-turn com a IA dentro do refine modal (mantém one-shot)
- Diff visual antes/depois (nice-to-have — pode virar SEED separado)
- "Unconsolidate" / rollback de consolidated → draft (intencionalmente proibido — para "voltar atrás", o caminho é criar nova versão)
- Reaproveitamento do mesmo widget de save em outras telas do app (price book, settings) — fora do escopo deste seed

## Breadcrumbs

- `components/workspace/estimate/estimate-editor.tsx:156-194` — autosave atual + manual save, ponto de remoção/substituição
- `components/workspace/estimate/use-estimate-reducer.ts` — `isDirty`, `MARK_SAVED` — reutilizado pelo save flutuante
- `lib/actions/estimate.ts:72-290` — `saveEstimate` server action, adicionar guard de `workflow_status === 'consolidated'`
- `app/api/estimates/[id]/refine/route.ts` — endpoint de refinamento atual; estender para aceitar áudio + fotos + texto (paridade com setup)
- `app/(app)/projects/[id]/capture/` — UX/lógica do gravador full-screen e photo dropzone a serem reaproveitados no Refine modal
- `lib/queries/estimate.ts:1-34` — `Estimate` interface, adicionar `workflow_status`, `consolidated_at`, `consolidated_by`
- `components/workspace/estimate/refine-estimate-panel.tsx` — painel atual a ser substituído pelo modal full-screen
- `app/api/estimates/[id]/send/route.ts` (ou equivalente) e geração de PDF/link público — adicionar guard de "apenas consolidated"
- `supabase/migrations/` — nova migração `2026MMDD000001_estimate_workflow_status.sql`

## Notes

- O nome do estado **"Consolidated"** foi escolhido sobre "Final" / "Locked" porque carrega a noção de "decisão tomada, fechado" sem implicar "imutável para sempre" (sempre dá pra criar v2). Validar com testes de usuário — alternativas: "Finalize", "Lock", "Confirm".
- O comportamento de **refinamento aplicar a mudança ao draft em vez de criar nova versão** é uma mudança vs SEED-006 — intencional, porque agora temos a separação draft/consolidated. Refinamento em draft = mais uma edição não-salva. Refinamento em consolidated = força criar v(n+1) draft.
- O **save flutuante** deve respeitar safe-area em iOS (notch / home indicator) — usar `env(safe-area-inset-bottom)`.
- Comportamento ao **fechar o navegador com `isDirty: true`**: aviso nativo `beforeunload` + (idealmente) salvar localmente em `localStorage` como recovery. Recovery é nice-to-have, não bloqueante.
- **Consolidate é irreversível pela UI** — mas via banco/admin sempre dá. Não construir "unconsolidate" como feature do usuário; o caminho oficial é "Create new version".
- A consolidação **dispara** os hooks de envio que já existem (e-mail, WhatsApp, link público ficam acessíveis). Antes da consolidação, link público deve retornar 404 ou página "Estimate is still being prepared" — decisão de produto.
- Este seed **substitui parcialmente** a UX de refinamento de SEED-006 (já harvested) e **complementa** SEED-005 (multi-modal input). A paridade de UX entre setup e refine é parte do valor.
- Considerar interação com **SEED-013 (subscription tiers)**: se "número de versões" virar uma feature gated, draft + consolidated dá uma surface natural pra contar ("você usou 5 de 10 estimates consolidados este mês").
