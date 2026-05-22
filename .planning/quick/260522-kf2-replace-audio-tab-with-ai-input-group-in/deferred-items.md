# Deferred Items — Quick task 260522-kf2

Out-of-scope discoveries surfaced during execution. Not fixed in this task.

## Pre-existing test drift

### `tests/unit/inngest/transcribe-audio-job.test.ts` — Whisper URL assertion outdated

**File:** `tests/unit/inngest/transcribe-audio-job.test.ts:38`

**What:** Test asserts that `lib/inngest/functions/transcribe-audio.ts` source contains
`api.openai.com/v1/audio/transcriptions`. The implementation has since been migrated
to OpenRouter via `transcribeAudioOR` (no direct OpenAI URL in source).

**Status:** FAILING on `main` independently of this task. The cleanup-audio job we added does
not touch this file. Out of scope per the executor's scope boundary rules.

**Suggested follow-up:** Either update the assertion to match OpenRouter
(`openrouter.ai`) or assert on `transcribeAudioOR` instead.

## Run command we used to verify scope

```
npx vitest run tests/unit/inngest/cleanup-audio-job.test.ts tests/unit/inngest/route.test.ts
```

Result: 9/9 passing.
