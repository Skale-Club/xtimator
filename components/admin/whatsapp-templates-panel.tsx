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
  submitTemplateToMeta,
  checkTemplateStatus,
  updateTemplateAndResubmit,
  type TemplateRow,
} from '@/lib/actions/admin-whatsapp-templates'
import { WhatsAppTemplateComposer } from './whatsapp-template-composer'
import type { ComposerParam } from '@/lib/whatsapp/template-composer'

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

export function WhatsAppTemplatesPanel({ templates }: { templates: TemplateRow[] }) {
  const router = useRouter()
  const { t } = useTranslation()
  const [pending, startTransition] = useTransition()
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [resubmitting, setResubmitting] = useState(false)

  const [name, setName] = useState('')
  const [language, setLanguage] = useState('en_US')
  const [category, setCategory] = useState<string>('billing')

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
        template_name: name.trim(),
        language_code: language.trim() || 'en_US',
        event_category: category,
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
          'Programmatic submit unavailable (token scope). Author + approve this template in Meta WhatsApp Manager, then register it here by name; the status webhook will sync it.'
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
    <div className="space-y-8">
      <Card variant="glass" className="p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold mb-1">
            <T>Create template</T>
          </h2>
          <p className="text-sm text-muted-foreground">
            <T>
              Register a WhatsApp notification template. The template name + language must match a
              template authored in Meta WhatsApp Manager under the platform WABA. Compose the body
              below by clicking &quot;Add variable&quot; — never type raw braces.
            </T>
          </p>
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
            <Label htmlFor="tpl-cat">
              <T>Category</T>
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="tpl-cat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="estimate">{t('Estimates')}</SelectItem>
                <SelectItem value="billing">{t('Billing')}</SelectItem>
                <SelectItem value="system">{t('System')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <WhatsAppTemplateComposer
          submitLabel={t('Create template')}
          pending={pending}
          onSubmit={handleCreateSubmit}
        />
      </Card>

      <Card variant="glass" className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">{t('Template')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('Language')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('Category')}</th>
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
                        {row.event_category ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
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
                            disabled={submittingId === row.id}
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
                        {row.meta_template_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={checkingId === row.id}
                            onClick={() => handleCheckStatus(row.id)}
                          >
                            {checkingId === row.id && (
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            )}
                            <T>Check status now</T>
                          </Button>
                        )}
                        {(row.status === 'rejected' || row.status === 'approved') && (
                          <Button
                            size="sm"
                            variant="outline"
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
