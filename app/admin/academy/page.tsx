import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { requireAdmin } from '@/lib/auth/admin-context'
import { loadAcademyAdminData, resolvePeople } from '@/lib/academy/admin-queries'
import { fixturesEnabled } from '@/lib/academy/catalog'
import {
  computeCourseStats,
  computePersonCourseStats,
  formatDuration,
  formatExpectedDuration,
  type ProgressRow,
} from '@/lib/academy/stats'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { T } from '@/components/i18n/t'
import { EmptyState } from '@/components/dashboard/empty-state'

export const dynamic = 'force-dynamic'

const MAX_PEOPLE = 100

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function AdminAcademyPage() {
  await requireAdmin() // load-bearing authz - MUST run before any data read

  const data = await loadAcademyAdminData()
  const { courses, rows, expected } = data

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Academy</T>
        </h1>
        <p className="text-muted-foreground">
          <T>
            Who is watching which lesson, for how long, versus the expected time. Courses are authored in Notion.
          </T>
        </p>
        {fixturesEnabled() && (
          <Badge variant="warning">
            <T>Dev fixtures active</T>
          </Badge>
        )}
      </div>

      {courses.length === 0 ? (
        <Card variant="glass" className="p-6">
          <EmptyState
            icon={GraduationCap}
            title="No published courses yet"
            description="Publish a course and at least one lesson in Notion for Xtimator, and configure the Notion token under Integrations. Learners see the Academy entry only once a course is visible."
            actionLabel="Open Notion settings"
            actionHref="/admin/integrations/notion"
          />
        </Card>
      ) : (
        <>
          {data.tablesMissing && (
            <Card variant="glass" className="p-4 text-sm text-muted-foreground">
              <T>
                The Academy tracking tables are not in the database yet. Run the pending migration to start recording progress.
              </T>
            </Card>
          )}

          {courses.map((course) => {
            const stats = computeCourseStats(course, rows)
            return (
              <section key={course.id} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-lg font-medium">
                    {course.title}
                    <Badge variant="outline" className="uppercase">{course.language}</Badge>
                  </h2>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {stats.enrolled} <T>enrolled</T> · {stats.completed} <T>completed</T> · {stats.completionPercent}%
                  </p>
                </div>
                <Card variant="glass" className="p-0 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium"><T>Lesson</T></th>
                          <th className="text-right px-4 py-3 font-medium"><T>Opened</T></th>
                          <th className="text-right px-4 py-3 font-medium"><T>Completed</T></th>
                          <th className="text-right px-4 py-3 font-medium"><T>Stopped here</T></th>
                          <th className="text-right px-4 py-3 font-medium"><T>Expected</T></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {stats.lessons.map((l, i) => {
                          const worst = Math.max(...stats.lessons.map((x) => x.stoppedHere))
                          return (
                            <tr key={l.lesson.id} className="hover:bg-muted/20">
                              <td className="px-4 py-3 font-medium">
                                {i + 1}. {l.lesson.title}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">{l.opened}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{l.completed}</td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {l.stoppedHere > 0 && l.stoppedHere === worst ? (
                                  <Badge variant="warning">{l.stoppedHere}</Badge>
                                ) : (
                                  l.stoppedHere
                                )}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                                {formatExpectedDuration(expected.get(l.lesson.id) ?? 0)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </section>
            )
          })}

          <PeopleTable rows={rows} courses={courses} expected={expected} />
        </>
      )}
    </div>
  )
}

async function PeopleTable({
  rows,
  courses,
  expected,
}: {
  rows: ProgressRow[]
  courses: Awaited<ReturnType<typeof loadAcademyAdminData>>['courses']
  expected: Awaited<ReturnType<typeof loadAcademyAdminData>>['expected']
}) {
  const byUser = new Map<string, ProgressRow[]>()
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? []
    list.push(r)
    byUser.set(r.userId, list)
  }
  // rows arrive newest-first, so Map insertion order is "most recently active first".
  const userIds = [...byUser.keys()].slice(0, MAX_PEOPLE)
  const people = await resolvePeople(userIds)

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium"><T>People</T></h2>
        <p className="text-xs text-muted-foreground tabular-nums">
          {byUser.size} <T>people</T>
        </p>
      </div>
      <Card variant="glass" className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium"><T>Person</T></th>
                <th className="text-left px-4 py-3 font-medium"><T>Course</T></th>
                <th className="text-right px-4 py-3 font-medium"><T>Complete</T></th>
                <th className="text-right px-4 py-3 font-medium"><T>Active time</T></th>
                <th className="text-right px-4 py-3 font-medium"><T>Expected</T></th>
                <th className="text-left px-4 py-3 font-medium"><T>Last access</T></th>
                <th className="text-left px-4 py-3 font-medium"><T>Flags</T></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {userIds.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    <T>Nobody has opened a lesson yet.</T>
                  </td>
                </tr>
              ) : (
                userIds.flatMap((userId) => {
                  const userRows = byUser.get(userId) ?? []
                  const person = people.get(userId)
                  return courses
                    .map((course) => ({ course, stats: computePersonCourseStats(course, userRows, expected) }))
                    .filter(({ stats }) => stats.lessons.some((l) => l.row))
                    .map(({ course, stats }) => (
                      <tr key={`${userId}-${course.id}`} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/academy/${userId}`}
                            className="font-medium text-[hsl(var(--primary))] hover:underline"
                          >
                            {person?.email ?? userId}
                          </Link>
                          {person?.companyName && (
                            <div className="text-xs text-muted-foreground">{person.companyName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">{course.title}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{stats.percentComplete}%</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatDuration(stats.activeSeconds)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {formatExpectedDuration(stats.expectedSeconds)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(stats.lastAccess)}</td>
                        <td className="px-4 py-3">
                          {stats.tooFastCount > 0 ? (
                            <Badge variant="warning">
                              <T>Too fast</T> · {stats.tooFastCount}
                            </Badge>
                          ) : null}
                        </td>
                      </tr>
                    ))
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  )
}
