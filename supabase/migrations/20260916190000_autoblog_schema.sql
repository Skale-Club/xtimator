-- Auto-blog parity XT-02, XT-03, XT-04 — the schema the automated blog needs.
-- See .planning/initiatives/autoblog-parity/MASTER.md §3.
--
-- Xtimator is a SINGLE SITE, so every table here drops the tenant_id the
-- multi-tenant products carry, and the super-admin gate does not apply
-- (MASTER D-10). The AI key is the platform's existing integration credential,
-- not a per-tenant one (D-05), which is why blog_settings has text_model and
-- image_model but no api key column: there is exactly one key and it already
-- lives where every other AI feature reads it from.
--
-- RLS is enabled with no policy on every operational table. Nothing public
-- reads them and the server goes through the service-role client, so an empty
-- policy set denies anon and authenticated outright while the service role
-- continues to bypass it. blog_posts keeps its existing public-read policy for
-- published rows.

-- ── blog_posts: the columns an automated post needs (XT-02) ─────────────────
--
-- cover_image_url already exists and is what the contract calls the feature
-- image; adding a second column for the same thing would only create a question
-- about which one the page renders.

alter table public.blog_posts
  add column if not exists tags text,
  add column if not exists author_name text,
  add column if not exists focus_keyword text,
  add column if not exists reading_time_minutes integer,
  -- Distinguishes a generated draft from one a human wrote, which is what the
  -- approval queue filters on. Existing rows are all human-written.
  add column if not exists ai_generated boolean not null default false;

create index if not exists blog_posts_status_ai_idx
  on public.blog_posts (status, ai_generated);

-- ── blog_settings (XT-03) ──────────────────────────────────────────────────
--
-- One row. The id is pinned to 1 by the unique constraint below so an upsert
-- can never quietly create a second configuration that nothing reads.

create table if not exists public.blog_settings (
  id                    integer primary key default 1,
  enabled               boolean not null default false,
  posts_per_day         integer not null default 1,
  -- Anchor hour 0-23 in the timezone below. NULL keeps a drifting cadence,
  -- which is the behaviour every other product started from.
  posting_hour          integer,
  timezone              text not null default 'America/New_York',
  last_run_at           timestamptz,
  -- The generation lock (XT-13). In the DATABASE, not in process memory: Next.js
  -- runs multiple instances, and both the Inngest sweep and the HTTP break-glass
  -- endpoint can fire at once. Stale after ten minutes so a crashed run frees
  -- itself.
  lock_acquired_at      timestamptz,
  seo_keywords          text not null default '',
  prompt_style          text not null default '',
  system_prompt         text not null default '',
  enable_trend_analysis boolean not null default true,
  rss_enabled           boolean not null default false,
  -- false (the default) queues every generated post as a draft for approval.
  auto_publish          boolean not null default false,
  text_model            text not null default '',
  image_model           text not null default '',
  updated_at            timestamptz not null default now(),
  constraint blog_settings_singleton check (id = 1),
  constraint blog_settings_posting_hour_range
    check (posting_hour is null or (posting_hour >= 0 and posting_hour <= 23)),
  constraint blog_settings_posts_per_day_range
    check (posts_per_day >= 0 and posts_per_day <= 24)
);

alter table public.blog_settings enable row level security;

-- ── blog_generation_jobs (XT-03) ───────────────────────────────────────────

create table if not exists public.blog_generation_jobs (
  id            uuid primary key default gen_random_uuid(),
  -- NULL until the post exists: the job row is created BEFORE generation runs.
  post_id       uuid references public.blog_posts(id) on delete set null,
  status        text not null default 'pending',
  trigger       text,
  source        text,
  rss_item_id   uuid,
  pillar_id     text,
  topic         text,
  model         text,
  error_message text,
  -- {topic, content, image, upload, total}; image is null when that stage was
  -- skipped, which is not the same as an image that took 0ms.
  durations_ms  jsonb,
  attempts      integer not null default 1,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint blog_generation_jobs_status_check
    check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  constraint blog_generation_jobs_trigger_check
    check (trigger is null or trigger in ('cron', 'manual', 'telegram')),
  constraint blog_generation_jobs_source_check
    check (source is null or source in ('pillar', 'rss', 'manual'))
);

create index if not exists blog_generation_jobs_created_idx
  on public.blog_generation_jobs (created_at desc);

create index if not exists blog_generation_jobs_status_idx
  on public.blog_generation_jobs (status);

alter table public.blog_generation_jobs enable row level security;

-- ── blog_post_feedback (XT-03) ─────────────────────────────────────────────
--
-- The approve/reject signal that feeds the next generation's prompt. Title and
-- excerpt are snapshots so the signal survives a rejected post being deleted.

