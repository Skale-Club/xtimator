---
status: fixing
trigger: "Após salvar áudio com sucesso (\"Saving recording\" ✓), pipeline trava em \"Transcribing\" indefinidamente. UI nunca avança para \"Analyzing\" / \"Generating estimate\"."
created: 2026-05-22T15:00:00Z
updated: 2026-05-22T15:35:00Z
---

## Current Focus

hypothesis: OpenRouter API key missing — recent migration (commit 4bdd1ae, 2026-05-21) moved ALL AI (transcription, vision, translation) from direct provider SDKs to OpenRouter. transcribeAudioOR() calls getORKey() which reads platform_integrations.openrouter (encrypted DB row) and falls back to process.env.OPENROUTER_API_KEY. Neither is configured — .env.local has OPENAI_API_KEY but no OPENROUTER_API_KEY, and the user has NOT yet seeded the OpenRouter integration via /admin/integrations. getORKey() throws "OpenRouter API key not configured" → step.run('whisper-transcribe') fails on every attempt → Inngest retries 2x with default ~25-30s exponential backoff → total ~70s before final failure → onFailure handler runs.
test: confirm OPENROUTER_API_KEY absence in .env.local AND platform_integrations.openrouter row absence.
expecting: env var missing (already confirmed via grep) + platform_integrations row also absent.
next_action: confirm platform_integrations.openrouter row state via supabase MCP, then propose two-step fix: (A) ask user to add OPENROUTER_API_KEY to .env.local OR seed via /admin/integrations, (B) verify by re-running transcription.

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

- timestamp: 2026-05-22T15:10:00Z
  checked: lib/inngest/functions/transcribe-audio.ts (the Inngest function)
  found: |
    Function id 'transcribe-audio', retries: 2 (so 3 attempts total).
    step.run('whisper-transcribe') does: (1) requireServiceClient() → service-role download from 'audio' bucket via storagePath, (2) call transcribeAudioOR(fileData, ext) from lib/ai/openrouter-client.ts.
    step.run('save-transcript') updates recordings.transcript.
    onFailure handler builds an 'ai_job.failed' notification (Phase 77 NOTIF-04) — matches "transcribe-audio (failure) running" we see in the dashboard.
  implication: Failure must originate inside the whisper-transcribe step (download succeeds with service role even if RLS would deny — so the failure is almost certainly inside transcribeAudioOR()).

- timestamp: 2026-05-22T15:12:00Z
  checked: lib/ai/openrouter-client.ts:transcribeAudioOR + getORKey
  found: |
    transcribeAudioOR posts FormData (file, model='openai/whisper-large-v3-turbo', response_format='text') to https://openrouter.ai/api/v1/audio/transcriptions with Authorization: Bearer <getORKey()>.
    getORKey() = getIntegrationKey('openrouter'); throws 'OpenRouter API key not configured' when null.
    On non-OK HTTP, throws `OpenRouter transcription failed (${res.status}): ${err.slice(0,400)}`.
  implication: There are exactly two ways the step can fail:
    A) getORKey() throws synchronously (no key in DB row AND no env fallback) — fast failure.
    B) OpenRouter API returns non-2xx (invalid key / quota / model missing) — fast failure.
    Either way, each attempt fails in <1s. Cumulative ~70s = Inngest's default exponential backoff between retries (≈10s, 20s, then small overhead). Matches the observed 14:58:36 → 14:59:46 wall-clock.

- timestamp: 2026-05-22T15:15:00Z
  checked: lib/platform-config.ts:getIntegrationKey('openrouter')
  found: |
    Reads `platform_integrations` row WHERE provider='openrouter'; decrypts ciphertext. On miss, falls back to process.env.OPENROUTER_API_KEY (and logs a console.warn). If both absent → returns null.
  implication: Two configuration paths need to be checked: (1) the DB row, (2) env var. Verifying both is critical.

- timestamp: 2026-05-22T15:18:00Z
  checked: c:\Users\User\Desktop\projetos_skale\xtimator\xtimator\.env.local (variable names only)
  found: Variable names present: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY, RESEND_API_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, STRIPE_CONNECT_CLIENT_ID_API_KEY, STRIPE_CONNECT_WEBHOOK_SECRET, SUPABASE_ACCESS_TOKEN, NEXT_PUBLIC_TURNSTILE_SITE_KEY, APP_ENCRYPTION_KEY, INNGEST_DEV, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY. NO `OPENROUTER_API_KEY` anywhere.
  implication: Env-var fallback path is unavailable. Only the platform_integrations DB row can satisfy getORKey() right now.

