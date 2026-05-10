---
id: SEED-005
status: harvested
planted: 2026-05-08
planted_during: v1.4 Estimate Plain Text & Pricing Tools (post-milestone cleanup)
harvested_during: v1.5 Zero-friction Project Onboarding + v1.6 Multi-modal Project Input (Phases 27-33)
harvested: 2026-05-09
trigger_when: Próximo milestone focado em onboarding de projetos, experiência do usuário no campo, ou expansão das modalidades de entrada de dados
scope: Medium
---

# SEED-005: Multi-modal Project Input (Áudio / Texto / Foto)

## Why This Matters

Hoje o Xtimator é **voice-first de forma exclusiva**: o wizard de criação de projeto tem um único step (seleção de cliente) e imediatamente redireciona para `/capture` — a tela de gravação de áudio em tela cheia. Não existe caminho alternativo.

Isso cria fricção real em situações comuns do dia a dia de um service business:

- **Ambiente barulhento** (obra, rua, oficina) — impossível gravar áudio com qualidade
- **Reunião ou local silencioso** — gravar seria inadequado
- **Job site de manhã cedo com pressa** — tirar 3-4 fotos é mais rápido do que gravar 2 minutos de áudio
- **Escritório, não campo** — dono da empresa ou assistente digitando a descrição em um desktop
- **Follow-up de visita anterior** — já tem as fotos, não precisa gravar nada

O conceito central do Xtimator — "job site audio → estimate in 5 minutes" — é poderoso, mas **audio não é o único caminho válido**. As 3 modalidades têm o mesmo valor:

| Modalidade | Cenário ideal |
|-----------|--------------|
| 🎙️ Áudio | Campo, mãos ocupadas, preferência por falar |
| ✍️ Texto | Escritório, ambiente silencioso, assistente administrativo |
| 📸 Fotos | Job site rápido, follow-up, evidência visual é suficiente |

## Fluxo Proposto

**Hoje:**
```
/projects/new → [client select] → redirect → /capture (áudio obrigatório)
```

**Com SEED-005:**
```
/projects/new → [client select] → [escolha de modalidade] → branch:
  → 🎙️ Áudio: /projects/[id]/capture  (fluxo existente)
  → ✍️ Texto: /projects/[id]/describe (nova rota — textarea + gerar)
  → 📸 Fotos: /projects/[id]/photos   (nova rota — upload direto + gerar)
```

A escolha de modalidade pode ser uma tela de 3 cards grandes (mobile-friendly, ícone + label + descrição curta) — segundo step do wizard ou tela própria após criação do projeto.

## Modalidade Texto — Detalhes

- Uma `Textarea` grande (mínimo 10 linhas) com placeholder: *"Describe the job... e.g. 'Two-bedroom apartment, need carpet cleaning in both rooms and upholstery cleaning on a sectional sofa...'"*
- Botão "Generate Estimate" envia o texto como `transcript` (mesmo campo usado pelo Whisper)
- O pipeline de geração de orçamento é **idêntico ao de áudio** — a única diferença é a origem do texto (digitado vs transcrito)
- Fotos opcionais ainda podem ser adicionadas para complementar

## Modalidade Fotos — Detalhes

- Upload direto de fotos (drag-and-drop ou câmera), mesmo componente de `PhotoDropZone` que já existe
- Botão "Generate from Photos" disponível assim que ao menos 1 foto é adicionada
- Pipeline: Claude Vision → análise das fotos → geração do orçamento (sem necessidade de transcript)
- Hoje isso já funciona tecnicamente (`hasTranscript || hasPhotos` na `estimate-tab.tsx`) mas a UX não expõe esse caminho — o usuário sempre cai no `/capture` primeiro

## Pontos de Integração no Código Atual

- `components/projects/new-project-wizard.tsx` — wizard atual (1 step: client select). Adicionar step 2 para escolha de modalidade
- `app/(app)/projects/new/page.tsx` — servidor do wizard, sem mudanças necessárias
- `app/(app)/projects/[id]/capture/` — rota existente para áudio, reaproveitada como-está
- `components/workspace/estimate/estimate-tab.tsx` — lógica `hasTranscript || hasPhotos` já suporta fotos-only; só falta o UX de entrada
- `lib/queries/recording.ts` — `Recording.transcript` — o campo existe; input de texto salva aqui diretamente (sem `storage_path` ou `duration_seconds`)
- `app/api/generate-estimate/route.ts` — rota de geração, reusada pelos 3 caminhos
- `components/workspace/photos/photo-drop-zone.tsx` — componente existente para upload de fotos

## Scope Estimate

**Medium** — 2-3 fases:

1. **Redesign do wizard** — Adicionar step de escolha de modalidade (3 cards: Áudio / Texto / Fotos). Redireciona para a rota correta. Inclui novo modelo de dados para `input_mode` no projeto (optional: `audio | text | photos | mixed`).

2. **Rota de texto** — `/projects/[id]/describe`: textarea + save as recording.transcript (sem `storage_path`, `duration_seconds` null) + botão "Generate Estimate" que dispara o pipeline existente. Mobile-first, large tap targets.

3. **Rota de fotos aprimorada** — `/projects/[id]/photos-input` (ou melhoria na tab Photos existente): upload rápido → "Generate from Photos" visível e proeminente. Garante que o usuário não precise navegar pelo workspace para chegar na geração.

**Fora do escopo:**
- Combinação de modalidades no mesmo onboarding (mixed input) — cada projeto começa com uma modalidade; o usuário pode sempre adicionar mais no workspace depois
- Transcrição de texto para áudio (TTS) — desnecessário
- Reconhecimento de handwriting em fotos — v3+

## Breadcrumbs

- `components/projects/new-project-wizard.tsx` — onde adicionar o segundo step de escolha
- `app/(app)/projects/[id]/capture/page.tsx` — rota de áudio existente, modelo para as novas rotas
- `components/workspace/photos/photo-drop-zone.tsx` + `photo-grid.tsx` — reusar para a rota de fotos
- `lib/actions/recording.ts` — `createRecording` — reusar para salvar o input de texto como transcript
- `app/api/generate-estimate/route.ts` — pipeline de geração, reutilizado integralmente

## Notes

- As 3 modalidades têm o **mesmo peso** no onboarding — nenhuma é "primária" na escolha, mas todas convergem para o mesmo pipeline de geração
- O usuário pode sempre adicionar outros tipos de mídia depois (entrou por texto → adiciona fotos no workspace, etc.)
- A escolha de modalidade deve ser rápida no mobile (3 cards grandes, 1 toque)
- Considerar "last used mode" para pré-selecionar na próxima vez (company preference ou localStorage)