create table if not exists public.blog_post_feedback (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid references public.blog_posts(id) on delete set null,
  post_title   text not null,
  post_excerpt text,
  source_title text,
  verdict      text not null,
  reason       text,
  decided_by   text not null default 'admin',
  created_at   timestamptz not null default now(),
  constraint blog_post_feedback_verdict_check
    check (verdict in ('approved', 'rejected')),
  constraint blog_post_feedback_decided_by_check
    check (decided_by in ('admin', 'telegram'))
);

create index if not exists blog_post_feedback_created_idx
  on public.blog_post_feedback (created_at desc);

alter table public.blog_post_feedback enable row level security;

-- ── RSS as an optional topic source (XT-03) ────────────────────────────────

create table if not exists public.blog_rss_sources (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  url                 text not null,
  enabled             boolean not null default true,
  last_fetched_at     timestamptz,
  -- 'ok' | 'error'. A failing feed is recorded and skipped, never auto-disabled:
  -- a publisher's hour of downtime must not silently unsubscribe us.
  last_fetched_status text,
  error_message       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.blog_rss_sources enable row level security;

create table if not exists public.blog_rss_items (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references public.blog_rss_sources(id) on delete cascade,
  -- Feed <guid>/<id>, else the link, else a deterministic hash. The unique
  -- index below IS the de-duplication strategy, which is why the fetcher needs
  -- no lock of its own.
  guid         text not null,
  url          text not null,
  title        text not null,
  summary      text,
  published_at timestamptz,
  status       text not null default 'pending',
  -- Set only AFTER the post insert succeeds, so a failed run leaves the item
  -- available to the next one.
  used_at      timestamptz,
  used_post_id uuid,
  skip_reason  text,
  created_at   timestamptz not null default now(),
  constraint blog_rss_items_status_check
    check (status in ('pending', 'used', 'skipped'))
);

create unique index if not exists blog_rss_items_source_guid_uniq
  on public.blog_rss_items (source_id, guid);

create index if not exists blog_rss_items_status_idx
  on public.blog_rss_items (status, published_at desc);

alter table public.blog_rss_items enable row level security;

-- ── ai_generation_logs (XT-03) ─────────────────────────────────────────────
--
-- Per-call cost ledger. Every column but step/provider/model/status is nullable:
-- an image model that reports no token counts is normal, not an error, and a row
-- that will not write must never be able to fail a generation.

create table if not exists public.ai_generation_logs (
  id            uuid primary key default gen_random_uuid(),
  step          text not null,
  provider      text not null,
  model         text not null,
  -- Truncated at write time: a cost ledger, not an archive of every prompt.
  prompt        text,
  input_tokens  integer,
  output_tokens integer,
  cost_usd      numeric(10, 4),
  status        text not null,
  error         text,
  duration_ms   integer,
  created_at    timestamptz not null default now(),
  -- 'skipped' is not 'failure': a model that charges for the call and returns
  -- no image succeeded at the API level. Conflating them makes the failure rate
  -- in this table meaningless.
  constraint ai_generation_logs_status_check
    check (status in ('success', 'failure', 'skipped'))
);

create index if not exists ai_generation_logs_created_idx
  on public.ai_generation_logs (created_at desc);

alter table public.ai_generation_logs enable row level security;

-- ── telegram_settings (XT-04) ──────────────────────────────────────────────
--
-- This site already sends platform alerts to a single Telegram chat, configured
-- through the integrations panel. This table is the full settings row the parity
-- contract expects, with destinations as an ARRAY so a group and an owner's
-- private chat can both receive drafts.
--
-- An entry is a chat id, optionally with a forum-topic thread:
-- "-1001234567890" or "-1001234567890:42" (MASTER §6). A supergroup with forum
-- topics enabled refuses a message carrying no message_thread_id when its
-- General topic is closed, and files it in the wrong topic otherwise.

create table if not exists public.telegram_settings (
  id                 integer primary key default 1,
  enabled            boolean not null default false,
  bot_token          text,
  chat_ids           text[] not null default array[]::text[],
  -- Blog approval cards ride a SEPARATE bot, so the one carrying a public
  -- webhook is not the one sending alerts: it can be revoked on its own, and a
  -- leaked webhook secret buys nothing on the alert channel. NULL falls back to
  -- bot_token.
  approvals_enabled  boolean not null default false,
  approvals_bot_token text,
  -- Empty falls back to chat_ids. Kept separate because chat_ids is the alert
  -- list: an editor added there to receive drafts would also get every alert.
  approvals_chat_ids text[] not null default array[]::text[],
  -- Echoed by Telegram in X-Telegram-Bot-Api-Secret-Token on every webhook call.
  -- The webhook is a PUBLIC endpoint, so this is what proves the request came
  -- from Telegram: a chat_id in the body is attacker-controlled and proves
  -- nothing on its own.
  webhook_secret     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint telegram_settings_singleton check (id = 1)
);

alter table public.telegram_settings enable row level security;
