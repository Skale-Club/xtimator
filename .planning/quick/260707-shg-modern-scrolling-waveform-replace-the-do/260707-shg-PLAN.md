# Modern scrolling waveform (amplitude history) — 260707-shg

## Context

O usuário apontou que o elemento mais datado da tela de gravação é o **waveform** — hoje um
osciloscópio instantâneo (getByteTimeDomainData por frame) que renderiza como uma linha
pontilhada fina. O padrão moderno (iOS Voice Memos / WhatsApp) é o **histórico de amplitude
rolando**: barras verticais arredondadas, espelhadas no eixo central, deslizando da direita
para a esquerda conforme se fala — mostra a FORMA do que foi dito, não um frame picotado.

Encaixe com o pause recém-lançado (260707-ru5): o popup passa `isRecording={isRecording && !isPaused}`
ao visualizer — no design novo, pausar CONGELA as barras no lugar (histórico preservado),
em vez de trocar para a animação idle. Retomar continua acrescentando barras.

Componente compartilhado: components/workspace/audio/waveform-visualizer.tsx — todos os
consumidores (popup New Xtimate, VoiceRecorder → inline-audio-recorder / ai-voice-dialog /
refine-estimate-dialog) herdam o visual novo mantendo a MESMA API de props.

## Design

### Task 1 — Rewrite interno do WaveformVisualizer (API preservada)

Arquivo: components/workspace/audio/waveform-visualizer.tsx
Props públicas INALTERADAS: `{ analyser: AnalyserNode | null; isRecording: boolean; height?: number }`
(consumidores não mudam). Internamente:

1. **Amostragem por amplitude** (substitui o desenho por frame):
   - A cada animation frame com `isRecording && analyser`: calcular a amplitude do frame
     via RMS do time-domain (`getByteTimeDomainData` → rms = sqrt(mean((v-128)/128)^2)).
   - Janela de commit: acumular o PICO de rms e a cada `BAR_INTERVAL_MS = 60` fechar uma
     barra nova no buffer (usar performance.now() acumulado — não contar tempo em que
     isRecording=false, para o freeze do pause funcionar).
   - Buffer circular: `MAX_BARS` derivado da largura (width / (BAR_WIDTH+GAP)); barras mais
     antigas caem quando o buffer enche (efeito de rolagem contínua).
2. **Render** (canvas, devicePixelRatio-aware como hoje):
   - Barras verticais espelhadas no eixo central: largura 3px, gap 3px, cantos arredondados
     (ctx.roundRect ou lineCap 'round' com strokes), altura = amplitude normalizada
     (normalização suave: `h = max(MIN_BAR, pow(rms * BOOST, 0.8) * halfHeight)` com
     MIN_BAR ~2px para silêncio aparecer como pontinho).
   - Alinhamento: barras mais novas à DIREITA; quando o buffer não encheu ainda, começar
     do centro-direita deslocando para a esquerda (como iOS).
   - Cor: manter o gradiente de marca atual (topo `--primary` → base `--secondary`, lidos
     das CSS vars como hoje) com fade sutil de opacidade nas barras mais antigas
     (ex.: alpha 1.0 → 0.35 linear pela idade). SEM shadowBlur/glow (datado) — flat.
3. **Estados**:
   - `isRecording=true`: amostra + rola.
   - `isRecording=false` COM histórico no buffer (caso pause): **congela** — renderiza o
     buffer estático, sem novas amostras, sem animação. NÃO limpar o buffer.
   - `isRecording=false` SEM histórico (idle real, analyser null ou nunca gravou):
     linha central fina (1px, `--muted-foreground` a ~30%) com respiração MUITO sutil
     (substitui a onda senoidal atual, bem mais quieta) — ou pontos mínimos estáticos.
   - Buffer é RESETADO quando `analyser` muda de instância (novo início de gravação cria
     novo AnalyserNode em startRecording — usar isso como sinal de nova take; guardar a
     instância anterior num ref para detectar troca).
4. **Helpers puros exportados para teste** (no mesmo arquivo ou
   lib/audio/waveform-history.ts — preferir arquivo novo lib para pureza):
   - `pushBar(buffer: number[], value: number, maxBars: number): number[]`
   - `normalizeAmplitude(rms: number, halfHeight: number, minBar?: number): number`
   - `rmsFromTimeDomain(data: Uint8Array): number`

### Task 2 — Ajuste do palco no popup (capture-recorder.tsx)

- No overlay de gravação do isHorizontal: waveform vira o herói — `height={100}` (era 80)
  e container `w-full max-w-md` (garantir que ocupa a largura do canvas com padding
  consistente do popup). Nada além disso muda (timer/status/barra já modernizados em ru5).
- Conferir os consumidores menores (VoiceRecorder md/lg usam height default 96; sm menor):
  nenhum ajuste necessário — o novo render escala por height. Verificação visual apenas.

### Task 3 — Testes

- tests/unit/audio/waveform-history.test.ts (novo): rmsFromTimeDomain (silêncio=128s → ~0;
  onda cheia → ~1); normalizeAmplitude (silêncio → MIN_BAR; clamp em halfHeight);
  pushBar (append, rolagem no maxBars, imutável ou in-place documentado).
- Suites afetadas: rodar npx vitest run tests/unit/ (targeted: tests/unit/audio/,
  tests/unit/capture/) + npx tsc --noEmit + eslint nos arquivos tocados.

## Invariantes

- API pública do WaveformVisualizer INALTERADA (zero mudanças nos consumidores além do
  height do popup).
- Sem strings novas de UI (nada a traduzir).
- tsc/eslint no baseline; ResizeObserver/DPR handling preservados.
- Flat: sem glow/shadowBlur no render novo.

## Verificação manual pós-deploy

Gravar no popup: barras arredondadas rolando da direita pra esquerda acompanhando a voz;
silêncio = pontinhos baixos; pausar → barras CONGELAM; retomar → continua acrescentando;
parar/regravar → waveform limpo. Gravadores menores (inline/diálogos) com o mesmo visual.

## Execução

Executor Sonnet, 3 commits atômicos (rewrite visualizer + helpers / palco popup / testes),
depois docs + sync dev/main + deploy.
