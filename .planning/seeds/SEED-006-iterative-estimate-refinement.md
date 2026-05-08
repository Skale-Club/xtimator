---
id: SEED-006
status: dormant
planted: 2026-05-08
planted_during: v1.4 Estimate Plain Text & Pricing Tools (post-milestone cleanup)
trigger_when: Próximo milestone focado em AI UX, qualidade do orçamento gerado, ou fluxo de revisão/aprovação do orçamento com o cliente
scope: Medium
---

# SEED-006: Iterative Estimate Refinement (Voz / Texto / Foto pós-geração)

## Why This Matters

Hoje, depois que o orçamento é gerado, o usuário tem **duas opções** para alterar algo:

1. **Edição manual inline** — clica em cada campo, muda valor, salva
2. **Regenerar do zero** — botão "Regenerate" que joga fora o orçamento atual e recomeça com todo o material de origem

Nenhuma delas é ideal quando o usuário quer fazer uma **correção cirúrgica guiada por instrução**:

- *"Adiciona mais uma demão de tinta na sala — o cliente pediu"*
- *"O banheiro que eu falei no áudio é maior do que parece, aumenta 20% no item de azulejo"*
- *"Acabei de tirar essa foto do porão — considera isso também"*
- *"Remove tudo relacionado a limpeza de carpete, o cliente já vai cuidar disso"*

Essas instruções são **contextuais** — o usuário sabe exatamente o que quer mudar, mas não quer reeditar campo por campo, nem descartar o orçamento inteiro.

## Conceito

Um painel de refinamento no workspace do projeto (aba Estimate) onde o usuário envia uma instrução — por voz, texto ou foto — e o AI atualiza o orçamento existente sem partir do zero.

```
[Orçamento atual]
    ↓
[Instrução do usuário: "adiciona pintura do teto na sala, 20m²"]
    ↓
Claude recebe: orçamento atual (JSON) + instrução + price book
    ↓
Claude retorna: orçamento atualizado (JSON diff ou full)
    ↓
[Nova versão do orçamento criada — versão anterior preservada]
```

O sistema de versões já existe (`is_current`, `version_number`) — cada refinamento cria uma nova versão, o usuário pode voltar atrás.

## Diferença vs "Regenerate"

| | Regenerate (atual) | Refinement (novo) |
|--|-------------------|-------------------|
| **Input** | Todo material de origem (todos áudios + fotos) | Instrução pontual do usuário |
| **Output** | Orçamento do zero | Orçamento atual + modificações |
| **Usa estimate atual** | ❌ descarta | ✅ preserva como base |
| **Controle do usuário** | Baixo | Alto |
| **Velocidade** | Lenta (analisa tudo de novo) | Rápida (contexto menor) |

## Modalidades de Instrução

**Texto** (mais simples):
- Input field com placeholder: *"What should I change? e.g. 'Add gutter cleaning, about 80 linear feet'"*
- Envio imediato, sem precisar gravar

**Voz** (natural no campo):
- Botão de gravação inline (não tela cheia — diferente do `/capture`)
- Gravação curta (~30 segundos max — instrução, não descrição completa do job)
- Whisper transcreve → instrução enviada ao Claude como texto

**Foto** (evidência visual nova):
- Upload de uma nova foto → Claude Vision analisa → gera instrução automática ou incorpora diretamente no refinamento
- Útil para: "esqueci de fotografar o banheiro" ou "o cliente mostrou mais um ambiente"

## Prompt para o Claude

O prompt de refinamento é estruturalmente diferente do de geração:

```
Existing estimate (current state):
{JSON do orçamento atual com seções e itens}

Company price book:
{price book da empresa, mesmo que já existe}

User refinement instruction:
"{instrução do usuário em texto}"

Task: Update the estimate to reflect the user's instruction.
- Modify, add, or remove items/sections as needed
- Keep everything else unchanged
- Preserve price_source tagging
- Return the full updated estimate in the same JSON format
```

## UX Sketch

No workspace, aba "Estimate" (onde o editor já fica):

```
┌─────────────────────────────────────────────────┐
│  [Version selector]  [Regenerate]               │
│                                                 │
│  [estimate editor — seções e itens]             │
│                                                 │
├─────────────────────────────────────────────────┤
│  ✏️ Refine this estimate                         │
│                                                 │
│  ┌─────────────────────────────────┐  🎙️  📸   │
│  │  Describe what to change...     │            │
│  └─────────────────────────────────┘  [Send]   │
│                                                 │
│  "Added: Gutter cleaning (80 ft) — v3"          │
└─────────────────────────────────────────────────┘
```

Seção colapsável abaixo do editor. Não polui o workspace atual. Mostra histórico de refinamentos da versão atual.

## Scope Estimate

**Medium** — 2-3 fases:

1. **Refinamento por texto** — input field + nova rota `POST /api/estimates/[id]/refine` + Claude prompt de refinamento + nova versão. Inclui nova rota `app/api/estimates/[id]/refine/route.ts`.

2. **Refinamento por voz** — mini-gravador inline (não full-screen) com cap de ~30s. Whisper → texto → mesmo pipeline de refinamento. Reutiliza `MediaRecorder` e API do Whisper já existentes.

3. **Refinamento por foto** — upload de nova foto, análise via Claude Vision, incorporação no refinamento. Reutiliza `PhotoDropZone` e `analyze-photos` pipeline.

**Fora do escopo:**
- Chat multi-turn (histórico de conversa com o AI sobre o orçamento) — v2
- Aprovação do cliente via instrução de refinamento — fora do escopo
- Diff visual "antes/depois" na UI — nice-to-have, Claude's discretion

## Breadcrumbs

- `app/api/generate-estimate/route.ts` — pipeline atual; nova rota de refinamento `app/api/estimates/[id]/refine/route.ts` segue o mesmo padrão mas recebe `instruction` em vez de re-processar todo o material
- `lib/ai/index.ts` — `getAIProvider()` — reutilizado pelo endpoint de refinamento
- `components/workspace/estimate/estimate-editor.tsx` — onde o painel de refinamento será adicionado
- `components/workspace/estimate/estimate-tab.tsx` — `handleRegenerate` — entender o padrão de versioning para o refinamento
- `lib/queries/estimate.ts` — `getCurrentEstimate`, `EstimateWithSections` — base do contexto enviado ao Claude
- `app/(app)/projects/[id]/capture/` — mini-gravador voz pode reutilizar lógica do `MediaRecorder` aqui
- `app/api/transcribe/route.ts` (ou equivalente) — Whisper transcription para a modalidade voz

## Notes

- O refinamento **sempre cria uma nova versão** — o usuário nunca perde o orçamento anterior. O seletor de versão já existente permite voltar atrás.
- A instrução de texto é enviada como-está ao Claude (sem Whisper) — mais rápido e sem custo de transcrição
- Para voz: gravação curta (~30s), não a tela full-screen do `/capture`. A UX inline é proposital — o usuário está no workspace, não iniciando um projeto do zero.
- O mini-gravador de voz não substitui o `/capture` — são contextos diferentes (criação de projeto vs refinamento de estimate)
- Complementa SEED-005 (que trata do input inicial do projeto)
