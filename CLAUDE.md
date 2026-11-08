<!-- journal-protocol:v1 -->
## Journal (mandatory)

This app's history (what it does, how each part was built, decisions and releases) lives in its Notion Journal. It replaces the old GSD/PAUL planning flow; `.planning/` and `.paul/`, if present, are a read-only legacy archive.

- Journal hub: https://app.notion.com/p/411b7a68612181a69880c591ba1c868b
- Journal Entries data source: collection://0837277e-6b3b-438e-b16b-8d6c1a00b425
- Latest view: view://411b7a68-6121-81da-a4b3-000c58aee199
- Entry prefix: XTM
- Rules (they win on any conflict): https://app.notion.com/p/411b7a68612181b3ac36f4ce2b2c3850 (skill: `app-journal`)

**Start of session:** fetch the hub and read Identity and Current State; list the latest 20 entries with Notion query-data-sources in `view` mode on the Latest view above (`page_size` 20; view mode has no plan quota) and read only titles and summaries; use `rows` mode with a filter only to narrow down (it has a plan quota); if a read fails, say so and continue from the code, never guess journal content; open only the entries you need; never read the whole database. Cross-check with the code: the code is the fact.

**End of every task that changed code, behavior, infrastructure or a decision:**
1. Create ONE entry in the data source above (one per logical unit of work, not per commit): `Title` = `YYYY-MM-DD — <imperative summary>`, `date:Date:start` (YYYY-MM-DD, with `date:Date:is_datetime` = 0), `Type`, `Area` (JSON array of existing options), `Status`, `Summary` (max 280 characters), `Agent`, `Model`, `Repo / Branch`, `Commits / PR`, `Tests` (what ran, or "Not run"), and `Decision ID` / `Decision Status` when a choice was made.
2. Body headings: Context · What changed · How it was built · Decisions and why · Tests and evidence · Not done / risks · Next.
3. If the app changed, rewrite the affected part of the hub's Current State. Read back what you wrote; never report a write you did not see.
4. Notion unavailable: append the full entry to `docs/journal/PENDING-NOTION.md` and tell the owner.

Journal records are in English. No secrets.
<!-- /journal-protocol -->

<!-- universal-rules:v1 -->
## Universal rules (read first)

