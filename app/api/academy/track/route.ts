import { NextRequest, NextResponse } from 'next/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { requireServiceClient } from '@/lib/supabase/service'
import { demoGuardResponse } from '@/lib/demo/guard'
import { getLesson, getLessonMarkdown } from '@/lib/academy/catalog'
import { countWords, expectedSeconds } from '@/lib/academy/expected-time'
import { parseStoredRanges, sumRanges } from '@/lib/academy/ranges'
import {
  acceptsVideoGrowth,
  allowedHeartbeat,
  clampDuration,
  clampPct,
  mergeIncomingRanges,
  shouldAutoComplete,
  trackSchema,
} from '@/lib/academy/tracking'

export const dynamic = 'force-dynamic'

/** Postgres / PostgREST codes for "the academy tables are not migrated yet". */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /does not exist|schema cache/i.test(error.message ?? '')
  )
}

/** Same event twice within this window is a retry or a double-fire, not a new event. */
const EVENT_DEDUPE_MS = 3_000

/**
 * POST /api/academy/track
 *
 * Records one lesson heartbeat and/or discrete event for the signed-in user.
 * Everything the client sends is untrusted: ids must belong to a visible course,
 * deltas are clamped (<= 20 s per heartbeat and never faster than wall-clock
 * time), watched ranges are merged server-side, and the row is always keyed by
 * the authenticated user - never by anything in the body.
 *
 * Also accepts `navigator.sendBeacon` posts (text/plain JSON body).
 */
export async function POST(req: NextRequest) {
  const claims = await getAuthClaims()
  const userId = claims?.sub as string | undefined
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const blocked = await demoGuardResponse()
  if (blocked) return blocked

  let body: unknown
  try {
    const text = await req.text()
    if (text.length > 64_000) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
    }
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = trackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const input = parsed.data

  // The lesson must belong to a visible course (also hides unpublished ones).
  const found = await getLesson(input.courseId, input.lessonId)
  if (!found) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const company = await getActiveCompany()
  const svc = requireServiceClient()
  const now = new Date()

  const { data: existing, error: readError } = await svc
    .from('academy_lesson_progress')
    .select(
      'first_opened_at, last_seen_at, active_seconds, video_duration_seconds, video_watched_ranges, video_watched_seconds, max_scroll_pct, completed_at, open_count',
    )
    .eq('user_id', userId)
    .eq('lesson_id', input.lessonId)
    .maybeSingle()

  if (readError) {
    if (isMissingTable(readError)) {
      // Migration not applied yet: tracking is best-effort, never an error for the learner.
      return NextResponse.json({ ok: true, tracked: false })
    }
    console.error('[academy] track read failed:', readError.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  const elapsedMs = existing?.last_seen_at
    ? Math.max(0, now.getTime() - new Date(existing.last_seen_at as string).getTime())
    : null

  const storedRanges = parseStoredRanges(existing?.video_watched_ranges)
  const storedWatched = sumRanges(storedRanges)
  const duration = clampDuration(input.videoDurationSeconds) ?? (existing?.video_duration_seconds as number | null) ?? null

  let ranges = storedRanges
  let watchedSeconds = storedWatched
  if (input.videoRanges) {
    const merged = mergeIncomingRanges(storedRanges, input.videoRanges, duration)
    if (acceptsVideoGrowth(merged.watchedSeconds - storedWatched, elapsedMs)) {
      ranges = merged.ranges
      watchedSeconds = merged.watchedSeconds
    }
  }

  const events: string[] = []
  if (input.event) events.push(input.event)
  // Opening a lesson that was already completed is a "reopen".
  if (input.event === 'lesson_open' && existing?.completed_at) events.push('lesson_reopen')

  const activeSeconds =
    ((existing?.active_seconds as number | undefined) ?? 0) + allowedHeartbeat(input.activeSecondsDelta, elapsedMs)
  const maxScrollPct = Math.max(
    (existing?.max_scroll_pct as number | undefined) ?? 0,
    clampPct(input.maxScrollPct) ?? 0,
  )

  // Auto-completion is re-checked here so a client cannot bypass it. The manual
  // button always completes. Video lessons keep the watched-fraction rule.
  let completeAllowed = input.complete === true
  if (completeAllowed && input.completeSource === 'auto' && !found.lesson.videoUrl) {
    const markdown = await getLessonMarkdown(input.lessonId)
    const expectedReading = expectedSeconds({
      expectedMinutes: found.lesson.expectedMinutes,
      videoDurationSeconds: null,
      bodyWords: countWords(markdown),
    })
    completeAllowed = shouldAutoComplete({
      hasVideo: false,
      watchedFraction: 0,
      scrollPct: maxScrollPct,
      activeSeconds,
      expectedReadingSeconds: expectedReading,
    })
  } else if (completeAllowed && input.completeSource === 'auto') {
    completeAllowed = shouldAutoComplete({
      hasVideo: true,
      watchedFraction: duration ? watchedSeconds / duration : 0,
      scrollPct: maxScrollPct,
      activeSeconds,
      expectedReadingSeconds: 0,
    })
  }

  const justCompleted = completeAllowed && !existing?.completed_at
  if (justCompleted) events.push('lesson_complete')

  const row = {
    user_id: userId,
    lesson_id: input.lessonId,
    company_id: company?.id ?? null,
    course_id: input.courseId,
    first_opened_at: (existing?.first_opened_at as string | undefined) ?? now.toISOString(),
    last_seen_at: now.toISOString(),
    active_seconds: activeSeconds,
    video_duration_seconds: duration,
    video_watched_ranges: ranges,
    video_watched_seconds: watchedSeconds,
    max_scroll_pct: maxScrollPct,
    completed_at: (existing?.completed_at as string | null | undefined) ?? (justCompleted ? now.toISOString() : null),
    open_count: ((existing?.open_count as number | undefined) ?? 0) + (input.event === 'lesson_open' ? 1 : 0),
  }

  const { error: writeError } = await svc
    .from('academy_lesson_progress')
    .upsert(row, { onConflict: 'user_id,lesson_id' })
  if (writeError) {
    if (isMissingTable(writeError)) return NextResponse.json({ ok: true, tracked: false })
    console.error('[academy] track write failed:', writeError.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  for (const type of events) {
    const since = new Date(now.getTime() - EVENT_DEDUPE_MS).toISOString()
    const { data: recent } = await svc
      .from('academy_events')
      .select('id')
      .eq('user_id', userId)
      .eq('lesson_id', input.lessonId)
      .eq('type', type)
      .gte('created_at', since)
      .limit(1)
    if (recent && recent.length > 0) continue

    const payload: Record<string, unknown> = {}
    if (input.videoPositionSeconds != null && Number.isFinite(input.videoPositionSeconds)) {
      payload.position = Math.max(0, Math.round(input.videoPositionSeconds))
    }
    if (type === 'lesson_complete' && input.completeSource) payload.source = input.completeSource

    const { error: eventError } = await svc.from('academy_events').insert({
      user_id: userId,
      company_id: company?.id ?? null,
      course_id: input.courseId,
      lesson_id: input.lessonId,
      type,
      payload,
    })
    if (eventError && !isMissingTable(eventError)) {
      console.error('[academy] event insert failed:', eventError.message)
    }
  }

  return NextResponse.json({
    ok: true,
    tracked: true,
    completed: !!row.completed_at,
    activeSeconds: row.active_seconds,
    watchedSeconds: row.video_watched_seconds,
  })
}
