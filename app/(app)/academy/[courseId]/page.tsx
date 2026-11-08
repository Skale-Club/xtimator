import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCourse } from '@/lib/academy/catalog'
import { getUserProgress, summariseCourse } from '@/lib/academy/progress'
import { LessonList } from '@/components/academy/lesson-list'
import { T } from '@/components/i18n/t'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

export const metadata = { title: 'Academy' }

export default async function AcademyCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  const course = await getCourse(courseId)
  if (!course) notFound()

  const claims = await getAuthClaims()
  const progress = await getUserProgress(claims?.sub as string)
  const summary = summariseCourse(course, progress)
  const target = summary.nextLessonId ?? course.lessons[0]?.id

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link
        href="/academy"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        <T>Academy</T>
      </Link>

      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{course.title}</h1>
        {course.description && <p className="text-muted-foreground">{course.description}</p>}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular-nums">
              {summary.completed}/{summary.total} <T>completed</T>
            </span>
            <span className="tabular-nums">{summary.percent}%</span>
          </div>
          <Progress value={summary.percent} aria-label="Course progress" />
        </div>
        {target && (
          <Button variant="primary" asChild>
            <Link href={`/academy/${course.id}/${target}`}>
              <T>{summary.nextLessonId === null ? 'Review' : summary.started ? 'Continue' : 'Start'}</T>
            </Link>
          </Button>
        )}
      </header>

      <LessonList course={course} progress={progress} />
    </div>
  )
}
