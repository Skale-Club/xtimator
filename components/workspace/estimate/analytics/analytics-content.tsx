'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  Flame,
  Mail,
  MailOpen,
  MessageSquare,
  Phone,
  Snowflake,
  Sun,
  XCircle,
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
import {
  buildDaySeries,
  buildFunnel,
  buildReadingRows,
  buildVisitorRows,
  currentAnswer,
  visitorLetter,
  type Answer,
} from './analytics-data'
import {
  COMPUTER_COLOR,
  DeviceBar,
  FunnelRow,
  OpensPerDayChart,
  PHONE_COLOR,
  ProgressRing,
} from './analytics-charts'

const TIMELINE_PREVIEW = 12
const MOST_READ_ITEMS = 5
const TOP_REASONS = 3

/** Who to follow up with. Each channel shows only when the client has it. */
export interface AnalyticsContact {
  name?: string | null
  phone?: string | null
  email?: string | null
}

// ---------------------------------------------------------------------------
// Skeleton + states
// ---------------------------------------------------------------------------

export function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" data-testid="analytics-skeleton">
      <Skeleton className="h-36 w-full rounded-[var(--radius-lg)] sm:h-32" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[96px] rounded-[var(--radius-lg)]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-56 rounded-[var(--radius-lg)]" />
        ))}
        <Skeleton className="h-64 rounded-[var(--radius-lg)] lg:col-span-2" />
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
      <h3 className="text-base font-semibold">{t('Nothing to show yet')}</h3>
      <p className="max-w-[44ch] text-sm leading-relaxed text-muted-foreground">
        {t(
          'When your client opens the link, you will see here when they opened it, how long they read, on which device, and what they did next.',
        )}
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Interest badge (also used by the status sheet)
// ---------------------------------------------------------------------------

const LEVEL_LABEL: Record<Exclude<InterestLevel, 'none'>, string> = {
  hot: 'Hot',
  warm: 'Warm',
  cold: 'Cold',
}

