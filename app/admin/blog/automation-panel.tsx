'use client'
/**
 * Auto-blog control panel (autoblog-parity XT-12).
 *
 * Every server action behind this existed before this component did. That is
 * the gap it closes: automated posting could be configured only by editing rows
 * in Supabase, which is not a feature anyone can use.
 *
 * Drafts are approved here OR from Telegram — both go through the same server
 * actions, so the two can never disagree about what a decision does.
 */
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { T } from '@/components/i18n/t'
import {
  addRssSource, approveDraft, deleteRssSource, fetchRssNow, generateNow,
  loadAutomationState, rejectDraft, saveAutomationSettings, saveTelegramSettings,
  toggleRssSource, type BlogAutomationSettingsInput,
} from './automation-actions'

/** Matches the server: "keep the stored token", as opposed to clearing it. */
const MASKED_TOKEN = '********'

// US zones plus UTC — where this product's customers actually operate. A
// 400-entry IANA dropdown is not a control anyone uses, and an unknown zone
// degrades to UTC server-side anyway.
const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC',
]

// "No fixed time" is a real choice and must stay representable: it is the
// behaviour with no hour pinned, and the only way back once one is set.
const DRIFTING = 'drifting'

type State = Awaited<ReturnType<typeof loadAutomationState>>
export type AutomationState = Extract<State, { ok: true }>['data']

interface RssSource {
  id: string
  name: string
  url: string
  enabled: boolean
  last_fetched_at: string | null
  last_fetched_status: string | null
  error_message: string | null
}

interface Job {
  id: string
  status: string
  trigger: string | null
  source: string | null
  pillar_id: string | null
  topic: string | null
  error_message: string | null
  durations_ms: { topic?: number; content?: number; image?: number | null; upload?: number; total?: number } | null
  created_at: string
}

interface Draft {
  id: string
  title: string
  excerpt: string | null
  created_at: string
}

const DEFAULT_SETTINGS: BlogAutomationSettingsInput = {
  enabled: false,
  postsPerDay: 1,
  postingHour: null,
  timezone: 'America/New_York',
  seoKeywords: '',
  promptStyle: '',
  systemPrompt: '',
  enableTrendAnalysis: true,
  rssEnabled: false,
  autoPublish: false,
  textModel: '',
  imageModel: '',
}

/** Stage timings read as seconds — milliseconds are precision nobody acts on. */
function formatDuration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

/**
 * Maps the stored row onto the form. Shared by the initial render and every
 * refresh, so the two cannot disagree about what a missing column defaults to.
 */
function formFromSettings(settings: Record<string, unknown> | null): BlogAutomationSettingsInput {
  const row = settings
  if (!row) return DEFAULT_SETTINGS
  return {
    enabled: Boolean(row.enabled),
    postsPerDay: Number(row.posts_per_day ?? 1),
    postingHour: row.posting_hour === null || row.posting_hour === undefined ? null : Number(row.posting_hour),
    timezone: String(row.timezone || 'America/New_York'),
    seoKeywords: String(row.seo_keywords ?? ''),
    promptStyle: String(row.prompt_style ?? ''),
    systemPrompt: String(row.system_prompt ?? ''),
    enableTrendAnalysis: Boolean(row.enable_trend_analysis),
    rssEnabled: Boolean(row.rss_enabled),
    autoPublish: Boolean(row.auto_publish),
    textModel: String(row.text_model ?? ''),
    imageModel: String(row.image_model ?? ''),
  }
}

/**
 * `initialState` is read by the SERVER component that renders this, not by an
 * effect here. That is what keeps the panel from flashing empty on every load
 * — and the page is already admin-gated and already awaiting Supabase, so the
 * read costs nothing extra.
 */
