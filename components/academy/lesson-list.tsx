import Link from 'next/link'
import { CheckCircle2, Circle, PlayCircle } from 'lucide-react'
import { T } from '@/components/i18n/t'
import { cn } from '@/lib/utils'
import type { AcademyCourse } from '@/lib/academy/types'
import type { LessonProgress } from '@/lib/academy/progress'

/** Lessons of one course with completion checkmarks. Server component. */
export function LessonList({
  course,
  progress,
  currentLessonId,
  heading = true,
}: {
  course: AcademyCourse
  progress: Map<string, LessonProgress>
  currentLessonId?: string
  heading?: boolean
}) {
  return (
    <section aria-label="Lessons" className="space-y-3">
      {heading && (
        <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          <T>Lessons</T>
        </h2>
      )}
      <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card/40">
        {course.lessons.map((lesson, index) => {
          const done = !!progress.get(lesson.id)?.completedAt
          const current = lesson.id === currentLessonId
          return (
            <li key={lesson.id}>
              <Link
                href={`/academy/${course.id}/${lesson.id}`}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50',
                  current && 'bg-muted/60',
                )}
              >
                {done ? (
                  <CheckCircle2 className="size-5 shrink-0 text-[hsl(var(--success))]" aria-label="Completed" />
                ) : current ? (
                  <PlayCircle className="size-5 shrink-0 text-primary" aria-hidden />
                ) : (
                  <Circle className="size-5 shrink-0 text-muted-foreground/60" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {index + 1}. {lesson.title}
                  </span>
                  {lesson.summary && (
                    <span className="block truncate text-xs text-muted-foreground">{lesson.summary}</span>
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
