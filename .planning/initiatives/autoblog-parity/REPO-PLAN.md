---
initiative: autoblog-parity
repo: xtimator
phase: P4
role: builds the system by copying the xkedule structure
status: planned
---

# Auto-Blog Parity — Xtimator

Read [`MASTER.md`](./MASTER.md) first.

Xtimator has a **manual** blog only: a minimal `blog_posts` table, admin CRUD under
`app/admin/blog/`, public pages under `app/blog/`. There is no automation, no AI, no
scheduling, no approval queue. The job here is to copy the structure the other repos run —
adapted from Express to Next.js App Router + Inngest.

Single-site (MASTER D-10): no `tenant_id`, no super-admin gate, platform AI key (D-05).

## Architecture mapping

| Express repos | Xtimator |
|---|---|
| `server/routes/blog*.ts` | `app/api/blog/**/route.ts` + server actions in `app/admin/blog/actions.ts` |
| `server/services/blog-generator.ts` | `lib/blog/generator.ts` |
| `shared/blog-prompt.ts`, `shared/blog-schedule.ts` | `lib/blog/prompt.ts`, `lib/blog/schedule.ts` |
| `server/storage.ts` methods | Supabase service-role queries in `lib/blog/queries.ts` |
| `node-cron` / `skale-cron` | **Inngest** `{ cron: '15 * * * *' }` + an HTTP break-glass route |
| `logAiGeneration` | `ai_generation_logs` table + existing `lib/ai/with-fallback.ts` instrumentation |

## Tasks

| id | task | notes |
|---|---|---|
| **XT-01** | `lib/blog/contract.ts` — enums and types from MASTER §3 | P0 for this repo |
| **XT-02** | Migration: extend `blog_posts` with `tags`, `author_name`, `focus_keyword`, `reading_time_minutes`, `ai_generated`, `feature_image_url` | today the table has only title/slug/content/excerpt/cover/status/meta |
| **XT-03** | Migration: create `blog_settings`, `blog_generation_jobs`, `blog_post_feedback`, `blog_rss_sources`, `blog_rss_items` (single-site shape), `ai_generation_logs` — **RLS on every table**, service-role write, no public read except published posts | matches the repo's existing RLS convention |
| **XT-04** | Migration: `telegram_settings` — promote the current platform-alerts `chat_id` into a full row with `chat_ids text[]`, `approvals_enabled`, `approvals_bot_token`, `approvals_chat_ids`, `webhook_secret`; backfill the existing alert chat id | keep platform alerts working through the same row |
| **XT-05** | Port `lib/blog/prompt.ts` and `lib/blog/schedule.ts` from xkedule, adapted to Xtimator's own content (services offered, service area, published posts for internal links) | pure modules, no I/O — port verbatim where possible |
| **XT-06** | `lib/blog/generator.ts` — the full pipeline: pillar/RSS topic → content → sanitise + 600–4000 bounds → image (best-effort, WebP, 16:9, curated fallback) → Supabase Storage upload → draft or publish per `auto_publish` → job row with `durations_ms` → cost logged | uses `lib/ai/with-fallback.ts` for text; OpenRouter for image |
| **XT-07** | Port `lib/blog/rss-fetcher.ts` + `lib/blog/rss-selector.ts` from skaleclub; RSS optional per D-02 | new dep: `rss-parser` |
| **XT-08** | Port the retry/timeout helpers (`lib/blog/ai-retry.ts`) and the content validator (`lib/blog/content-validator.ts`) from skaleclub | |
| **XT-09** | Inngest function `autoblog-sweep`, `triggers: [{ cron: '15 * * * *' }]`, plus a `blog/rss.fetch` cron at `45 * * * *` and a `blog/generate.requested` event for manual runs | follow the repo's existing cron functions (`billing-reconciliation`, `cleanup-audio`) for the `step.run` / never-throw discipline |
| **XT-10** | Route handlers for MASTER §4, including `POST /api/blog/cron/generate` + `/fetch-rss` on `CRON_SECRET` as break-glass when an Inngest sync is missed | the repo has a documented history of missed Inngest re-syncs silently stopping event-triggered jobs — the HTTP path is the safety net |
| **XT-11** | `POST /api/telegram/webhook` + approvals per MASTER §6: separate approvals bot, group and thread support, `setWebhook` on save, reconcile job, per-chat test button | |
| **XT-12** | Admin UI: an **Automation** tab under `app/admin/blog/` — settings, posting hour with "next post at …", approval queue, jobs with retry/cancel and stage timings, preview, RSS sources, feedback history, cost panel | mirror the tab layout of xkedule's `BlogSettings.tsx` |
| **XT-13** | DB lock (`blog_settings.lock_acquired_at`, stale after 10 min) so the Inngest path and the HTTP path cannot double-generate | never an in-memory guard — Next.js runs multiple instances |
| **XT-14** | Tests in `tests/unit/`: schedule, RSS selector, sanitiser bounds, retry classifier | runs under the existing `vitest run tests/unit tests/eval` gate, which must pass on `main` before `build-deploy.yml` fires |

## Guardrails specific to this repo

- **GSD workflow is enforced** (`CLAUDE.md`): start this work through `/gsd:execute-phase`
  (or `/gsd:quick` for the small doc/config steps). Do not make direct repo edits outside a
  GSD workflow unless explicitly told to bypass it.
- **Secret handling is strict.** No key, token or webhook secret in markdown, comments,
  planning docs or seeds. `gitleaks` pre-commit blocks `sk-*`, `whsec_*`, `sb_secret_*`,
  `re_*` patterns. Use placeholders like `whsec_<your-secret>`. Telegram bot tokens go in
  the DB (encrypted) or `.env.local`, never in a plan.
- **Deploy is Coolify, not Vercel**, despite the stale `.vercel/project.json`. After deploy,
  `build-deploy.yml` PUTs `/api/inngest` to force a re-sync — a missed sync silently stops
  every event-triggered job, which is exactly why XT-10 exists.
- `types/database.types.ts` is generated — regenerate it after each migration.

## Order of work

1. XT-01 … XT-04 (contract + schema)
2. XT-05, XT-08 (pure modules first — they are testable without any infrastructure)
3. XT-06 (generator) + XT-13 (lock)
4. XT-09, XT-10 (scheduling, both paths)
5. XT-07 (RSS)
6. XT-11 (Telegram + groups)
7. XT-12 (UI), XT-14 (tests)
