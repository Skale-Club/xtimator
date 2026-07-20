<!-- GSD:project-start source:PROJECT.md -->
## Project

**Xtimator**

Xtimator is a SaaS web application for US-based service businesses (construction, landscaping, plumbing, electrical, HVAC, cleaning, painting, etc.) to create professional, AI-powered estimates and quotes. A business owner visits a job site, records an audio walkthrough, takes photos, and the AI generates a complete, professionally formatted estimate — ready to send as a branded PDF or shareable link.

**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard. 

### Constraints

- **Tech Stack**: Next.js 14+ (App Router), TypeScript strict, Tailwind CSS, shadcn/ui, Zustand or React Context, react-hook-form + zod
- **Database**: Supabase PostgreSQL with RLS on all tables; schema defined in spec (8 tables)
- **AI**: Anthropic Claude (OpenRouter slug `anthropic/claude-sonnet-5`, set in `OR_DEFAULTS.chat`) for estimate generation and photo analysis
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
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack  

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.

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
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
