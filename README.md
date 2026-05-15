# Xtimator

Xtimator is a SaaS web application for US-based service businesses (construction, landscaping, plumbing, electrical, HVAC, cleaning, painting, etc.) to create professional, AI-powered estimates and quotes from job site audio recordings and photos.

**Core value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.

## Tech stack

- **Frontend:** Next.js 16 (App Router), TypeScript strict, Tailwind 4, shadcn/ui (New York), next-themes
- **Backend / DB / Auth / Storage:** Supabase (PostgreSQL with RLS, Auth, Storage)
- **Background jobs:** Inngest (estimate generation, transcription, photo analysis, WhatsApp inbound)
- **AI:** Anthropic Claude (estimates + photo Vision), OpenAI Whisper (transcription), Google Gemini (alternate provider)
- **PDF:** `@react-pdf/renderer`
- **Email:** Resend
- **Payments:** Stripe (subscriptions: Free / Trial / Pro / Business)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Install git hooks (gitleaks pre-commit)
bash scripts/install-git-hooks.sh

# 3. Copy env template and fill in real values (Supabase keys, Anthropic, Stripe, etc.)
cp .env.example .env.local
# (edit .env.local — NEVER commit it)

# 4. Run the dev server
npm run dev
# → http://localhost:9633
```

### Background Jobs (Inngest)

Long-running AI calls (estimate generation, transcription, photo analysis) run as Inngest background jobs. Local development requires running the Inngest dev server alongside Next.js, in a **second terminal**:

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run dev:inngest
```

Dashboard: http://localhost:8288 — see [`docs/INNGEST-LOCAL-DEV.md`](./docs/INNGEST-LOCAL-DEV.md) for full setup, env vars, and troubleshooting.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server on port 9633 |
| `npm run dev:inngest` | Inngest dev server (functions discovery + dashboard at :8288) |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (unit + integration) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright E2E |

## Secret handling (CRITICAL)

**Never commit secrets, API keys, or signing secrets to git** — including in markdown, comments, examples, or planning docs (`.planning/`, seeds, summaries).

- All secrets go in `.env.local` (gitignored) for local dev, or in your hosting provider's env vars for staging/prod.
- Documenting setup? Use placeholders like `whsec_<your-secret>` or `sk_live_<your-key>`.
- The pre-commit hook (`gitleaks`) blocks commits containing patterns matching `whsec_*`, `sk_(test|live)_*`, `rk_(test|live)_*`, `sb_secret_*`, `sk-ant-*`, `sk-proj-*`, `re_*`.
- After cloning, install hooks once: `bash scripts/install-git-hooks.sh`.
- If a secret leaks: **rotate at the provider FIRST**, then rewrite history (`git commit --amend` + `git push --force-with-lease`).

## Documentation

- [`docs/INNGEST-LOCAL-DEV.md`](./docs/INNGEST-LOCAL-DEV.md) — Inngest local dev workflow
- [`docs/STORAGE-MIGRATION.md`](./docs/STORAGE-MIGRATION.md) — Storage abstraction layer migration guide
- [`docs/supabase-keepalive.md`](./docs/supabase-keepalive.md) — Supabase keep-alive notes
- `.planning/PROJECT.md` — Living project document (stack, milestones, decisions)
- `.planning/STATE.md` — Current execution position
- `.planning/ROADMAP.md` — Active milestone roadmap

## License

Proprietary — all rights reserved.