- timestamp: 2026-05-22T15:20:00Z
  checked: git log on lib/inngest/functions/transcribe-audio.ts + lib/ai/openrouter-client.ts
  found: |
    Commit 4bdd1ae (2026-05-21) "feat: migrate all AI to OpenRouter + new-project modal + UX polish" introduced lib/ai/openrouter-client.ts and rewrote transcribe-audio.ts to call transcribeAudioOR() instead of OpenAI directly. .env.local.example was updated to recommend OPENROUTER_API_KEY (legacy ANTHROPIC/OPENAI lines marked "no longer used"). The user's local .env.local was NOT updated.
  implication: Bug timeline is consistent — first end-to-end audio test AFTER the OpenRouter migration. Pre-migration, OPENAI_API_KEY in env was enough. Post-migration, that key is irrelevant for transcription.

- timestamp: 2026-05-22T15:22:00Z
  checked: Resolved debug session .planning/debug/audio-upload-failing.md (commit d4a5781 applied the platform_admins RLS recursion fix via SECURITY DEFINER helper). User now sees "Saving recording ✓".
  found: Storage upload path is healthy; the bug is downstream of insert into recordings.
  implication: Confirms the failure window is now within the Inngest transcribe job, not in the upload step.

- timestamp: 2026-05-22T15:24:00Z
  checked: tests/unit/inngest/transcribe-audio-job.test.ts
  found: The test asserts `expect(src).toMatch(/api\.openai\.com\/v1\/audio\/transcriptions/)` but transcribe-audio.ts now uses OpenRouter. This test should be FAILING after commit 4bdd1ae but was not updated.
  implication: Side issue (stale test) — flagged for follow-up but not the runtime bug.

## Resolution

root_cause: |
  The Inngest transcribe-audio worker cannot obtain an OpenRouter API key. Commit 4bdd1ae (2026-05-21, "feat: migrate all AI to OpenRouter") rewrote transcribe-audio.ts to call transcribeAudioOR() in lib/ai/openrouter-client.ts, which authenticates against https://openrouter.ai via getORKey() → getIntegrationKey('openrouter'). That function reads the encrypted platform_integrations row WHERE provider='openrouter' and falls back to process.env.OPENROUTER_API_KEY. The user's .env.local was not updated to add OPENROUTER_API_KEY (it still has only the legacy OPENAI_API_KEY), and (presumed) the platform_integrations.openrouter row has not been seeded. getORKey() throws "OpenRouter API key not configured" inside step.run('whisper-transcribe'). Each of the 3 attempts (initial + retries: 2) fails fast, but Inngest's default exponential backoff between attempts sums to ~60-70s of wall time, after which the function is marked Failed and the onFailure handler ('transcribe-audio (failure)') fires the 'ai_job.failed' notification — matching exactly what the dashboard shows for event 01KS8DDMB22696Z4BC13ZBZGMM.
fix: |
  Two valid paths — user picks ONE. Both unblock transcription, photo analysis (analyzePhotoOR), and translation (translateTextsOR) all at once.

  **Option A (fastest, local-only):** Add to .env.local:
    OPENROUTER_API_KEY=sk-or-v1-<your-real-key>
  Get the key from https://openrouter.ai/keys (free tier works; whisper-large-v3-turbo is ~$0.04/hour of audio). After editing .env.local, RESTART `npm run dev` (env vars are loaded at process start) and restart `npm run dev:inngest` (the Inngest dev CLI also re-introspects functions but the Next.js process is the one that needs the new env).

  **Option B (matches production pattern):** Seed the encrypted DB row via the admin UI:
    1. Sign in as a platform admin (a user listed in `public.platform_admins`).
    2. Navigate to /admin/integrations.
    3. Paste the OpenRouter key into the OpenRouter provider field; save.
    4. Verify via the UI that the integration is marked configured.
    No restart needed — getIntegrationKey() has a 30s TTL cache.

  Recommended for the user right now: Option A (fastest), then later mirror in /admin/integrations so production deploys don't need an env var.

  **Verification after either fix:**
    1. In a fresh browser tab, repro the audio recording flow exactly as in Symptoms.reproduction.
    2. Expected: "Transcribing" advances to "Analyzing" then "Generating estimate" within ~10-30s (Whisper turbo is fast).
    3. Inngest dashboard at http://localhost:8288 should show transcribe-audio Completed (green), with output containing the transcript text. No onFailure handler should fire.
    4. The recording row should have `transcript` populated (check via the estimate-tab or directly).

  **Out of scope for this session (deferred):**
    - tests/unit/inngest/transcribe-audio-job.test.ts still asserts `api.openai.com/v1/audio/transcriptions` — should be updated to `openrouter.ai/api/v1/audio/transcriptions` to match commit 4bdd1ae. File a follow-up.
    - app/api/jobs/[jobId]/route.ts takes data[0] from Inngest's /v1/events/{eventId}/runs response; ordering is not documented as guaranteed. With the primary fix in place, only one run exists per event so this is benign for now, but worth hardening (filter by function_id === 'transcribe-audio' or similar) in a future task.
verification:
  Not yet performed — checkpoint to user to add the key, then re-test end-to-end.
files_changed:
  - (pending) .env.local — user-supplied secret addition, NOT committed
  - (no code changes needed) — pure configuration fix
