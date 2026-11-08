import { z } from 'zod'
import { clampRanges, sumRanges, type WatchedRange } from './ranges'

/** A heartbeat may add at most this many active seconds (client sends every 15 s). */
export const MAX_HEARTBEAT_SECONDS = 20
export const MAX_VIDEO_SECONDS = 6 * 60 * 60

export const EVENT_TYPES = [
  'lesson_open',
  'video_play',
  'video_ended',
  'lesson_complete',
  'lesson_reopen',
] as const
export type AcademyEventType = (typeof EVENT_TYPES)[number]

const idSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9-]+$/)

const rangeSchema = z.tuple([z.number().finite(), z.number().finite()])

export const trackSchema = z.object({
  courseId: idSchema,
  lessonId: idSchema,
  /** Discrete event to append to the timeline (optional). */
  event: z.enum(EVENT_TYPES).optional(),
  /** Active seconds since the previous heartbeat. Clamped server-side. */
  activeSecondsDelta: z.number().finite().optional(),
  videoDurationSeconds: z.number().finite().optional(),
  /** Full set of watched ranges as the client knows them (merged server-side). */
  videoRanges: z.array(rangeSchema).max(400).optional(),
  videoPositionSeconds: z.number().finite().optional(),
  maxScrollPct: z.number().finite().optional(),
  /** Explicit completion request (button or auto-complete). */
  complete: z.boolean().optional(),
  completeSource: z.enum(['manual', 'auto']).optional(),
})
export type TrackInput = z.infer<typeof trackSchema>

export function clampHeartbeat(delta: number | undefined): number {
  if (delta == null || !Number.isFinite(delta)) return 0
  return Math.min(MAX_HEARTBEAT_SECONDS, Math.max(0, Math.round(delta)))
}

export function clampPct(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function clampDuration(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return Math.min(MAX_VIDEO_SECONDS, Math.round(value))
}

/** Merge client ranges into the stored ones, clamped to the known duration. */
export function mergeIncomingRanges(
  stored: WatchedRange[],
  incoming: ReadonlyArray<readonly [number, number]> | undefined,
  durationSeconds: number | null,
): { ranges: WatchedRange[]; watchedSeconds: number } {
  const ranges = clampRanges([...stored, ...(incoming ?? [])], durationSeconds)
  return { ranges, watchedSeconds: sumRanges(ranges) }
}

/** Minimum active seconds on a text-only lesson before it may auto-complete. */
export const MIN_TEXT_ACTIVE_SECONDS = 15

/** Active seconds required to auto-complete a text-only lesson: max(15, 50% of expected reading time). */
export function requiredTextActiveSeconds(expectedReadingSeconds: number): number {
  return Math.max(MIN_TEXT_ACTIVE_SECONDS, Math.max(0, expectedReadingSeconds) * 0.5)
}

/**
 * Auto-complete rule.
 *  - With video: >=90% of the video actually watched.
 *  - Text only: scrolled >=95% AND active seconds >= max(15, 50% of the expected
 *    reading seconds), so a short lesson that fits on screen is not completed
 *    the instant it opens.
 */
export function shouldAutoComplete(input: {
  hasVideo: boolean
  watchedFraction: number
  scrollPct: number
  activeSeconds: number
  expectedReadingSeconds: number
}): boolean {
  if (input.hasVideo) return input.watchedFraction >= 0.9
  return (
    input.scrollPct >= 95 && input.activeSeconds >= requiredTextActiveSeconds(input.expectedReadingSeconds)
  )
}

/**
 * Active seconds a heartbeat may add: the client-reported delta, capped at
 * MAX_HEARTBEAT_SECONDS and also at the wall-clock time since the row was last
 * seen (+2 s of slack), so a hostile client cannot inflate time by spamming
 * heartbeats faster than real time passes.
 */
export function allowedHeartbeat(delta: number | undefined, elapsedMs: number | null): number {
  const clamped = clampHeartbeat(delta)
  if (clamped === 0 || elapsedMs == null) return clamped
  const wallClockCap = Math.max(0, Math.ceil(elapsedMs / 1000)) + 2
  return Math.min(clamped, wallClockCap)
}

/**
 * Video growth guard: watched seconds can only grow as fast as real time passes
 * (allowing 2x playback + slack). A legitimate client never trips this because
 * its ranges are sent incrementally; a forged "I watched everything" is ignored.
 */
export function acceptsVideoGrowth(growthSeconds: number, elapsedMs: number | null): boolean {
  if (growthSeconds <= 0) return true
  if (elapsedMs == null) return growthSeconds <= MAX_HEARTBEAT_SECONDS * 2
  const cap = Math.ceil(Math.max(0, elapsedMs) / 1000) * 2 + MAX_HEARTBEAT_SECONDS
  return growthSeconds <= cap
}
