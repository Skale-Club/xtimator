import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getAuthClaims } from '@/lib/queries/auth'
import { getLesson, getLessonMarkdown, getVideoAspect } from '@/lib/academy/catalog'
import { countWords, expectedSeconds } from '@/lib/academy/expected-time'
import { getUserProgress } from '@/lib/academy/progress'
import { LessonBody } from '@/components/academy/lesson-body'
import { LessonList } from '@/components/academy/lesson-list'
import { LessonView } from '@/components/academy/lesson-view'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Academy' }

export default async function AcademyLessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>
}) {
  const { courseId, lessonId } = await params
  const found = await getLesson(courseId, lessonId)
  if (!found) notFound()
  const { course, lesson, index } = found

  const claims = await getAuthClaims()
  const [markdown, aspect, progress] = await Promise.all([
    getLessonMarkdown(lesson.id),
    getVideoAspect(lesson),
    getUserProgress(claims?.sub as string),
  ])
  const mine = progress.get(lesson.id)
  const prev = course.lessons[index - 1]
  const next = course.lessons[index + 1]

  return (
    <div className="space-y-4">
      <Link
        href={`/academy/${course.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {course.title}
      </Link>

      {/* key: client tracker state must reset when moving between lessons */}
      <LessonView
        key={lesson.id}
        courseId={course.id}
        lessonId={lesson.id}
        title={lesson.title}
        summary={lesson.summary}
        videoId={lesson.videoId}
        aspect={aspect}
        body={<LessonBody markdown={markdown} />}
        lessonList={
          <div className="pt-2">
            <p className="mb-2 text-xs text-muted-foreground">
              <T>In this course</T>
            </p>
            <LessonList course={course} progress={progress} currentLessonId={lesson.id} heading={false} />
          </div>
        }
        prevHref={prev ? `/academy/${course.id}/${prev.id}` : null}
        nextHref={next ? `/academy/${course.id}/${next.id}` : null}
        initialCompleted={!!mine?.completedAt}
        initialRanges={mine?.videoWatchedRanges ?? []}
        initialDuration={mine?.videoDurationSeconds ?? null}
        initialActiveSeconds={mine?.activeSeconds ?? 0}
        expectedReadingSeconds={expectedSeconds({
          expectedMinutes: lesson.expectedMinutes,
          videoDurationSeconds: null,
          bodyWords: countWords(markdown),
        })}
      />
    </div>
  )
}
