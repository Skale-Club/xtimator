'use client'

import { Fragment, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { T } from '@/components/i18n/t'
import { useTranslation } from '@/lib/i18n/use-translation'
import {
  createTemplate,
  importApprovedTemplate,
  submitTemplateToMeta,
  checkTemplateStatus,
  updateTemplateAndResubmit,
  type TemplateRow,
} from '@/lib/actions/admin-whatsapp-templates'
import { WhatsAppTemplateComposer } from './whatsapp-template-composer'
import type { ComposerParam } from '@/lib/whatsapp/template-composer'
import { WHATSAPP_NOTIFICATION_EVENTS } from '@/lib/notifications/event-types'

// Full status map — every status Plan 179-03 (applyTemplateStatusUpdate /
// checkTemplateStatus's mapMetaEventToStatus) can write. Some statuses share
// a visual variant on purpose (e.g. draft/archived both 'outline',
// paused/flagged both 'warning') — distinctness for an admin comes from the
// always-rendered status TEXT in the badge, not from the variant alone. The
// `?? 'outline'` fallback below is reserved for a genuinely UNMAPPED future
// status, not for any of the 10 known ones here.
const STATUS_VARIANT: Record<
  string,
  'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'danger'
> = {
  approved: 'success',
  pending: 'secondary',
  draft: 'outline',
  rejected: 'destructive',
  paused: 'warning',
  disabled: 'danger',
  flagged: 'warning',
  in_appeal: 'secondary',
  locked: 'danger',
  archived: 'outline',
  incompatible: 'danger',
}

/**
 * Defensive parse of a stored `variables_schema` JSONB value into an ordered
 * `ComposerParam[]` for seeding the Edit & Resubmit composer. Never throws —
 * mirrors `parseComposerParams` in `lib/actions/admin-whatsapp-templates.ts`.
 */
function asComposerParams(raw: unknown): ComposerParam[] {
  return Array.isArray(raw)
    ? raw.filter(
        (p): p is ComposerParam =>
          !!p &&
          typeof p === 'object' &&
          typeof (p as Record<string, unknown>).label === 'string' &&
          typeof (p as Record<string, unknown>).example === 'string'
      )
    : []
}

export function WhatsAppTemplatesPanel({
  templates,
  metaConfigured = true,
}: {
  templates: TemplateRow[]
  metaConfigured?: boolean
}) {
  const router = useRouter()
  const { t } = useTranslation()
  const [pending, startTransition] = useTransition()
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [resubmitting, setResubmitting] = useState(false)

  const [name, setName] = useState('')
  const [language, setLanguage] = useState('en_US')
  const [event, setEvent] = useState('unbound')
  const [mode, setMode] = useState<'draft' | 'import'>('draft')

  function templateIdentity() {
    return {
      template_name: name.trim(),
      language_code: language.trim() || 'en_US',
      event_type: event === 'unbound' ? null : event,
    }
  }

  // The composer is the SINGLE create entry point — there is no separate
  // bare-form submit path. handleCreateSubmit is only ever invoked from the
  // composer's own gated Submit button (already validated client-side).
  function handleCreateSubmit({ bodyText, params }: { bodyText: string; params: ComposerParam[] }) {
    if (!name.trim()) {
      toast.error(t('Template name is required'))
      return
    }
    startTransition(async () => {
      const res = await createTemplate({
        ...templateIdentity(),
        body_text: bodyText,
        variables_schema: params,
      })
      if (res.ok) {
        toast.success(t('Template created'))
        setName('')
        router.refresh()
      } else {
        toast.error(res.error ?? t('Failed to create template'))
      }
    })
  }

  function handleImport() {
    if (!name.trim()) {
      toast.error(t('Template name is required'))
      return
    }
    startTransition(async () => {
      try {
        const result = await importApprovedTemplate(templateIdentity())
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        toast.success(t('Approved template imported'))
        router.refresh()
      } catch {
        toast.error(t('Could not import the approved template.'))
      }
    })
  }

  async function onSubmitToMeta(id: string) {
    setSubmittingId(id)
    const res = await submitTemplateToMeta(id)
    setSubmittingId(null)
    if (res.ok) {
      toast.success(t('Submitted to Meta for approval'))
      router.refresh()
      return
    }
    if (res.reason === 'scope') {
      toast.info(
        t(
          'Check that the Meta token has WhatsApp Business Management permission, then use Import approved template for templates already approved in Meta.'
        )
      )
      return
    }
    toast.error(res.error ?? t('Submit failed'))
  }

  async function handleCheckStatus(id: string) {
    setCheckingId(id)
    const res = await checkTemplateStatus(id)
    setCheckingId(null)
    if (res.ok) {
      toast.success(`${t('Status')}: ${res.status}`)
      router.refresh()
      return
    }
    toast.error(res.error ?? t('Status check failed'))
  }

  async function handleResubmit(id: string, input: { bodyText: string; params: ComposerParam[] }) {
    setResubmitting(true)
    const res = await updateTemplateAndResubmit(id, {
      body_text: input.bodyText,
      variables_schema: input.params,
    })
    setResubmitting(false)
    if (res.ok) {
      toast.success(t('Resubmitted for approval'))
      setEditingId(null)
      router.refresh()
      return
    }
    toast.error(res.error ?? res.errors?.join('; ') ?? t('Resubmit failed'))
  }

  return (
    <div id="whatsapp-template-manager" className="scroll-mt-8 space-y-8">
      <Card variant="glass" className="p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold mb-1">
            <T>WhatsApp templates</T>
          </h2>
          <p className="text-sm text-muted-foreground">
            <T>
              Bind a template to a notification event or leave it unbound for welcome and other separately configured messages.
            </T>
          </p>
        </div>
        {!metaConfigured && (
          <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
            <T>Set the Meta access token and business account ID in Integrations to import, submit or check templates.</T>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={mode === 'draft' ? 'default' : 'outline'} aria-pressed={mode === 'draft'} onClick={() => setMode('draft')}>
            <T>Compose draft</T>
          </Button>
          <Button type="button" variant={mode === 'import' ? 'default' : 'outline'} aria-pressed={mode === 'import'} onClick={() => setMode('import')}>
            <T>Import from Meta</T>
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">
              <T>Template name</T>
            </Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="owner_billing_alert"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-lang">
              <T>Language</T>
            </Label>
            <Input
              id="tpl-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="en_US"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-event">
              <T>Notification event</T>
            </Label>
            <Select value={event} onValueChange={setEvent}>
              <SelectTrigger id="tpl-event">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unbound">{t('No notification event')}</SelectItem>
                {WHATSAPP_NOTIFICATION_EVENTS.map((eventType) => (
                  <SelectItem key={eventType} value={eventType}>{eventType}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {event !== 'unbound' && (
          <p className="text-sm text-muted-foreground"><T text="Use body variable {{1}} for the title and {{2}} for the details." /></p>
        )}
        {mode === 'draft' ? (
          <WhatsAppTemplateComposer
            submitLabel={t('Create template')}
            pending={pending}
            onSubmit={handleCreateSubmit}
          />
        ) : (
          <Button type="button" onClick={handleImport} disabled={pending || !metaConfigured}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            <T>Import approved template</T>
          </Button>
        )}
      </Card>

      <Card variant="glass" className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">{t('Template')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('Language')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('Notification event')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('Status')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('Reason')}</th>
                <th className="text-right px-4 py-3 font-medium">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    <T>No templates yet. Create one above.</T>
                  </td>
                </tr>
              ) : (
                templates.map((row) => (
                  <Fragment key={row.id}>
                    <tr className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs">{row.template_name}</td>
                      <td className="px-4 py-3">{row.language_code}</td>
                      <td className="px-4 py-3">
                        {row.event_type ?? <span className="text-muted-foreground"><T>Unbound</T></span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[row.status] ?? 'outline'}>{row.status}</Badge>
                      </td>
                      <td className="px-4 py-3 max-w-[240px] truncate text-muted-foreground">
                        {row.rejection_reason ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                        {row.status === 'draft' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!metaConfigured || submittingId === row.id}
                            onClick={() => onSubmitToMeta(row.id)}
                          >
                            {submittingId === row.id ? (
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="mr-2 h-3.5 w-3.5" />
                            )}
                            <T>Submit to Meta</T>
                          </Button>
                        )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!metaConfigured || checkingId === row.id}
                            onClick={() => handleCheckStatus(row.id)}
                          >
                            {checkingId === row.id && (
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            )}
                            <T>Check status now</T>
                          </Button>
                        {row.meta_template_id && !row.quick_reply_count && (row.status === 'rejected' || row.status === 'approved') && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!metaConfigured}
                            onClick={() => setEditingId(editingId === row.id ? null : row.id)}
                          >
                            <T>Edit & Resubmit</T>
                          </Button>
                        )}
                      </td>
                    </tr>
                    {editingId === row.id && (
                      <tr className="bg-muted/10">
                        <td colSpan={6} className="px-4 py-4">
                          <WhatsAppTemplateComposer
                            key={row.id}
                            initialBodyText={row.body_text ?? ''}
                            initialParams={asComposerParams(row.variables_schema)}
                            submitLabel={t('Update & Resubmit')}
                            pending={resubmitting}
                            onSubmit={(input) => handleResubmit(row.id, input)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
