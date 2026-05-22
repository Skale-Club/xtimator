---
status: investigating
trigger: "Após salvar áudio com sucesso (\"Saving recording\" ✓), pipeline trava em \"Transcribing\" indefinidamente. UI nunca avança para \"Analyzing\" / \"Generating estimate\"."
created: 2026-05-22T15:00:00Z
updated: 2026-05-22T15:00:00Z
---

## Current Focus

hypothesis: transcribe-audio Inngest function failed ~70s into execution (Whisper timeout, missing OPENAI_API_KEY, signed-URL issue, or storage download error)
test: locate handler code, read step-by-step, identify which step could fail at ~70s mark
expecting: a step that calls OpenAI Whisper API or a Supabase storage download with a likely failure cause
next_action: glob for `transcribe-audio` / `audio/transcribe.requested` handler

## Symptoms

expected: After "Saving recording" ✓ completes, "Transcribing" should transcribe audio (likely via OpenAI Whisper in Inngest background job) and advance to "Analyzing" → "Generating estimate".
actual: "Saving recording" shows ✓. "Transcribing" shows spinner indefinitely. UI never advances. Inngest dashboard shows transcribe-audio FAILED after ~70s, then onFailure handler running.
errors:
  - Inngest event `audio/transcribe.requested` (ID `01KS8DDMB22696Z4BC13ZBZGMM`) → `transcribe-audio` FAILED at 14:58:36 → 14:59:46 (~70s)
  - Follow-up `inngest/function.failed` → `transcribe-audio (failure)` running (onFailure handler)
  - Browser 500/404 likely SW noise (manifest.webmanifest, CSS chunk) — not primary
reproduction:
  1. dev server + Inngest dev server running locally
  2. Create new project / open capture
  3. Record short audio, stop
  4. UI: Saving recording ✓ → Transcribing (infinite loading)
  5. Inngest dashboard shows transcribe-audio FAILED
started: First end-to-end test after recent Inngest/SW changes (commits 379d689, cbe860c, 71e61d6, 8271c83, 86612e5)

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-05-22T15:00:00Z
  checked: starting investigation
  found: Need to locate transcribe-audio handler code
  implication: investigation entry point

## Resolution

root_cause:
fix:
verification:
files_changed: []
