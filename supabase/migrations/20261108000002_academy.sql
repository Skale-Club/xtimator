-- Academy: in-app courses (content lives in Notion, only progress lives here).
--
-- Idempotent: every statement is safe to re-run. NOT applied by the deploy;
-- run it by hand (`npm run db:migrate`) BEFORE the code that writes to it is
-- relied upon. The Academy entry point stays hidden until a Notion course is
-- published, and the tracking route degrades to a no-op when these tables are
-- missing, so applying it late never breaks the app.
--
-- academy_lesson_progress
--   One row per (user, lesson): the current state of that person's progress.
--   Heartbeats update this row only (they are NOT stored as events).
--   course_id / lesson_id are Notion page ids (text). They are never FKs and no
--   Notion URL is ever persisted here (pre-signed URLs expire).
--
-- academy_events
--   Append-only timeline of discrete events: lesson_open, video_play,
--   video_ended, lesson_complete, lesson_reopen. Quizzes will later add an
--   academy_quiz_attempts table; nothing here blocks that.
--
-- Access: users read their OWN rows; every write goes through the tracking API
-- route (service role), which validates ownership and clamps values. The super
-- admin dashboard reads everything through the service role as well.

CREATE TABLE IF NOT EXISTS public.academy_lesson_progress (
  user_id                uuid        NOT NULL REFERENCES public.xtimator_accounts(id) ON DELETE CASCADE,
  lesson_id              text        NOT NULL,
  company_id             uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  course_id              text        NOT NULL,
  first_opened_at        timestamptz NOT NULL DEFAULT now(),
  last_seen_at           timestamptz NOT NULL DEFAULT now(),
  active_seconds         integer     NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
  video_duration_seconds integer     CHECK (video_duration_seconds IS NULL OR video_duration_seconds >= 0),
  video_watched_ranges   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  video_watched_seconds  integer     NOT NULL DEFAULT 0 CHECK (video_watched_seconds >= 0),
  max_scroll_pct         integer     NOT NULL DEFAULT 0 CHECK (max_scroll_pct BETWEEN 0 AND 100),
  completed_at           timestamptz,
  open_count             integer     NOT NULL DEFAULT 0 CHECK (open_count >= 0),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS academy_lesson_progress_course_idx
  ON public.academy_lesson_progress (course_id);
CREATE INDEX IF NOT EXISTS academy_lesson_progress_lesson_idx
  ON public.academy_lesson_progress (lesson_id);
CREATE INDEX IF NOT EXISTS academy_lesson_progress_last_seen_idx
  ON public.academy_lesson_progress (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.academy_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.xtimator_accounts(id) ON DELETE CASCADE,
  company_id  uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  course_id   text        NOT NULL,
  lesson_id   text        NOT NULL,
  type        text        NOT NULL
              CHECK (type IN ('lesson_open', 'video_play', 'video_ended', 'lesson_complete', 'lesson_reopen')),
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS academy_events_user_created_idx
  ON public.academy_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS academy_events_course_idx
  ON public.academy_events (course_id);

-- RLS: own-row reads for authenticated users; no client write path at all.
ALTER TABLE public.academy_lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.academy_lesson_progress FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.academy_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academy_lesson_progress TO authenticated;
GRANT SELECT ON public.academy_events TO authenticated;
GRANT ALL ON public.academy_lesson_progress TO service_role;
GRANT ALL ON public.academy_events TO service_role;

DROP POLICY IF EXISTS academy_lesson_progress_select_own ON public.academy_lesson_progress;
CREATE POLICY academy_lesson_progress_select_own ON public.academy_lesson_progress
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS academy_events_select_own ON public.academy_events;
CREATE POLICY academy_events_select_own ON public.academy_events
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMENT ON TABLE public.academy_lesson_progress IS
  'Academy: per-user, per-lesson progress (active time, watched video ranges, scroll depth, completion). Written by the tracking API route only.';
COMMENT ON TABLE public.academy_events IS
  'Academy: append-only timeline of discrete lesson events. Heartbeats are not stored here.';

NOTIFY pgrst, 'reload schema';
