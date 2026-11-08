'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { mergeRanges, recordTick, watchedFraction, type RecorderState, type WatchedRange } from '@/lib/academy/ranges'
import { shouldAutoComplete, type AcademyEventType } from '@/lib/academy/tracking'
import { YT_STATE, type PlayerHandle } from './youtube-player'

const HEARTBEAT_MS = 15_000
const TICK_MS = 1_000
const IDLE_AFTER_MS = 60_000

interface Options {
  courseId: string
  lessonId: string
  hasVideo: boolean
  /** Element whose content is the lesson body (for scroll depth). */
  bodyRef: RefObject<HTMLElement | null>
  initialCompleted: boolean
  initialRanges: WatchedRange[]
  initialDuration: number | null
  /** Active seconds already stored for this lesson (cumulative across visits). */
  initialActiveSeconds: number
  /** Expected reading seconds (Expected minutes, else body words at 200 wpm). */
  expectedReadingSeconds: number
}

interface Payload {
  courseId: string
  lessonId: string
  event?: AcademyEventType
  activeSecondsDelta?: number
  videoDurationSeconds?: number
  videoRanges?: WatchedRange[]
  videoPositionSeconds?: number
  maxScrollPct?: number
  complete?: boolean
  completeSource?: 'manual' | 'auto'
}

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

/**
 * Lesson tracker (spec section 5).
 *  - heartbeat every 15 s ONLY while the tab is visible AND (the user interacted
 *    in the last 60 s OR the video is playing); sends the active-seconds delta;
 *  - video: watched RANGES from real playback ticks (seeking records nothing);
 *  - max scroll depth of the lesson body;
 *  - discrete events lesson_open / video_play / video_ended / lesson_complete.
 * The server re-validates and clamps everything.
 */
