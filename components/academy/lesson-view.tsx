'use client'

import Link from 'next/link'
import { useRef, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'
import { ASPECT_RATIO_CSS, type Aspect } from '@/lib/academy/video'
import type { WatchedRange } from '@/lib/academy/ranges'
import { YouTubePlayer } from './youtube-player'
import { useLessonTracker } from './use-lesson-tracker'

const RATIO_NUMBER: Record<Aspect, number> = {
  vertical: 9 / 16,
  horizontal: 16 / 9,
  square: 1,
}

interface LessonViewProps {
  courseId: string
  lessonId: string
  title: string
  summary: string
  videoId: string | null
  aspect: Aspect
  /** Server-rendered Notion body. */
  body: ReactNode
  /** Server-rendered "in this course" list. */
  lessonList: ReactNode
  prevHref: string | null
  nextHref: string | null
  initialCompleted: boolean
  initialRanges: WatchedRange[]
  initialDuration: number | null
  initialActiveSeconds: number
  expectedReadingSeconds: number
}

/**
 * The lesson screen. Layout rules (spec section 4):
 *  - phone: video full width with height capped at ~70vh so the title stays
 *    visible; text and "Mark as complete" below;
 *  - desktop, vertical/square video: two columns (video left at viewport
 *    height, text + lesson list right);
 *  - desktop, horizontal video: video on top at full content width, text below.
 * The video box size is reserved with CSS aspect-ratio before the player loads,
 * so nothing jumps.
 */
export function LessonView(props: LessonViewProps) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  const hasVideo = !!props.videoId
  const { completed, complete, onPlayerReady, onPlayerState } = useLessonTracker({
    courseId: props.courseId,
    lessonId: props.lessonId,
    hasVideo,
    bodyRef,
    initialCompleted: props.initialCompleted,
    initialRanges: props.initialRanges,
    initialDuration: props.initialDuration,
    initialActiveSeconds: props.initialActiveSeconds,
    expectedReadingSeconds: props.expectedReadingSeconds,
  })

  const horizontal = props.aspect === 'horizontal'
  const sideBySide = hasVideo && !horizontal

  const videoBoxStyle: CSSProperties & Record<string, string | number> = {
    aspectRatio: ASPECT_RATIO_CSS[props.aspect],
    '--ratio': RATIO_NUMBER[props.aspect],
  }

  const video = hasVideo && props.videoId && (
    <div
      className={cn(
        'relative mx-auto overflow-hidden rounded-xl border border-border bg-black',
        horizontal
          ? 'w-full'
          : // Width follows the height cap so the box keeps its ratio: ~70vh on
            // phones, nearly the full viewport height beside the text on desktop.
            '[--cap:70svh] w-[min(100%,calc(var(--cap)*var(--ratio)))] lg:[--cap:calc(100svh-8rem)] lg:w-[calc(var(--cap)*var(--ratio))]',
        sideBySide && 'lg:sticky lg:top-4 lg:mx-0',
      )}
      style={videoBoxStyle}
    >
      <YouTubePlayer videoId={props.videoId} onReady={onPlayerReady} onStateChange={onPlayerState} />
    </div>
  )

  const text = (
    <div className="min-w-0 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{props.title}</h1>
        {props.summary && <p className="text-muted-foreground">{props.summary}</p>}
      </header>

      <div ref={bodyRef}>{props.body}</div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        {completed ? (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-[hsl(var(--success))]">
            <CheckCircle2 className="size-5" aria-hidden />
            {t('Completed')}
          </span>
        ) : (
          <Button variant="primary" onClick={() => complete('manual')}>
            <CheckCircle2 aria-hidden />
            {t('Mark as complete')}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {props.prevHref && (
            <Button variant="outline" asChild>
              <Link href={props.prevHref}>
                <ArrowLeft aria-hidden />
                {t('Previous')}
              </Link>
            </Button>
          )}
          {props.nextHref && (
            <Button variant={completed ? 'primary' : 'outline'} asChild>
              <Link href={props.nextHref}>
                {t('Next')}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {props.lessonList}
    </div>
  )

  if (!hasVideo) {
    return <div className="mx-auto w-full max-w-3xl">{text}</div>
  }

  if (horizontal) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {video}
        <div className="mx-auto w-full max-w-3xl">{text}</div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start lg:gap-10 lg:space-y-0">
      {video}
      {text}
    </div>
  )
}
