'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FilePlus2,
  Flame,
  Globe,
  MailOpen,
  Mail,
  Monitor,
  MousePointerClick,
  Pencil,
  PenLine,
  Phone,
  Printer,
  RotateCcw,
  Send,
  Smartphone,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  INTEREST_REASON_LABELS,
  type AnalyticsTimelineEntry,
  type EstimateAnalytics,
  type InterestLevel,
} from '@/lib/estimate/analytics/contracts'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import {
  clockTime,
  dayKey,
  dayLabel,
  exactDateTime,
  fill,
  formatDuration,
  relativeAgo,
  sectionLabel,
  type TFn,
} from './format'

const TIMELINE_PREVIEW = 12
const MOST_READ_ITEMS = 5

// ---------------------------------------------------------------------------
// Summary sentence
// ---------------------------------------------------------------------------

/**
 * "Opened 17 times by 2 people. Last visit 12 days ago, read to the end, most
 * time on Totals." Built from translated templates with the numbers filled in
 * afterwards, so word order can differ per language.
 */
export function buildSummarySentence(analytics: EstimateAnalytics, t: TFn, now: Date = new Date()): string {
  const s = analytics.summary
  if (s.opens === 0) return t('Not opened yet')

  const first = [s.opens === 1 ? t('Opened once') : fill(t('Opened {n} times'), { n: s.opens })]
  if (s.uniqueVisitors > 1) first.push(fill(t('by {n} people'), { n: s.uniqueVisitors }))

  const second: string[] = []
  if (s.lastViewedAt) second.push(fill(t('Last visit {when}'), { when: relativeAgo(s.lastViewedAt, t, now) }))
  if (s.readToEndVisits > 0) second.push(t('read to the end'))
  const top = topSection(s.sectionDwell)
  if (top) second.push(fill(t('most time on {section}'), { section: sectionLabel(top, t) }))

  const sentences = [`${first.join(' ')}.`]
  if (second.length) sentences.push(`${second.join(', ')}.`)
  return sentences.join(' ')
}

function topSection(dwell: Record<string, number>): string | null {
  let best: string | null = null
  let seconds = 0
  for (const [target, value] of Object.entries(dwell)) {
    if (value > seconds) {
      best = target
      seconds = value
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Skeleton + states
// ---------------------------------------------------------------------------

export function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" data-testid="analytics-skeleton">
      <Skeleton className="h-28 w-full rounded-[var(--radius-lg)]" />
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[92px] rounded-[var(--radius-lg)]" />
        ))}
      </div>
      <Skeleton className="h-5 w-32" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AnalyticsError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <Card className="items-center gap-3 px-5 py-8 text-center" role="alert">
      <p className="text-sm text-muted-foreground">{t('Could not load the analytics.')}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {t('Try again')}
      </Button>
    </Card>
  )
}

