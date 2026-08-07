---
task: 260806-w4k
title: Keep the phone screen awake during recording and estimate generation
subsystem: capture
tags: [capture, recording, pwa, mobile, ios, wake-lock]
dependency-graph:
  requires: []
  provides: [useWakeLock, isWakeLockSupported]
  affects:
    - components/capture/capture-recorder.tsx
    - components/projects/inline-audio-recorder.tsx
    - components/workspace/ai-input-group/ai-voice-dialog.tsx
    - components/chat/chat-composer.tsx
    - components/workspace/estimate/refine-estimate-dialog.tsx
    - components/workspace/estimate/estimate-tab.tsx
tech-stack:
  added: []
  patterns: [screen-wake-lock-api, visibilitychange-reacquire, boolean-flag-driven-hook]
key-files:
  created:
    - hooks/use-wake-lock.ts
    - tests/unit/hooks/use-wake-lock.test.tsx
  modified:
    - components/capture/capture-recorder.tsx
    - components/projects/inline-audio-recorder.tsx
    - components/workspace/ai-input-group/ai-voice-dialog.tsx
    - components/chat/chat-composer.tsx
    - components/workspace/estimate/refine-estimate-dialog.tsx
    - components/workspace/estimate/estimate-tab.tsx
decisions:
  - "One boolean-flag hook for all six surfaces instead of per-component wake-lock code — callers never touch the sentinel, so the release path can't be forgotten"
  - "visibilitychange re-acquire is load-bearing, not defensive: the browser auto-releases on hide and never re-acquires, so without it one tab switch loses the lock for the rest of the recording"
  - "No NoSleep.js-style muted-video fallback for iOS < 16.4 — it needs play() inside a user gesture and the awaited getUserMedia has already broken that chain, so it would be unreliable theater"
  - "Lock released as soon as the pipeline reaches a surface that needs a tap anyway (failure, needs-details) or completes — an aborted flow must not pin the screen on"
metrics:
  duration: "~35 min"
  completed: 2026-08-06
---

# Quick Task 260806-w4k: Keep the phone screen awake during recording and estimate generation Summary

O celular apagava a tela no meio da gravação de áudio e na tela de geração do orçamento no PWA. O app nunca pediu screen wake lock — agora pede, em todas as superfícies hands-free.

## What was built

**Novo `hooks/use-wake-lock.ts`** — `useWakeLock(active: boolean)` sobre a Screen Wake Lock API:

- Adquire `navigator.wakeLock.request('screen')` enquanto `active` for true e o documento estiver visível.
- **Readquire em `visibilitychange`** — o browser revoga o sentinel sozinho quando o documento fica hidden e nunca o readquire; sem isso, uma única troca de aba perderia o lock pelo resto da gravação. O guard `!sentinel.released` faz a chamada redundante virar no-op (sem locks empilhados).
- Solta o lock quando `active` vira false e no unmount (fluxo abortado não pode prender a tela ligada).
- Flag `cancelled` protege contra o cleanup rodando com `request()` ainda em voo — sem ela o sentinel resolvido ficaria guardado após o teardown e nunca seria liberado.
- Rejeição (`NotAllowedError`: documento hidden, economia de bateria, permissions-policy) é engolida por design: a gravação segue normal, e o listener de visibilidade cobre os casos recuperáveis.
- `isWakeLockSupported()` exportado; sem API o hook é no-op silencioso.

**Seis superfícies conectadas** (as 5 que chamam `getUserMedia` + a tela de espera da geração):

| Superfície | Flag |
|---|---|
| `capture-recorder.tsx` — popup New Xtimate + rota `/capture` | `isRecording \|\| isPipelineRunning \|\| isUploadingPhotos` |
| `inline-audio-recorder.tsx` | `isRecording \|\| isSaving` |
| `ai-voice-dialog.tsx` | `isRecording \|\| isSubmitting` |
| `chat-composer.tsx` | `recording \|\| normalizing` |
| `refine-estimate-dialog.tsx` | `recState === 'recording' \|\| submitState === 'submitting'` |
| `estimate-tab.tsx` — tela `?autoGenerating=true` | `isAutoGenerating && !currentEstimate` |

No `capture-recorder`, `isPipelineRunning = stage !== 'idle' && stage !== 'done' && !failedAt && !needsDetailsInfo` — cobre saving/transcribing/analyzing/generating (a "tela de gerar o orçamento" do relato) e solta o lock assim que a UI volta a exigir um toque. No `estimate-tab` a chamada fica acima dos early returns (ordem de hooks).

## Testes

`tests/unit/hooks/use-wake-lock.test.tsx` — 8 casos com um duplo de `navigator.wakeLock` (jsdom não tem a API): adquire/não adquire pela flag, solta ao desativar, solta no unmount, **readquire após o auto-release em hide**, não empilha lock com sentinel vivo, no-op silencioso sem API, sobrevive a `request()` rejeitado.

## Verificação

- `npx tsc --noEmit -p tsconfig.ci.json` — limpo.
- `npx vitest run tests/unit tests/eval` — 606 arquivos passaram / 1 skipped, 5028 testes passaram / 20 todo. Sem regressões.

## Caveat

iOS < 16.4 e WebViews antigos não têm a Screen Wake Lock API — nesses o hook é no-op e a tela continua apagando. Descartado o fallback de vídeo mudo (NoSleep.js): ele exige `play()` dentro do gesto do usuário, e o `await getUserMedia` já quebrou essa cadeia antes do hook rodar. iOS 16.4 é de março/2023, então a cobertura real é alta.
