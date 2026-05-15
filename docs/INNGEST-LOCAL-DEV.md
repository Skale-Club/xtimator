# Inngest Local Development

Phase 67 introduced [Inngest](https://www.inngest.com/) as the background job runner for long-running AI calls (estimate generation, audio transcription, photo analysis, WhatsApp inbound processing). Locally, you run a separate `inngest-cli dev` server that auto-discovers the worker functions registered at `http://localhost:9633/api/inngest`.

## One-time setup

No global install required — we use `npx`. Optionally install globally:

```bash
# macOS / Linux:
curl -sSfL https://cli.inngest.com/install.sh | sh

# Windows: use npx (recommended)
npx inngest-cli@latest --version
```

No real signing keys are required for local development — the dev server accepts dummy values. Add these to `.env.local` (placeholders only — never commit real keys):

```bash
INNGEST_EVENT_KEY=signkey-test-<your-dummy-event-key>
INNGEST_SIGNING_KEY=signkey-test-<your-dummy-signing-key>
```

## Daily workflow — TWO terminals

**Terminal 1: Next.js dev server**

```bash
npm run dev
# → http://localhost:9633
```

**Terminal 2: Inngest dev server**

```bash
npm run dev:inngest
# → dashboard at http://localhost:8288
# auto-discovers functions at http://localhost:9633/api/inngest
```

Both must be running for any AI flow (capture, WhatsApp inbound, photo analysis) to complete.

## Verifying it works

1. Open both terminals as above.
2. Visit `http://localhost:8288` — you should see 4 registered functions:
   - `generate-estimate`
   - `transcribe-audio`
   - `analyze-photos`
   - `whatsapp-process`
3. Trigger an estimate from the capture screen at `/projects/<id>/capture`.
4. Watch the run appear in the Inngest dashboard with each `step.run` checkpoint visible.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Dashboard shows "0 functions" | inngest-cli pointing to wrong URL | confirm `npm run dev:inngest` includes `-u http://localhost:9633/api/inngest` |
| Job dispatched but never executes | inngest-cli not running | start Terminal 2 |
| Dashboard says "401 Unauthorized" | `INNGEST_SIGNING_KEY` missing | add placeholder to `.env.local` and restart `npm run dev` |
| Browser `/api/jobs/[id]` returns 503 | Same as above | restart `npm run dev` after env var added |
| Capture stepper stuck on "Transcribing" | Whisper failed | check the Inngest dashboard run details for the actual error |

## Production notes

- On Vercel deploy: install the Inngest-Vercel integration to auto-sync the production keys.
- On future Hetzner deploy: copy production keys from https://app.inngest.com → Settings → Keys into the server's `.env.production`.
- Free tier covers 50,000 monthly executions — comfortable headroom for MVP.