export function useLessonTracker(opts: Options) {
  const { courseId, lessonId, hasVideo, bodyRef, expectedReadingSeconds } = opts
  const [completed, setCompleted] = useState(opts.initialCompleted)

  const completedRef = useRef(opts.initialCompleted)
  const activeMsRef = useRef(0)
  const totalActiveMsRef = useRef(opts.initialActiveSeconds * 1000)
  const lastInteractionRef = useRef(Date.now())
  const playingRef = useRef(false)
  const playerRef = useRef<PlayerHandle | null>(null)
  const recorderRef = useRef<RecorderState>({ last: null, ranges: mergeRanges(opts.initialRanges) })
  const durationRef = useRef<number | null>(opts.initialDuration)
  const maxScrollRef = useRef(0)
  const dirtyRef = useRef(false)
  const openedRef = useRef(false)
  const playedRef = useRef(false)
  const inflightCompleteRef = useRef(false)

  const send = useCallback(
    (payload: Omit<Payload, 'courseId' | 'lessonId'>, opts2?: { keepalive?: boolean }) => {
      const body: Payload = { courseId, lessonId, ...payload }
      return fetch('/api/academy/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: opts2?.keepalive ?? false,
      }).catch(() => {
        // Tracking is best-effort; never surface an error to the learner.
      })
    },
    [courseId, lessonId],
  )

  const snapshot = useCallback((): Omit<Payload, 'courseId' | 'lessonId'> => {
    const out: Omit<Payload, 'courseId' | 'lessonId'> = {
      activeSecondsDelta: Math.min(20, Math.round(activeMsRef.current / 1000)),
      maxScrollPct: Math.round(maxScrollRef.current),
    }
    if (hasVideo) {
      out.videoRanges = recorderRef.current.ranges
      if (durationRef.current) out.videoDurationSeconds = Math.round(durationRef.current)
      try {
        const pos = playerRef.current?.getCurrentTime()
        if (pos != null && Number.isFinite(pos)) out.videoPositionSeconds = Math.round(pos)
      } catch {
        // player gone
      }
    }
    return out
  }, [hasVideo])

  /**
   * Send a snapshot (consuming the accumulated active time). Without `force` it
   * is skipped when there is nothing new to report.
   */
  const emit = useCallback(
    (extra: Partial<Omit<Payload, 'courseId' | 'lessonId'>> = {}, keepalive = false, force = false) => {
      const snap = snapshot()
      const delta = snap.activeSecondsDelta ?? 0
      if (!force && delta <= 0 && !dirtyRef.current) return Promise.resolve()
      // Keep the remainder (sub-second, or beyond the 20 s cap) for the next send.
      activeMsRef.current = Math.max(0, activeMsRef.current - delta * 1000)
      dirtyRef.current = false
      return send({ ...snap, ...extra }, { keepalive })
    },
    [send, snapshot],
  )

  const flush = useCallback((keepalive = false) => void emit({}, keepalive), [emit])

  const complete = useCallback(
    (source: 'manual' | 'auto') => {
      if (completedRef.current || inflightCompleteRef.current) return
      inflightCompleteRef.current = true
      completedRef.current = true
      setCompleted(true)
      void emit({ complete: true, completeSource: source }, false, true).finally(() => {
        inflightCompleteRef.current = false
      })
    },
    [emit],
  )

  const maybeAutoComplete = useCallback(() => {
    if (completedRef.current) return
    const fraction = watchedFraction(recorderRef.current.ranges, durationRef.current)
    if (
      shouldAutoComplete({
        hasVideo,
        watchedFraction: fraction,
        scrollPct: maxScrollRef.current,
        activeSeconds: totalActiveMsRef.current / 1000,
        expectedReadingSeconds,
      })
    ) {
      complete('auto')
    }
  }, [complete, hasVideo, expectedReadingSeconds])

  // lesson_open once per mounted lesson.
  useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    void emit({ event: 'lesson_open' }, false, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount
  }, [])

  // Interaction tracking (any input counts as "the user is here").
  useEffect(() => {
    const mark = () => {
      lastInteractionRef.current = Date.now()
    }
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll', 'mousemove']
    for (const e of events) window.addEventListener(e, mark, { passive: true, capture: true })
    return () => {
      for (const e of events) window.removeEventListener(e, mark, { capture: true })
    }
  }, [])

  // 1 s tick: accumulate active time + record video playback.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()
      const visible = document.visibilityState === 'visible'
      const active = visible && (now - lastInteractionRef.current < IDLE_AFTER_MS || playingRef.current)
      if (active) {
        activeMsRef.current += TICK_MS
        totalActiveMsRef.current += TICK_MS
      }
      // Text-only lessons: elapsed time is usually the last condition met, so check every tick.
      if (!hasVideo) maybeAutoComplete()

      if (hasVideo && playingRef.current && playerRef.current) {
        try {
          const before = recorderRef.current.ranges
          recorderRef.current = recordTick(recorderRef.current, playerRef.current.getCurrentTime())
          if (recorderRef.current.ranges !== before) dirtyRef.current = true
          const duration = playerRef.current.getDuration()
          if (duration > 0) durationRef.current = duration
        } catch {
          // player gone
        }
        maybeAutoComplete()
      }
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [hasVideo, maybeAutoComplete])

  // 15 s heartbeat.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible' && !playingRef.current) return
      flush()
    }, HEARTBEAT_MS)
    return () => window.clearInterval(id)
  }, [flush])

  // Flush when the tab is hidden / the page is left / the lesson unmounts.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush(true)
    }
    const onPageHide = () => flush(true)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      flush(true)
    }
  }, [flush])

  // Scroll depth of the lesson body.
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const scroller = scrollParent(body)
    let raf = 0

    const measure = () => {
      raf = 0
      const rect = body.getBoundingClientRect()
      if (rect.height <= 0) return
      const viewportBottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight
      const seen = Math.min(rect.height, Math.max(0, viewportBottom - rect.top))
      const pct = (seen / rect.height) * 100
      if (pct > maxScrollRef.current) {
        maxScrollRef.current = pct
        dirtyRef.current = true
        if (!hasVideo) maybeAutoComplete()
      }
    }
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(measure)
    }

    const target: HTMLElement | Window = scroller ?? window
    target.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      target.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [bodyRef, hasVideo, maybeAutoComplete])

  const onPlayerReady = useCallback((handle: PlayerHandle) => {
    playerRef.current = handle
    try {
      const duration = handle.getDuration()
      if (duration > 0) durationRef.current = duration
    } catch {
      // not ready yet
    }
  }, [])

  const onPlayerState = useCallback(
    (state: number) => {
      const playing = state === YT_STATE.PLAYING
      playingRef.current = playing
      const handle = playerRef.current

      if (playing) {
        // Start the recorder fresh so a seek made while paused is not counted.
        recorderRef.current = { ...recorderRef.current, last: null }
        try {
          if (handle) {
            const duration = handle.getDuration()
            if (duration > 0) durationRef.current = duration
          }
        } catch {
          // ignore
        }
        if (!playedRef.current) {
          playedRef.current = true
          void emit({ event: 'video_play' }, false, true)
        }
        return
      }

      // Pause / end / buffering: take one last tick so the tail is not lost.
      if (handle) {
        try {
          const before = recorderRef.current.ranges
          recorderRef.current = recordTick(recorderRef.current, handle.getCurrentTime())
          if (recorderRef.current.ranges !== before) dirtyRef.current = true
        } catch {
          // ignore
        }
      }
      if (state === YT_STATE.ENDED) {
        void emit({ event: 'video_ended' }, false, true)
        maybeAutoComplete()
      } else if (state === YT_STATE.PAUSED) {
        flush()
        maybeAutoComplete()
      }
    },
    [emit, flush, maybeAutoComplete],
  )

  return { completed, complete, onPlayerReady, onPlayerState }
}