Before working, read the owner's universal agent rules: `$HOME/Dev/skaleclub-apps/agents/RULES.md`
(GitHub: https://github.com/Skale-Club/skaleclub-apps/blob/main/agents/RULES.md).
They cover model routing (the session model plans and validates, cheaper models execute), machine awareness (Surface = light mode, `machine-check.ps1`), delivery estimates with no silent stalls, and the database, login, git and language decisions. Keep it light: they help, never block.
This file adds only what is specific to this repository.
<!-- /universal-rules -->

## Project

**Xtimator**

Xtimator is a SaaS web application for US-based service businesses (construction, landscaping, plumbing, electrical, HVAC, cleaning, painting, etc.) to create professional, AI-powered estimates and quotes. A business owner visits a job site, records an audio walkthrough, takes photos, and the AI generates a complete, professionally formatted estimate — ready to send as a branded PDF or shareable link.

**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard. 

### Constraints

- **Tech Stack**: Next.js 14+ (App Router), TypeScript strict, Tailwind CSS, shadcn/ui, Zustand or React Context, react-hook-form + zod
- **Database**: Supabase PostgreSQL with RLS on all tables; schema defined in spec (8 tables)
- **AI**: Anthropic Claude (OpenRouter slug `anthropic/claude-sonnet-5.5`, set in `OR_DEFAULTS.chat`) for estimate generation and photo analysis
- **Audio transcription**: OpenAI Whisper API (server-side)
- **PDF**: @react-pdf/renderer or puppeteer (server-side generation)
- **Mobile**: Audio recording and camera capture must work on iOS Safari and Android Chrome
- **Security**: Service role key never exposed to browser; all AI calls server-side via API routes

### Secret Handling (CRITICAL)

**NEVER commit secrets, API keys, or signing secrets to git — including in markdown, comments, examples, or planning docs (`.planning/`, seeds, summaries).**

- All secrets go in `.env.local` (gitignored) for local dev, or in Vercel env vars for staging/prod
- Documenting setup? Use placeholders like `whsec_<your-secret>` or `sk_live_<your-key>`
- Pre-commit hook (`gitleaks`) blocks commits containing patterns matching: `whsec_*`, `sk_(test|live)_*`, `rk_(test|live)_*`, `sb_secret_*`, `sk-ant-*`, `sk-proj-*`, `re_*`
- After cloning, install hooks once: `bash scripts/install-git-hooks.sh`
- If a secret leaks: **rotate at the provider FIRST**, then rewrite history (`git commit --amend` + `git push --force-with-lease`)

## Technology Stack

- Next.js 16 (App Router) + React 19, TypeScript strict
- Tailwind CSS v4 + shadcn/ui; react-hook-form + zod for forms
- Supabase (PostgreSQL + Auth, RLS on every table); migrations live in `supabase/migrations/` and are applied by hand (`npm run db:migrate`), never by the deploy
- Inngest for background jobs (`app/api/inngest`), Resend (email), Twilio (SMS/WhatsApp), Stripe (billing)
- @react-pdf/renderer for PDFs (`components/pdf/`, `lib/pdf/`)
- Tests: vitest (`tests/unit`, `tests/eval`), Playwright (`tests/e2e`); see `package.json` scripts for dev/test commands

## Conventions

- Chat with the maintainer may be in Portuguese; code, comments, commits and docs are English
- Work directly on `main`. No planning framework or ceremony is required before editing files; small fixes go straight in, larger changes get a short plan in the commit or PR description
- Any change to the estimate document must be verified on every surface it renders on: editor (width and page view), public share page and PDF
- Provider API keys are configured in the admin panel (`platform_integrations`), never in env vars; the env fallback is dev-only

## Architecture

- `app/(app)/` authenticated workspace; `app/estimate/[token]/` public share page; `app/api/` route handlers (all AI, PDF and server-side work)
- `components/workspace/estimate/` estimate editor and document renderers; `components/share/` public page; `components/pdf/` PDF templates; `components/settings/` company settings
- `lib/estimate/` document model, labels, design tokens, pagination engine and template registry; `lib/queries/` data access; `lib/actions/` server actions
- The Classic estimate template is the primary design and is implemented three times that must stay in sync: web document (`estimate-document.tsx`), paginated preview (`preview-template/classic.tsx`) and PDF (`estimate-pdf.tsx`). The Modern template exists in code but is not the primary design; new design work targets Classic only

### Deployment (production)

Production deploy is **GitHub Actions → Docker/GHCR → Coolify** (self-hosted at
`coolify.skale.club`) — **not Vercel**, despite a `.vercel/project.json` present
in the repo root (that file is a stale/unused artifact — the connected Vercel
account has no `xtimator` project under it; do not assume Vercel controls
production).

Pipeline (`.github/workflows/build-deploy.yml`), triggered by `workflow_run`
after `test.yml`'s `Test` workflow completes on `main`:
1. `Test` workflow (typecheck + `vitest run tests/unit tests/eval`) must pass
   on `main` — `build-deploy.yml` only runs `if: workflow_run.conclusion == 'success'`.
2. Builds the Next.js app into a Docker image, pushes to `ghcr.io/skale-club/xtimator`.
3. Calls the Coolify API to pull the new image (rolling/zero-downtime update,
   app UUID `cf1cqh0bq8jyw91e78tcw8c6`).
4. Polls `https://xtimator.com/api/health` for the new commit SHA, then PUTs
   `/api/inngest` to force Inngest Cloud to re-sync serve endpoints (a missed
   sync here silently stops every event-triggered Inngest job — see
   `.planning/debug/whatsapp-inbound-no-reply-recurrence.md`).

To check deploy status: `gh run list`/`gh run watch` for the `Test` and
`Build and Deploy` workflow runs on `main`, not any Vercel API/dashboard.