export function InterestBadge({ level }: { level: Exclude<InterestLevel, 'none'> }) {
  const { t } = useTranslation()
  const label = t(LEVEL_LABEL[level])
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

// ---------------------------------------------------------------------------
// Verdict card
// ---------------------------------------------------------------------------

type VerdictKind = 'hot' | 'warm' | 'cold' | 'none' | 'answered'

const VERDICT_HEADLINE: Record<Exclude<VerdictKind, 'answered'>, string> = {
  hot: 'Hot, a good moment to follow up',
  warm: 'Warm, keep an eye on it',
  cold: 'Cold, a friendly check-in could help',
  none: 'Not opened yet',
}

const VERDICT_ICON: Record<VerdictKind, { icon: LucideIcon; tone: string }> = {
  hot: { icon: Flame, tone: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
  warm: { icon: Sun, tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  cold: { icon: Snowflake, tone: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  none: { icon: Eye, tone: 'bg-muted text-muted-foreground' },
  answered: { icon: CheckCircle2, tone: 'bg-muted text-muted-foreground' },
}

const METER_FILL: Record<'cold' | 'warm' | 'hot', string> = {
  cold: 'bg-sky-500',
  warm: 'bg-amber-500',
  hot: 'bg-orange-500',
}

function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

function smsHref(phone: string): string {
  return `sms:${phone.replace(/[^\d+]/g, '')}`
}

function Meter({ level }: { level: 'cold' | 'warm' | 'hot' }) {
  const { t } = useTranslation()
  const steps = ['cold', 'warm', 'hot'] as const
  return (
    <div className="flex w-full max-w-[260px] gap-1.5" role="img" aria-label={t(LEVEL_LABEL[level])} data-testid="interest-meter">
      {steps.map((step) => (
        <div key={step} className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={cn('h-1.5 rounded-full', step === level ? METER_FILL[step] : 'bg-muted')} />
          <span
            className={cn(
              'text-[11px] leading-none',
              step === level ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {t(LEVEL_LABEL[step])}
          </span>
        </div>
      ))}
    </div>
  )
}

function VerdictCard({
  analytics,
  answer,
  contact,
}: {
  analytics: EstimateAnalytics
  answer: Answer | null
  contact?: AnalyticsContact
}) {
  const { t } = useTranslation()
  const opened = analytics.summary.opens > 0
  const level = analytics.interest.level
  const kind: VerdictKind = answer ? 'answered' : !opened || level === 'none' ? 'none' : level
  const { icon: Icon, tone } = VERDICT_ICON[kind]
  const reasons = analytics.interest.reasons.slice(0, TOP_REASONS)

  const phone = contact?.phone?.trim() || null
  const email = contact?.email?.trim() || null
  const canFollowUp = !answer && (phone || email)

  let iconTone = tone
  if (answer?.kind === 'accepted') iconTone = 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]'
  if (answer?.kind === 'declined') iconTone = 'bg-[hsl(var(--destructive-text)/0.12)] text-[hsl(var(--destructive-text))]'
  const AnswerIcon = answer?.kind === 'declined' ? XCircle : Icon

  return (
    <Card className="gap-4 p-5 lg:col-span-2" data-testid="analytics-summary">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className={cn('flex size-[52px] shrink-0 items-center justify-center rounded-full', iconTone)}>
            <AnswerIcon className="size-6" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-lg font-semibold leading-snug tracking-tight">
                {answer ? t('Answered') : t(VERDICT_HEADLINE[kind as Exclude<VerdictKind, 'answered'>])}
              </h3>
              {answer && (
                <p className="text-sm text-muted-foreground">
                  {answer.kind === 'accepted' ? t('Accepted') : t('Declined')} · {exactDateTime(answer.at)}
                </p>
              )}
            </div>
            {!answer && (kind === 'hot' || kind === 'warm' || kind === 'cold') && <Meter level={kind} />}
            {reasons.length > 0 && (
              <ul className="flex flex-col gap-1" aria-label={t('Why')}>
                {reasons.map((reason) => (
                  <li key={reason} className="flex items-start gap-1.5 text-[13px] leading-snug text-muted-foreground">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-foreground/70" aria-hidden />
                    <span>{t(INTEREST_REASON_LABELS[reason])}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {canFollowUp && (
          <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end" data-testid="analytics-followup">
            {phone && (
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <a href={phoneHref(phone)}>
                  <Phone aria-hidden />
                  {t('Call')}
                </a>
              </Button>
            )}
            {phone && (
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <a href={smsHref(phone)}>
                  <MessageSquare aria-hidden />
                  {t('Text')}
                </a>
              </Button>
            )}
            {email && (
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <a href={`mailto:${email}`}>
                  <Mail aria-hidden />
                  {t('Email')}
                </a>
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// KPI tiles
// ---------------------------------------------------------------------------

function Kpi({
  label,
  value,
  sub,
  aside,
}: {
  label: string
  value: string
  sub?: string
  aside?: ReactNode
}) {
  return (
    <Card className="min-w-0 gap-1.5 p-4" data-testid="analytics-kpi">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-2xl font-semibold leading-tight tabular-nums [overflow-wrap:anywhere]">{value}</span>
        {aside}
      </div>
      {sub && <span className="text-xs leading-snug text-muted-foreground">{sub}</span>}
    </Card>
  )
}

function KpiTiles({ analytics }: { analytics: EstimateAnalytics }) {
  const { t } = useTranslation()
  const s = analytics.summary
  return (
    <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-4">
      <Kpi
        label={t('Opens')}
        value={String(s.opens)}
        sub={s.uniqueVisitors === 1 ? t('by 1 person') : fill(t('by {n} people'), { n: s.uniqueVisitors })}
      />
      <Kpi
        label={t('Reading time')}
        value={s.totalSeconds > 0 ? formatDuration(s.totalSeconds) : '—'}
        sub={
          s.totalSeconds > 0 && s.realVisits > 0
            ? fill(t('{time} per visit'), { time: formatDuration(s.avgSecondsPerVisit) })
            : t('Not recorded yet')
        }
      />
      <Kpi
        label={t('Read to the end')}
        value={`${s.readToEndVisits}/${s.opens}`}
        sub={t('visits')}
        aside={<ProgressRing ratio={s.opens > 0 ? s.readToEndVisits / s.opens : 0} />}
      />
      <Kpi
        label={t('Last opened')}
        value={s.lastViewedAt ? relativeAgo(s.lastViewedAt, t) : '—'}
        sub={s.lastViewedAt ? exactDateTime(s.lastViewedAt) : undefined}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function Block({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('min-w-0 gap-4 p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  )
}

function OpensPerDay({ analytics }: { analytics: EstimateAnalytics }) {
  const { t } = useTranslation()
  const days = useMemo(() => buildDaySeries(analytics.visits), [analytics.visits])
  return (
    <Block title={t('Opens per day')}>
      <OpensPerDayChart days={days} />
    </Block>
  )
}

const FUNNEL_LABEL = {
  opened: 'Opened',
  half: 'Read past half',
  end: 'Read to the end',
  signing: 'Started signing',
  answered: 'Answered',
} as const

function HowFarTheyGot({ analytics, answered }: { analytics: EstimateAnalytics; answered: boolean }) {
  const { t } = useTranslation()
  const steps = buildFunnel(analytics, answered)
  const opened = Math.max(1, steps[0].count)
  return (
    <Block title={t('How far they got')}>
      <div className="flex flex-col gap-3">
        {steps.map((step, i) => (
          <FunnelRow
            key={step.key}
            label={t(FUNNEL_LABEL[step.key])}
            count={step.count}
            ratio={step.count / opened}
            step={i}
          />
        ))}
      </div>
    </Block>
  )
}

const READING_TINT = ['transparent', 'hsl(var(--primary) / 0.1)', 'hsl(var(--primary) / 0.22)', 'hsl(var(--primary) / 0.38)', 'hsl(var(--primary) / 0.6)']

function WhatTheyRead({
  analytics,
  itemLabels,
  onOpenHeatmap,
}: {
  analytics: EstimateAnalytics
  itemLabels: Record<string, string>
  onOpenHeatmap: () => void
}) {
  const { t } = useTranslation()
  const { sectionDwell, itemDwell } = analytics.summary
  const hasDwell = Object.values(sectionDwell).some((s) => s > 0)
  const rows = buildReadingRows(sectionDwell)
  const items = Object.entries(itemDwell)
    .filter(([id, s]) => s > 0 && itemLabels[id])
    .sort((a, b) => b[1] - a[1])
    .slice(0, MOST_READ_ITEMS)

  return (
    <Block
      title={t('What they read')}
      action={
        <Button type="button" variant="link" size="sm" className="h-auto gap-1 p-0 text-[13px]" onClick={onOpenHeatmap}>
          {t('Open heatmap')}
          <ArrowRight aria-hidden />
        </Button>
      }
    >
      {!hasDwell ? (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t('Reading time per section is only recorded for newer visits. Older visits did not track it.')}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1" data-testid="reading-rows">
            {rows.map((row) => (
              <div
                key={row.target}
                data-bin={row.bin}
                className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-[13px] text-foreground"
                style={{ backgroundColor: READING_TINT[row.bin] }}
              >
                <span className="min-w-0 truncate">{sectionLabel(row.target, t)}</span>
                <span className="shrink-0 tabular-nums">{row.seconds > 0 ? formatDuration(row.seconds) : '—'}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground" aria-hidden>
            <span>{t('Less time')}</span>
            <span className="flex gap-0.5">
              {[1, 2, 3, 4].map((bin) => (
                <span key={bin} className="size-3 rounded-sm" style={{ backgroundColor: READING_TINT[bin] }} />
              ))}
            </span>
            <span>{t('More time')}</span>
          </div>
        </>
      )}
      {items.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Most read items')}</h4>
          {items.map(([id, seconds]) => (
            <div key={id} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-foreground">{itemLabels[id]}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{formatDuration(seconds)}</span>
            </div>
          ))}
        </div>
      )}
    </Block>
  )
}

function WhoOpenedIt({ analytics }: { analytics: EstimateAnalytics }) {
  const { t } = useTranslation()
  const rows = useMemo(() => buildVisitorRows(analytics.visits), [analytics.visits])
  const { mobile, desktop } = analytics.summary.deviceSplit
  return (
    <Block title={t('Who opened it')}>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.index} className="flex items-center gap-3" data-testid="visitor-row">
            <span
              aria-hidden
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                row.index === 1 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              {row.letter}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{fill(t('Visitor {letter}'), { letter: row.letter })}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[
                  row.device === 'mobile' ? t('Phone') : row.device === 'desktop' ? t('Computer') : null,
                  row.opens === 1 ? t('1 open') : fill(t('{n} opens'), { n: row.opens }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {mobile + desktop > 0 && (
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <DeviceBar computer={desktop} phone={mobile} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" data-testid="devices-legend">
            <span className="flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', COMPUTER_COLOR)} aria-hidden />
              {`${t('Computer')} ${desktop}`}
            </span>
            <span className="flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', PHONE_COLOR)} aria-hidden />
              {`${t('Phone')} ${mobile}`}
            </span>
          </div>
        </div>
      )}
    </Block>
  )
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

type Dot = 'first' | 'visit' | 'quick' | 'neutral' | 'success' | 'danger' | 'primary'

const DOT_CLASS: Record<Dot, string> = {
  first: 'bg-orange-500',
  visit: 'bg-primary',
  primary: 'bg-primary',
  quick: 'bg-muted-foreground/40',
  neutral: 'bg-foreground/30',
  success: 'bg-[hsl(var(--success))]',
  danger: 'bg-[hsl(var(--destructive-text))]',
}

interface Presented {
  dot: Dot
  title: string
  pills: string[]
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

export function presentEntry(entry: AnalyticsTimelineEntry, t: TFn): Presented {
  switch (entry.kind) {
    case 'created':
      return { dot: 'neutral', title: t('Estimate created'), pills: [] }
    case 'generated':
      return { dot: 'neutral', title: t('Estimate created with AI'), pills: [] }
    case 'updated':
      return {
        dot: 'neutral',
        title: t('Estimate edited'),
        pills:
          entry.totalDelta != null && entry.totalDelta !== 0
            ? [fill(t('Total changed by {amount}'), { amount: formatDelta(entry.totalDelta) })]
            : [],
      }
    case 'sent': {
      if (entry.channel === 'link') return { dot: 'primary', title: t('Link shared'), pills: [] }
      const labels = SENT_LABELS[entry.channel] ?? SENT_LABELS.other
      return {
        dot: 'primary',
        title: entry.to ? fill(t(labels.to), { to: entry.to }) : t(labels.plain),
        pills: [],
      }
    }
    case 'visit': {
      const pills: string[] = []
      if (entry.device === 'mobile') pills.push(t('On phone'))
      else if (entry.device === 'desktop') pills.push(t('On a computer'))
      if (entry.seconds > 0) pills.push(formatDuration(entry.seconds))
      if (entry.maxScrollPct > 0) pills.push(fill(t('Read {n}%'), { n: Math.round(entry.maxScrollPct) }))
      if (entry.topSection) pills.push(fill(t('Most time on {section}'), { section: sectionLabel(entry.topSection, t) }))
      return {
        dot: entry.first ? 'first' : 'visit',
        title: entry.first
          ? t('First open')
          : fill(t('Visitor {letter} read it'), { letter: visitorLetter(entry.visitorIndex) }),
        pills,
      }
    }
    case 'quick_opens':
      return {
        dot: 'quick',
        title: entry.count === 1 ? t('1 quick open') : fill(t('{n} quick opens'), { n: entry.count }),
        pills:
          entry.count > 1 && entry.since !== entry.at
            ? [fill(t('since {when}'), { when: exactDateTime(entry.since) })]
            : [t('Left within a few seconds')],
      }
    case 'action': {
      if (entry.action === 'pdf_download') return { dot: 'primary', title: t('Downloaded the PDF'), pills: [] }
      if (entry.action === 'print') return { dot: 'primary', title: t('Printed it'), pills: [] }
      if (entry.action === 'sign_start') return { dot: 'primary', title: t('Started signing'), pills: [] }
      if (entry.target === 'phone') return { dot: 'primary', title: t('Tapped your phone number'), pills: [] }
      if (entry.target === 'email') return { dot: 'primary', title: t('Tapped your email'), pills: [] }
      if (entry.target === 'website') return { dot: 'primary', title: t('Tapped your website'), pills: [] }
      return { dot: 'primary', title: t('Tapped a contact link'), pills: [] }
    }
    case 'accepted':
      return {
        dot: 'success',
        title: t('Accepted'),
        pills: entry.signedOnline ? [t('Signed online')] : [],
      }
    case 'declined':
      return { dot: 'danger', title: t('Declined'), pills: [] }
    case 'response_cleared':
      return { dot: 'neutral', title: t('Answer cleared'), pills: [] }
  }
}

function Timeline({ analytics }: { analytics: EstimateAnalytics }) {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)
  const entries = analytics.timeline
  const shown = showAll ? entries : entries.slice(0, TIMELINE_PREVIEW)

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
    <Block title={t('What happened')} className="lg:col-span-2">
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h4>
            {/* The rail is one 1px line behind the dots; the time column is 4.5rem wide. */}
            <ul className="relative flex flex-col gap-3.5 before:absolute before:bottom-2 before:left-[calc(4.5rem+0.75rem+4px)] before:top-2 before:w-px before:bg-border">
              {group.items.map((entry, i) => {
                const p = presentEntry(entry, t)
                return (
                  <li
                    key={`${entry.kind}-${entry.at}-${i}`}
                    className="relative flex items-start gap-3"
                    data-testid="analytics-timeline-entry"
                  >
                    <time dateTime={entry.at} className="w-[4.5rem] shrink-0 pt-px text-xs tabular-nums text-muted-foreground">
                      {clockTime(entry.at)}
                    </time>
                    <span
                      aria-hidden
                      className={cn('relative mt-[5px] size-[9px] shrink-0 rounded-full ring-4 ring-card', DOT_CLASS[p.dot])}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium leading-snug text-foreground">{p.title}</p>
                      {p.pills.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {p.pills.map((pill) => (
                            <li
                              key={pill}
                              className="rounded-full bg-muted px-2 py-0.5 text-xs leading-snug text-muted-foreground"
                            >
                              {pill}
                            </li>
                          ))}
                        </ul>
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
    </Block>
  )
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

export function AnalyticsBody({
  analytics,
  itemLabels,
  onOpenHeatmap,
  contact,
}: {
  analytics: EstimateAnalytics
  itemLabels: Record<string, string>
  onOpenHeatmap: () => void
  contact?: AnalyticsContact
}) {
  const opened = analytics.summary.opens > 0
  const answer = useMemo(() => currentAnswer(analytics.timeline), [analytics.timeline])
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <VerdictCard analytics={analytics} answer={answer} contact={contact} />
      {opened ? (
        <>
          <KpiTiles analytics={analytics} />
          <OpensPerDay analytics={analytics} />
          <HowFarTheyGot analytics={analytics} answered={answer != null} />
          <WhatTheyRead analytics={analytics} itemLabels={itemLabels} onOpenHeatmap={onOpenHeatmap} />
          <WhoOpenedIt analytics={analytics} />
        </>
      ) : (
        <div className="lg:col-span-2">
          <EmptyState />
        </div>
      )}
      <Timeline analytics={analytics} />
    </div>
  )
}