export function BlogAutomationPanel({ initialState }: { initialState: AutomationState }) {
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<AutomationState>(initialState)
  const [form, setForm] = useState<BlogAutomationSettingsInput>(() => formFromSettings(initialState.settings))
  const [rssName, setRssName] = useState('')
  const [rssUrl, setRssUrl] = useState('')
  const [chatIdsText, setChatIdsText] = useState(() => initialState.telegram.chatIds.join('\n'))
  const [approvalChatIdsText, setApprovalChatIdsText] = useState(() => initialState.telegram.approvalsChatIds.join('\n'))
  const [botToken, setBotToken] = useState('')

  async function refresh() {
    const result = await loadAutomationState()
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    setState(result.data)
    setForm(formFromSettings(result.data.settings))
    setChatIdsText(result.data.telegram.chatIds.join('\n'))
    setApprovalChatIdsText(result.data.telegram.approvalsChatIds.join('\n'))
  }

  /** Every mutation funnels through here so nothing can forget to re-read. */
  function run(action: () => Promise<{ ok: boolean; message?: string }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        toast.error(result.message ?? 'Something went wrong')
        return
      }
      toast.success(success)
      await refresh()
    })
  }

  const sources = state.rssSources as unknown as RssSource[]
  const jobs = state.recentJobs as unknown as Job[]
  const drafts = state.pendingDrafts as unknown as Draft[]
  const parseIds = (text: string) => text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)

  return (
    <div className="space-y-6">
      {/* ── Schedule and voice ─────────────────────────────────────────── */}
      <Card variant="glass" className="space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold"><T>Automated posting</T></h2>
            <p className="text-sm text-muted-foreground">
              <T>The AI writes posts for your blog on a schedule. Every draft waits for your approval unless you turn that off.</T>
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => run(generateNow, 'Generation started')}
          >
            <T>Generate now</T>
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="ab-enabled"><T>Enable automated posting</T></Label>
            <p className="text-sm text-muted-foreground"><T>Posts are generated on the schedule below.</T></p>
          </div>
          <Switch id="ab-enabled" checked={form.enabled}
            onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="ab-autopublish"><T>Publish without review</T></Label>
            <p className="text-sm text-muted-foreground">
              <T>Off: every post waits in the approval queue below, and each decision teaches the generator.</T>
            </p>
          </div>
          <Switch id="ab-autopublish" checked={form.autoPublish}
            onCheckedChange={(v) => setForm((p) => ({ ...p, autoPublish: v }))} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label><T>Posts per day</T></Label>
            <Select value={String(form.postsPerDay)}
              onValueChange={(v) => setForm((p) => ({ ...p, postsPerDay: Number(v) }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[0, 1, 2, 3, 4].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n === 0 ? 'Paused' : `${n} / day`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Without a pinned hour the schedule only promises "at least N hours
              since the last run", so the publishing time walks forward with
              every run until it lands in the middle of the night. */}
          <div className="space-y-1.5">
            <Label><T>Publish at</T></Label>
            <Select
              value={form.postingHour === null ? DRIFTING : String(form.postingHour)}
              onValueChange={(v) => setForm((p) => ({ ...p, postingHour: v === DRIFTING ? null : Number(v) }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={DRIFTING}>No fixed time</SelectItem>
                {Array.from({ length: 24 }, (_, h) => (
                  <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label><T>Time zone</T></Label>
            <Select value={form.timezone} onValueChange={(v) => setForm((p) => ({ ...p, timezone: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Computed server-side by the same helper the cron gate uses, so the
            time promised here is the time the job actually fires. */}
        {state.nextScheduledRunAt && (
          <p className="text-xs text-muted-foreground">
            Next post: {new Date(state.nextScheduledRunAt).toLocaleString()}
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="ab-keywords"><T>Target keywords</T></Label>
          <Input id="ab-keywords" value={form.seoKeywords}
            placeholder="roof repair, gutter cleaning, Austin TX"
            onChange={(e) => setForm((p) => ({ ...p, seoKeywords: e.target.value }))} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ab-style"><T>Style and tone</T></Label>
          <Textarea id="ab-style" value={form.promptStyle} rows={3}
            onChange={(e) => setForm((p) => ({ ...p, promptStyle: e.target.value }))} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ab-system"><T>Editorial guide</T></Label>
          <Textarea id="ab-system" value={form.systemPrompt} rows={4}
            onChange={(e) => setForm((p) => ({ ...p, systemPrompt: e.target.value }))} />
          <p className="text-xs text-muted-foreground">
            <T>Injected into every generation as the voice of your business.</T>
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ab-text-model"><T>Text model</T></Label>
            <Input id="ab-text-model" value={form.textModel}
              placeholder="anthropic/claude-sonnet-5"
              onChange={(e) => setForm((p) => ({ ...p, textModel: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ab-image-model"><T>Image model</T></Label>
            <Input id="ab-image-model" value={form.imageModel}
              onChange={(e) => setForm((p) => ({ ...p, imageModel: e.target.value }))} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="ab-rss"><T>Write from your news feeds</T></Label>
            <p className="text-sm text-muted-foreground">
              <T>Take the subject from a feed below when something relevant is pending. Your usual topics continue whenever nothing on-topic is waiting.</T>
            </p>
          </div>
          <Switch id="ab-rss" checked={form.rssEnabled}
            onCheckedChange={(v) => setForm((p) => ({ ...p, rssEnabled: v }))} />
        </div>

        <div className="flex justify-end">
          <Button variant="primary" disabled={pending}
            onClick={() => run(() => saveAutomationSettings(form), 'Settings saved')}>
            <T>Save settings</T>
          </Button>
        </div>
      </Card>

      {/* ── Approval queue ─────────────────────────────────────────────── */}
      <Card variant="glass" className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            <T>Waiting for approval</T>{drafts.length > 0 && <Badge className="ml-2">{drafts.length}</Badge>}
          </h2>
          <p className="text-sm text-muted-foreground">
            <T>Approving publishes the post; rejecting deletes it. Both teach the generator what you want more and less of.</T>
          </p>
        </div>
        {drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground"><T>Nothing waiting.</T></p>
        ) : (
          <div className="space-y-2">
            {drafts.map((draft) => (
              <div key={draft.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[var(--glass-border)] p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{draft.title}</p>
                  {draft.excerpt && <p className="line-clamp-2 text-sm text-muted-foreground">{draft.excerpt}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="primary" disabled={pending}
                    onClick={() => run(() => approveDraft(draft.id), 'Published')}>
                    <T>Approve</T>
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending}
                    onClick={() => run(() => rejectDraft(draft.id), 'Rejected')}>
                    <T>Reject</T>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── News feeds ─────────────────────────────────────────────────── */}
      <Card variant="glass" className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold"><T>News feeds</T></h2>
          <p className="text-sm text-muted-foreground">
            <T>Industry feeds the AI can take a subject from. Nothing here is ever copied onto your site — a feed item is the starting point for an original post written for your own customers.</T>
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[140px] flex-1 space-y-1">
            <Label htmlFor="rss-name"><T>Name</T></Label>
            <Input id="rss-name" value={rssName} onChange={(e) => setRssName(e.target.value)} />
          </div>
          <div className="min-w-[220px] flex-[2] space-y-1">
            <Label htmlFor="rss-url"><T>Feed URL</T></Label>
            <Input id="rss-url" value={rssUrl} placeholder="https://example.com/feed.xml"
              onChange={(e) => setRssUrl(e.target.value)} />
          </div>
          <Button variant="secondary" disabled={pending || !rssName.trim() || !rssUrl.trim()}
            onClick={() => run(
              async () => {
                const result = await addRssSource({ name: rssName.trim(), url: rssUrl.trim() })
                if (result.ok) { setRssName(''); setRssUrl('') }
                return result
              },
              'Feed added — fetch now to check that it works',
            )}>
            <T>Add feed</T>
          </Button>
        </div>

        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground"><T>No feeds yet.</T></p>
        ) : (
          <div className="space-y-2">
            {sources.map((source) => (
              <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--glass-border)] p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{source.name}</span>
                    {source.last_fetched_status === 'error' && <Badge variant="destructive">Failing</Badge>}
                    {source.last_fetched_status === 'ok' && <Badge variant="secondary">OK</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{source.url}</p>
                  {/* A failing feed stays connected on purpose — a publisher's
                      hour of downtime must not silently unsubscribe you — so
                      the reason has to be visible or nobody would know. */}
                  {source.error_message && <p className="mt-1 text-xs text-destructive">{source.error_message}</p>}
                  {source.last_fetched_at && (
                    <p className="text-xs text-muted-foreground">
                      Last checked: {new Date(source.last_fetched_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch checked={source.enabled} disabled={pending}
                    onCheckedChange={(v) => run(() => toggleRssSource(source.id, v), v ? 'Feed enabled' : 'Feed paused')} />
                  <Button size="sm" variant="ghost" disabled={pending}
                    onClick={() => run(() => deleteRssSource(source.id), 'Feed removed')}>
                    <T>Remove</T>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {sources.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--glass-border)] pt-3">
            <p className="text-sm text-muted-foreground">{state.pendingRssItems} item(s) waiting to be used.</p>
            <Button variant="secondary" disabled={pending}
              onClick={() => startTransition(async () => {
                const result = await fetchRssNow()
                if (!result.ok) { toast.error(result.message); return }
                // A partial failure is reported as a failure: "3 feeds checked"
                // while one is dead is how a broken feed sits unnoticed.
                // The action already formats each error as "<feed>: <reason>".
                const { errors, upserted, sources: checked } = result.data
                if (errors.length > 0) {
                  toast.error(`${errors.length} feed(s) failed: ${errors.join(' · ')}`)
                } else {
                  toast.success(`${upserted} item(s) from ${checked} feed(s).`)
                }
                await refresh()
              })}>
              <T>Fetch now</T>
            </Button>
          </div>
        )}
      </Card>

      {/* ── Telegram ───────────────────────────────────────────────────── */}
      <Card variant="glass" className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold"><T>Approve from Telegram</T></h2>
          <p className="text-sm text-muted-foreground">
            <T>Send every new draft to a Telegram chat with Approve and Reject buttons. Works in a group, and in a single topic of a group.</T>
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tg-token"><T>Bot token</T></Label>
          <Input id="tg-token" type="password" value={botToken}
            placeholder={state.telegram.hasBotToken ? '•••••••• (stored)' : '123456:ABC-DEF...'}
            onChange={(e) => setBotToken(e.target.value)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tg-chats"><T>Alert chats</T></Label>
            <Textarea id="tg-chats" rows={3} value={chatIdsText}
              placeholder={'-1001234567890'}
              onChange={(e) => setChatIdsText(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-approval-chats"><T>Approval chats</T></Label>
            <Textarea id="tg-approval-chats" rows={3} value={approvalChatIdsText}
              placeholder={'-1001234567890:42'}
              onChange={(e) => setApprovalChatIdsText(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              <T>One per line. Add “:42” to post into one forum topic. Leave empty to reuse the alert chats.</T>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="tg-enabled"><T>Telegram notifications</T></Label>
          </div>
          <Switch id="tg-enabled" checked={state.telegram.enabled} disabled={pending}
            onCheckedChange={(v) => run(
              () => saveTelegramSettings({
                enabled: v,
                botToken: botToken.trim() || MASKED_TOKEN,
                chatIds: parseIds(chatIdsText),
                approvalsEnabled: state.telegram.approvalsEnabled,
                approvalsChatIds: parseIds(approvalChatIdsText),
              }),
              v ? 'Telegram enabled' : 'Telegram disabled',
            )} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="tg-approvals"><T>Send drafts for approval</T></Label>
          </div>
          <Switch id="tg-approvals" checked={state.telegram.approvalsEnabled} disabled={pending}
            onCheckedChange={(v) => run(
              () => saveTelegramSettings({
                enabled: state.telegram.enabled,
                botToken: botToken.trim() || MASKED_TOKEN,
                chatIds: parseIds(chatIdsText),
                approvalsEnabled: v,
                approvalsChatIds: parseIds(approvalChatIdsText),
              }),
              v ? 'Draft approvals enabled' : 'Draft approvals disabled',
            )} />
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" disabled={pending}
            onClick={() => run(
              async () => {
                const result = await saveTelegramSettings({
                  enabled: state.telegram.enabled,
                  // An untouched field must not clear a stored token, and an
                  // empty one must: the sentinel tells those two apart.
                  botToken: botToken.trim() || MASKED_TOKEN,
                  chatIds: parseIds(chatIdsText),
                  approvalsEnabled: state.telegram.approvalsEnabled,
                  approvalsChatIds: parseIds(approvalChatIdsText),
                })
                if (result.ok) setBotToken('')
                return result
              },
              'Telegram settings saved',
            )}>
            <T>Save Telegram settings</T>
          </Button>
        </div>
      </Card>

      {/* ── History ────────────────────────────────────────────────────── */}
      <Card variant="glass" className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold"><T>Generation history</T></h2>
          <p className="text-sm text-muted-foreground">
            <T>What ran, how long each stage took, and what failed.</T>
          </p>
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground"><T>No generation runs yet.</T></p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => {
              const d = job.durations_ms
              const stages = d
                ? ([['topic', d.topic], ['content', d.content], ['image', d.image], ['upload', d.upload]] as const)
                    .map(([name, value]) => [name, formatDuration(value)] as const)
                    .filter(([, value]) => value !== null)
                : []
              return (
                <div key={job.id} className="space-y-1 rounded-lg border border-[var(--glass-border)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={job.status === 'failed' ? 'destructive' : 'secondary'}>{job.status}</Badge>
                    {job.source && <Badge variant="outline">{job.source}</Badge>}
                    {job.pillar_id && <Badge variant="outline">{job.pillar_id}</Badge>}
                    <span className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString()}</span>
                  </div>
                  {job.topic && <p className="truncate text-sm">{job.topic}</p>}
                  {job.error_message && <p className="text-xs text-destructive">{job.error_message}</p>}
                  {stages.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {stages.map(([name, value]) => `${name} ${value}`).join(' · ')}
                      {d?.total ? ` · total ${formatDuration(d.total)}` : ''}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
