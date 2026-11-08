import { cookies } from 'next/headers'
import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCatalogForLanguage } from '@/lib/academy/catalog'
import { ACADEMY_UI_LANG_COOKIE, pickRequestedLanguage } from '@/lib/academy/language'
import { getUserProgress, summariseCourse } from '@/lib/academy/progress'
import { PageHeading } from '@/components/app-shell/page-heading'
import { T } from '@/components/i18n/t'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

export const metadata = { title: 'Academy' }

export default async function AcademyPage() {
  const claims = await getAuthClaims()
  const cookieStore = await cookies()
  const requested = pickRequestedLanguage(cookieStore.get(ACADEMY_UI_LANG_COOKIE)?.value)
  const [{ courses }, progress] = await Promise.all([
    getCatalogForLanguage(requested),
    getUserProgress(claims?.sub as string),
  ])

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="space-y-1">
        <PageHeading>
          <T>Academy</T>
        </PageHeading>
        <p className="text-sm text-muted-foreground">
          <T>Short lessons that show you how to get the most out of the app.</T>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {courses.map((course) => {
          const summary = summariseCourse(course, progress)
          const done = summary.nextLessonId === null
          const target = summary.nextLessonId ?? course.lessons[0]?.id
          return (
            <Card key={course.id} variant="glass" className="gap-4 p-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full gradient-brand text-white">
                  <GraduationCap className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 space-y-1">
                  <h2 className="text-lg font-semibold leading-snug">
                    <Link href={`/academy/${course.id}`} className="hover:underline">
                      {course.title}
                    </Link>
                  </h2>
                  {course.description && (
                    <p className="text-sm text-muted-foreground">{course.description}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {summary.total} <T>{summary.total === 1 ? 'lesson' : 'lessons'}</T>
                  </span>
                  <span className="tabular-nums">{summary.percent}%</span>
                </div>
                <Progress value={summary.percent} aria-label="Course progress" />
              </div>

              <Button
                variant={summary.started && !done ? 'primary' : 'outline'}
                asChild
                className="self-start"
              >
                <Link href={target ? `/academy/${course.id}/${target}` : `/academy/${course.id}`}>
                  <T>{done ? 'Review' : summary.started ? 'Continue' : 'Start'}</T>
                </Link>
              </Button>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
