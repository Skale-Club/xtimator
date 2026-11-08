import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requireAdmin } from '@/lib/auth/admin-context'
import { loadAcademyAdminData, loadUserEvents, resolvePeople } from '@/lib/academy/admin-queries'
import { computePersonCourseStats, formatDuration, formatExpectedDuration } from '@/lib/academy/stats'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { T } from '@/components/i18n/t'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '-'
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default async function AdminAcademyPersonPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  await requireAdmin() // load-bearing authz - MUST run before any data read
  const { userId } = await params
  if (!UUID_RE.test(userId)) notFound()

  const [{ courses, rows, expected }, events, people] = await Promise.all([
    loadAcademyAdminData(),
    loadUserEvents(userId),
    resolvePeople([userId]),
  ])
  const person = people.get(userId)
  const userRows = rows.filter((r) => r.userId === userId)
  if (userRows.length === 0 && events.length === 0) notFound()

  const lessonTitles = new Map(courses.flatMap((c) => c.lessons.map((l) => [l.id, l.title] as const)))

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link
          href="/admin/academy"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          <T>Academy</T>
        </Link>
        <h1 className="text-[clamp(24px,3vw,32px)] font-semibold tracking-tight">{person?.email ?? userId}</h1>
        {person?.companyName && <p className="text-muted-foreground">{person.companyName}</p>}
      </div>

      {courses.map((course) => {
        const stats = computePersonCourseStats(course, userRows, expected)
        if (!stats.lessons.some((l) => l.row)) return null
        return (
          <section key={course.id} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium">{course.title}</h2>
              <p className="text-xs text-muted-foreground tabular-nums">
                {stats.percentComplete}% <T>complete</T> · {formatDuration(stats.activeSeconds)} <T>active of</T>{' '}
                {formatExpectedDuration(stats.expectedSeconds)} <T>expected</T>
              </p>
            </div>
            <Card variant="glass" className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium"><T>Lesson</T></th>
                      <th className="text-right px-4 py-3 font-medium"><T>Active time</T></th>
                      <th className="text-right px-4 py-3 font-medium"><T>Expected</T></th>
                      <th className="text-right px-4 py-3 font-medium"><T>Video</T></th>
                      <th className="text-right px-4 py-3 font-medium"><T>Scroll</T></th>
                      <th className="text-left px-4 py-3 font-medium"><T>Completed</T></th>
                      <th className="text-left px-4 py-3 font-medium"><T>Flags</T></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stats.lessons.map(({ lesson, row, expectedSeconds, videoWatchedPercent, tooFast }, i) => (
                      <tr key={lesson.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">
                          {i + 1}. {lesson.title}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row ? formatDuration(row.activeSeconds) : '-'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {formatExpectedDuration(expectedSeconds)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {videoWatchedPercent == null ? '-' : `${videoWatchedPercent}%`}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{row ? `${row.maxScrollPct}%` : '-'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateTime(row?.completedAt ?? null)}</td>
                        <td className="px-4 py-3">
                          {tooFast ? (
                            <Badge variant="warning">
                              <T>Too fast</T>
                            </Badge>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        )
      })}

      <section className="space-y-3">
        <h2 className="text-lg font-medium"><T>Timeline</T></h2>
        <Card variant="glass" className="p-0 overflow-hidden">
          {events.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              <T>No events recorded.</T>
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                  <span className="w-36 shrink-0 tabular-nums text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                  <Badge variant="outline">{e.type}</Badge>
                  <span className="min-w-0 truncate">{lessonTitles.get(e.lessonId) ?? e.lessonId}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  )
}