function EmptyState() {
  const { t } = useTranslation()
  return (
    <Card className="items-center gap-3 px-6 py-10 text-center" data-testid="analytics-empty">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <MailOpen className="size-6" aria-hidden />
      </span>
      <h3 className="text-base font-semibold">{t('Not opened yet')}</h3>
      <p className="max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
        {t(
          'When your client opens the link, you will see here when they opened it, how long they read, on which device, and what they did next.',
        )}
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

const LEVEL_COPY: Record<Exclude<InterestLevel, 'none'>, { label: string; hint: string }> = {
  hot: { label: 'Hot', hint: 'Strong signals. A good moment to follow up.' },
  warm: { label: 'Warm', hint: 'Some interest. A short nudge could help.' },
  cold: { label: 'Cold', hint: 'It has gone quiet. A friendly check-in could help.' },
}

export function InterestBadge({ level }: { level: Exclude<InterestLevel, 'none'> }) {
  const { t } = useTranslation()
  const label = t(LEVEL_COPY[level].label)
  if (level === 'hot') {
    return (
      <Badge variant="danger" className="gap-1 px-3 py-1 text-[13px]">
        <Flame aria-hidden />
        {label}
      </Badge>
    )
  }
  if (level === 'warm') {
    return (
      <Badge variant="warning" className="px-3 py-1 text-[13px]">
        {label}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="px-3 py-1 text-[13px] text-muted-foreground">
      {label}
    </Badge>
  )
}

function SummaryCard({ analytics }: { analytics: EstimateAnalytics }) {
  const { t } = useTranslation()
  const sentence = useMemo(() => buildSummarySentence(analytics, t), [analytics, t])
  const level = analytics.interest.level
  const reasons = analytics.interest.reasons.slice(0, 3)

  return (
    <Card className="gap-3 p-4" data-testid="analytics-summary">
      <p className="text-[15px] leading-relaxed text-foreground">{sentence}</p>
      {level !== 'none' && (
        <div className="flex flex-col gap-2.5 border-t border-border/60 pt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('Interest')}</span>
            <InterestBadge level={level} />
            <span className="min-w-0 text-xs text-muted-foreground">{t(LEVEL_COPY[level].hint)}</span>
          </div>
          {reasons.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label={t('Why')}>
              {reasons.map((reason) => (
                <li
                  key={reason}
                  className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                >
                  {t(INTEREST_REASON_LABELS[reason])}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// KPI tiles
// ---------------------------------------------------------------------------

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
}) {
  return (
    <Card className="min-w-0 gap-1 p-3.5" data-testid="analytics-kpi">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate text-xs font-medium">{label}</span>
      </div>
      <span className="text-xl font-semibold leading-tight tabular-nums [overflow-wrap:anywhere] sm:text-2xl">{value}</span>
      {sub && <span className="truncate text-xs text-muted-foreground">{sub}</span>}
    </Card>
  )
}

function KpiTiles({ analytics }: { analytics: EstimateAnalytics }) {
  const { t } = useTranslation()
  const s = analytics.summary
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Kpi
        icon={Eye}
        label={t('Opens')}
        value={String(s.opens)}
        sub={s.uniqueVisitors === 1 ? t('1 person') : fill(t('{n} people'), { n: s.uniqueVisitors })}
      />
      <Kpi
        icon={Clock}
        label={t('Reading time')}
        value={s.totalSeconds > 0 ? formatDuration(s.totalSeconds) : '—'}
        sub={
          s.totalSeconds > 0 && s.realVisits > 0
            ? fill(t('avg {time} per visit'), { time: formatDuration(s.avgSecondsPerVisit) })
            : t('Not recorded yet')
        }
      />
      <Kpi
        icon={TrendingUp}
        label={t('Read to the end')}
        value={String(s.readToEndVisits)}
        sub={s.opens === 1 ? t('of 1 visit') : fill(t('of {n} visits'), { n: s.opens })}
      />
      <Kpi
        icon={Timer}
        label={t('Last opened')}
        value={s.lastViewedAt ? relativeAgo(s.lastViewedAt, t) : '—'}
        sub={s.lastViewedAt ? exactDateTime(s.lastViewedAt) : undefined}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

type Tone = 'primary' | 'success' | 'danger' | 'muted'

const TONE_CLASS: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]',
  danger: 'bg-[hsl(var(--destructive-text)/0.12)] text-[hsl(var(--destructive-text))]',
  muted: 'bg-muted text-muted-foreground',
}

interface Presented {
  icon: LucideIcon
  tone: Tone
  title: string
  details: string
}

const SENT_LABELS: Record<string, { plain: string; to: string }> = {
  email: { plain: 'Sent by email', to: 'Sent by email to {to}' },
  sms: { plain: 'Sent by text', to: 'Sent by text to {to}' },
  whatsapp: { plain: 'Sent on WhatsApp', to: 'Sent on WhatsApp to {to}' },
  other: { plain: 'Sent', to: 'Sent to {to}' },
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : '−'
  return `${sign}${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(delta))}`
}

export function presentEntry(entry: AnalyticsTimelineEntry, t: TFn, multiplePeople: boolean): Presented {
  switch (entry.kind) {
    case 'created':
      return { icon: FilePlus2, tone: 'muted', title: t('Estimate created'), details: '' }
    case 'generated':
      return { icon: Sparkles, tone: 'muted', title: t('Generated by AI'), details: '' }
    case 'updated':
      return {
        icon: Pencil,
        tone: 'muted',
        title: t('Estimate edited'),
        details:
          entry.totalDelta != null && entry.totalDelta !== 0
            ? fill(t('Total changed by {amount}'), { amount: formatDelta(entry.totalDelta) })
            : '',
      }
    case 'sent': {
      if (entry.channel === 'link') {
        return { icon: Send, tone: 'primary', title: t('Link shared'), details: '' }
      }
      const labels = SENT_LABELS[entry.channel] ?? SENT_LABELS.other
      return {
        icon: entry.channel === 'email' ? Mail : Send,
        tone: 'primary',
        title: entry.to ? fill(t(labels.to), { to: entry.to }) : t(labels.plain),
        details: '',
      }
    }
    case 'visit': {
      const details: string[] = []
      if (entry.device === 'mobile') details.push(t('On phone'))
      else if (entry.device === 'desktop') details.push(t('On a computer'))
      if (multiplePeople) details.push(fill(t('Person {n}'), { n: entry.visitorIndex }))
      if (entry.seconds > 0) details.push(formatDuration(entry.seconds))
      if (entry.maxScrollPct > 0) details.push(fill(t('Read {n}%'), { n: Math.round(entry.maxScrollPct) }))
      if (entry.topSection) details.push(fill(t('Most time on {section}'), { section: sectionLabel(entry.topSection, t) }))
      return {
        icon: entry.device === 'mobile' ? Smartphone : entry.device === 'desktop' ? Monitor : Eye,
        tone: 'primary',
        title: entry.first ? t('First open') : t('Opened'),
        details: details.join(' · '),
      }
    }
    case 'quick_opens':
      return {
        icon: Zap,
        tone: 'muted',
        title: entry.count === 1 ? t('1 quick open') : fill(t('{n} quick opens'), { n: entry.count }),
        details: t('Left within a few seconds'),
      }
    case 'action': {
      if (entry.action === 'pdf_download') return { icon: Download, tone: 'primary', title: t('Downloaded the PDF'), details: '' }
      if (entry.action === 'print') return { icon: Printer, tone: 'primary', title: t('Printed it'), details: '' }
      if (entry.action === 'sign_start') return { icon: PenLine, tone: 'primary', title: t('Started signing'), details: '' }
      if (entry.target === 'phone') return { icon: Phone, tone: 'primary', title: t('Tapped your phone number'), details: '' }
      if (entry.target === 'email') return { icon: Mail, tone: 'primary', title: t('Tapped your email'), details: '' }
      if (entry.target === 'website') return { icon: Globe, tone: 'primary', title: t('Tapped your website'), details: '' }
      return { icon: MousePointerClick, tone: 'primary', title: t('Tapped a contact link'), details: '' }
    }
    case 'accepted':
      return {
        icon: CheckCircle2,
        tone: 'success',
        title: t('Accepted'),
        details: entry.signedOnline ? t('Signed online') : '',
      }
    case 'declined':
      return { icon: XCircle, tone: 'danger', title: t('Declined'), details: '' }
    case 'response_cleared':
      return { icon: RotateCcw, tone: 'muted', title: t('Answer cleared'), details: '' }
  }
}

function Timeline({ analytics }: { analytics: EstimateAnalytics }) {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)
  const entries = analytics.timeline
  const shown = showAll ? entries : entries.slice(0, TIMELINE_PREVIEW)
  const multiplePeople = analytics.summary.uniqueVisitors > 1

  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; items: AnalyticsTimelineEntry[] }> = []
    for (const entry of shown) {
      const key = dayKey(entry.at)
      const last = out[out.length - 1]
      if (last && last.key === key) last.items.push(entry)
      else out.push({ key, label: dayLabel(entry.at, t), items: [entry] })
    }
    return out
  }, [shown, t])

  return (
    <section aria-labelledby="analytics-timeline-title" className="flex flex-col gap-3">
      <h3 id="analytics-timeline-title" className="text-sm font-semibold">
        {t('What happened')}
      </h3>
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h4>
            <ul className="flex flex-col gap-3">
              {group.items.map((entry, i) => {
                const p = presentEntry(entry, t, multiplePeople)
                const Icon = p.icon
                return (
                  <li key={`${entry.kind}-${entry.at}-${i}`} className="flex items-start gap-3" data-testid="analytics-timeline-entry">
                    <span
                      aria-hidden
                      className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', TONE_CLASS[p.tone])}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">{p.title}</span>
                        <time dateTime={entry.at} className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {clockTime(entry.at)}
                        </time>
                      </div>
                      {p.details && (
                        <p className="mt-0.5 break-words text-[13px] leading-snug text-muted-foreground">{p.details}</p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      {entries.length > TIMELINE_PREVIEW && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-primary"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? t('Show less') : fill(t('Show all {n} events'), { n: entries.length })}
        </Button>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Time spent, devices, heatmap
// ---------------------------------------------------------------------------

function Block({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4 shrink-0" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </Card>
  )
}

function Bar({ label, value, ratio }: { label: string; value: string; ratio: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate text-foreground">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, Math.min(100, ratio * 100))}%` }} />
      </div>
    </div>
  )
}

function TimeSpent({ analytics, itemLabels }: { analytics: EstimateAnalytics; itemLabels: Record<string, string> }) {
  const { t } = useTranslation()
  const { sectionDwell, itemDwell } = analytics.summary
  const sections = Object.entries(sectionDwell)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
  const items = Object.entries(itemDwell)
    .filter(([id, s]) => s > 0 && itemLabels[id])
    .sort((a, b) => b[1] - a[1])
    .slice(0, MOST_READ_ITEMS)
  const maxSection = sections[0]?.[1] ?? 0
  const maxItem = items[0]?.[1] ?? 0

  return (
    <Block title={t('Where they spent time')} icon={Timer}>
      {sections.length === 0 && items.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t('Reading time per section is only recorded for newer visits. Older visits did not track it.')}
        </p>
      ) : (
        <>
          {sections.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {sections.map(([target, seconds]) => (
                <Bar
                  key={target}
                  label={sectionLabel(target, t)}
                  value={formatDuration(seconds)}
                  ratio={maxSection > 0 ? seconds / maxSection : 0}
                />
              ))}
            </div>
          )}
          {items.length > 0 && (
            <div className="flex flex-col gap-2.5 border-t border-border/60 pt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Most read items')}</h4>
              {items.map(([id, seconds]) => (
                <Bar key={id} label={itemLabels[id]} value={formatDuration(seconds)} ratio={maxItem > 0 ? seconds / maxItem : 0} />
              ))}
            </div>
          )}
        </>
      )}
    </Block>
  )
}

function Devices({ analytics }: { analytics: EstimateAnalytics }) {
  const { t } = useTranslation()
  const { mobile, desktop, unknown } = analytics.summary.deviceSplit
  const total = mobile + desktop + unknown
  if (total === 0) return null
  const rows: Array<{ key: string; label: string; icon: LucideIcon; count: number }> = [
    { key: 'mobile', label: t('Phone'), icon: Smartphone, count: mobile },
    { key: 'desktop', label: t('Computer'), icon: Monitor, count: desktop },
    { key: 'unknown', label: t('Unknown'), icon: Eye, count: unknown },
  ].filter((r) => r.count > 0)

  return (
    <Block title={t('Devices')} icon={Users}>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <Bar
            key={r.key}
            label={r.label}
            value={r.count === 1 ? t('1 visit') : fill(t('{n} visits'), { n: r.count })}
            ratio={r.count / total}
          />
        ))}
      </div>
    </Block>
  )
}

function HeatmapEntry({ clicks, onOpen }: { clicks: number; onOpen: () => void }) {
  const { t } = useTranslation()
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <MousePointerClick className="size-4 shrink-0" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">{t('Heatmap')}</h3>
        {clicks > 0 && (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {clicks === 1 ? t('1 click') : fill(t('{n} clicks'), { n: clicks })}
          </span>
        )}
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {t('See where they clicked and what held their attention on the estimate.')}
      </p>
      <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto sm:self-start" onClick={onOpen}>
        {t('Open heatmap')}
      </Button>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

export function AnalyticsBody({
  analytics,
  itemLabels,
  onOpenHeatmap,
}: {
  analytics: EstimateAnalytics
  itemLabels: Record<string, string>
  onOpenHeatmap: () => void
}) {
  const opened = analytics.summary.opens > 0
  return (
    <div className="flex flex-col gap-4">
      {opened ? (
        <>
          <SummaryCard analytics={analytics} />
          <KpiTiles analytics={analytics} />
        </>
      ) : (
        <EmptyState />
      )}
      <Timeline analytics={analytics} />
      {opened && (
        <>
          <TimeSpent analytics={analytics} itemLabels={itemLabels} />
          <Devices analytics={analytics} />
          <HeatmapEntry clicks={analytics.summary.clicks} onOpen={onOpenHeatmap} />
        </>
      )}
    </div>
  )
}
