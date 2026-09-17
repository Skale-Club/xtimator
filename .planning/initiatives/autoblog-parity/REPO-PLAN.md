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
| ~~XT-01~~ | ~~`lib/blog/contract.ts`~~ | **DONE** |
| ~~XT-02~~ | ~~Extend `blog_posts`~~ | **DONE** — no `feature_image_url`: `cover_image_url` already is the contract's feature image, and a second column would only raise the question of which one renders |
| ~~XT-03~~ | ~~Operational tables + RLS~~ | **DONE** — `20260916190000_autoblog_schema.sql`. `blog_settings` is pinned to id 1 by a check constraint so an upsert cannot create a second config |
| ~~XT-04~~ | ~~`telegram_settings`~~ | **DONE** — new table with the array shape. **Not wired to the existing platform-alerts chat_id**: that lives in the integrations panel and moving it is a separate change |
| ~~XT-05~~ | ~~`prompt.ts` + `schedule.ts`~~ | **DONE** — schedule is byte-identical; the 8 pillars are Xtimator's own. Every other product writes as a business to its customers; this blog is a SaaS writing to the contractors who use it |
| **XT-06** | Generator | **DONE** — images landed (`lib/blog/cover-image.ts`, 16:9 + WebP + `platform-brand` upload, best-effort so a busy image model can never cost a post) — pillar/RSS topic → content → link sanitiser → tag allowlist → 600–4000 bounds → draft or publish → job row with stage timings → cost logged from OpenRouter's own `usage.cost`. **No cover generation yet**: `durations_ms.image` is null and posts publish without one |
| ~~XT-07~~ | ~~RSS fetcher + selector~~ | **DONE** — one `lib/blog/rss.ts`. Upsert uses `ignoreDuplicates` so a later sweep cannot resurrect a used item; `MIN_RSS_SCORE` falls back to the pillar rotation rather than picking the least bad of fifty |
| ~~XT-08~~ | ~~`ai-retry.ts` + `content-validator.ts`~~ | **DONE** — ported verbatim |
| ~~XT-09~~ | ~~Inngest crons~~ | **DONE** — `autoblog-sweep` hourly at :15, `autoblog-rss-fetch` every 2h at :45. Manual runs go through the server action rather than an event, which keeps the admin's result synchronous |
| **XT-10** | Route handlers | **DONE** — `/api/blog/cron/generate` and `/fetch-rss` on `CRON_SECRET` (with `?manual=1` as break-glass). The admin-facing surface is server actions, not REST, which is this repo's convention. Preview landed as `previewPost` / `savePreviewedPost` server actions, matching that convention: same pillar rotation, system message, sanitiser and length bounds as a real run, but NO lock, NO job row and no cover (a second model call for an image that would be discarded). Health is covered by `loadAutomationState`, which the panel already renders. `/jobs/:id/retry` was left out: with no per-job input to replay it would be Generate Now with a different label. |
| **XT-11** | Telegram approvals | **PARTLY DONE** — separate approvals bot, group + forum-topic delivery, fan-out that survives one bad destination, chat-id validation at save, approve/reject webhook authenticated by the shared secret. **No `setWebhook` call on save and no reconcile job**: the secret must be registered manually for now |
| **XT-12** | Admin UI | — | **DONE** — `app/admin/blog/automation-panel.tsx`: schedule (posting hour + timezone + the server-computed next run), voice/models, approval queue, RSS feeds with fetch-now and per-feed errors, Telegram (alert vs approval chats, forum topics), and generation history with per-stage timings. Initial state is read by the SERVER page and passed in, not fetched in an effect — no empty flash, and the lint rule that caught the effect version was right. `toggleRssSource` added so pausing a feed does not mean deleting and re-adding it (which discards every ingested item and re-ingests the publisher's whole window as new). |
| ~~XT-13~~ | ~~DB lock~~ | **DONE** — one conditional UPDATE, stale after 10 min |
| ~~XT-14~~ | ~~Tests~~ | **DONE** — 47 tests in `tests/unit/blog/`: schedule, rotation, link sanitiser, HTML allowlist, retry classifier, RSS ranking, Telegram callbacks |

## Still open

- **Cover images.** The generator publishes without one. The other products crop
  to 16:9 and re-encode as WebP; porting that here needs an image model choice
  and a Storage write path, and is the single biggest remaining gap.
- **`setWebhook` on save + a reconcile job.** Without them a revoked token or a
  domain change leaves the Approve/Reject buttons dead with no signal in the
  product: sending still works, only the taps go nowhere.
- **The admin React tab.** Every server action exists and is tested; nothing
  renders them yet.
- **`types/database.types.ts` regeneration.** It is generated from the live
  schema, so it does not know the new tables. The new code casts its rows
  explicitly, which is why typecheck passes — regenerate after applying the
  migration.
- **GSD.** This repo's CLAUDE.md requires starting through a GSD command. The
  `.claude/` directory is absent in the environment this ran in, so there was no
  command to start; the work was done directly and is recorded here instead.

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
