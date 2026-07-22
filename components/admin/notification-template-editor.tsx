'use client'

import { useMemo, useState, useTransition } from 'react'
import { Loader2, Mail, MessageSquare, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { T } from '@/components/i18n/t'
import { useTranslation } from '@/lib/i18n/use-translation'
import {
  saveNotificationTemplate,
  sendTestNotification,
  type NotificationTemplateRow,
  type TestSendTarget,
} from '@/lib/actions/admin-notification-templates'
import { getEventVariableCatalog } from '@/lib/notifications/template-catalog'
import { EVENT_TEMPLATE_SEED } from '@/lib/notifications/template-seed'
import { SAMPLE_COPY_CONTEXT } from '@/lib/notifications/sample-context'
import { validateTemplateVariables } from '@/lib/notifications/template-validation'
import { renderTemplate, type TemplateVars, type RenderChannel } from '@/lib/notifications/template-engine'
import type { EventType } from '@/lib/notifications/event-types'
import type { TemplateChannel } from '@/lib/notifications/template-resolver'

interface NotificationTemplateEditorProps {
  eventType: EventType
  channel: TemplateChannel
  existing: NotificationTemplateRow | null
  onSaved?: () => void
}

/**
 * Per-(event, channel) editor. This component is meant to be mounted with a
 * `key={`${eventType}:${channel}`}` by its parent (notification-templates-panel.tsx)
 * so every field below is safely seeded ONCE from props via lazy useState
 * initializers — switching selection remounts a fresh instance instead of
 * stale-merging state across two different templates.
 */
export function NotificationTemplateEditor({
  eventType,
  channel,
  existing,
  onSaved,
}: NotificationTemplateEditorProps) {
  const { t } = useTranslation()
  const [pending, startTransition] = useTransition()
  const [testingTarget, setTestingTarget] = useState<TestSendTarget | null>(null)

  const seed = EVENT_TEMPLATE_SEED[eventType]

  const [subject, setSubject] = useState(() =>
    existing ? (existing.subject ?? '') : channel === 'email' ? seed.title : '',
  )
  const [title, setTitle] = useState(() =>
    existing ? (existing.title ?? '') : channel === 'in_app' ? seed.title : '',
  )
  const [body, setBody] = useState(() => (existing ? existing.body : seed.body))
  const [isActive, setIsActive] = useState(() => (existing ? existing.is_active : true))
  // Local-only, never persisted — see sendTestNotification's SendTestInput contract.
  const [phone, setPhone] = useState('')

  const variables = getEventVariableCatalog(eventType)

  const validation = useMemo(
    () =>
      validateTemplateVariables(eventType, {
        subject: channel === 'email' ? subject : undefined,
        title: channel === 'in_app' ? title : undefined,
        body,
      }),
    [eventType, channel, subject, title, body],
  )

  const previewMode: RenderChannel = channel === 'email' ? 'html' : 'text'
  const previewOutput = renderTemplate(
    body,
    SAMPLE_COPY_CONTEXT[eventType] as unknown as TemplateVars,
    previewMode,
  )

  function insertVariable(name: string) {
    setBody((prev) => `${prev}{{${name}}}`)
  }

  function handleSave() {
    if (!validation.valid) return
    startTransition(async () => {
      const res = await saveNotificationTemplate({
        scope: 'tenant',
        eventType,
        channel,
        subject: channel === 'email' ? subject : null,
        title: channel === 'in_app' ? title : null,
        body,
        isActive,
      })
      if (res.ok) {
        toast.success(t('Template saved'))
        onSaved?.()
      } else {
        toast.error(res.error ?? t('Failed to save template'))
      }
    })
  }

  async function handleTestSend(target: TestSendTarget) {
    if (target === 'sms' && !phone.trim()) {
      toast.error(t('Enter a phone number to send a test SMS.'))
      return
    }
    setTestingTarget(target)
    const res = await sendTestNotification({
      eventType,
      subject: channel === 'email' ? subject : null,
      title: channel === 'in_app' ? title : null,
      body,
      target,
      toPhone: target === 'sms' ? phone.trim() : undefined,
    })
    setTestingTarget(null)
    if (res.ok) {
      toast.success(t('Test sent'))
    } else {
      toast.error(res.message ?? t('Test send failed'))
    }
  }

  return (
    <Card variant="glass" className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">{seed.title}</h3>
          <p className="text-xs font-mono text-muted-foreground">
            {eventType} · {channel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="tpl-active" className="text-sm">
            <T>Active</T>
          </Label>
          <Switch id="tpl-active" checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>
          <T>Variables</T>
        </Label>
        {variables.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <T>This event has no editable variables — its copy must stay static.</T>
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {variables.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => insertVariable(name)}
                className="rounded-full border border-input px-2.5 py-1 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-[var(--glass-bg-light)] transition-colors"
              >
                {`{{${name}}}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {channel === 'email' && (
        <div className="space-y-1.5">
          <Label htmlFor="tpl-subject">
            <T>Subject</T>
          </Label>
          <Input id="tpl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
      )}

      {channel === 'in_app' && (
        <div className="space-y-1.5">
          <Label htmlFor="tpl-title">
            <T>Title</T>
          </Label>
          <Input id="tpl-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="tpl-body">
          <T>Body</T>
        </Label>
        <Textarea
          id="tpl-body"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={!validation.valid}
        />
        {!validation.valid && (
          <p data-testid="tpl-body-error" className="text-sm text-destructive">
            {validation.error}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>
          <T>Live preview (sample data)</T>
        </Label>
        <div className="rounded-[var(--radius-md)] border border-input bg-muted/20 p-3 text-sm">
          {previewMode === 'html' ? (
            <div dangerouslySetInnerHTML={{ __html: previewOutput }} />
          ) : (
            <pre className="whitespace-pre-wrap font-sans">{previewOutput}</pre>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tpl-test-phone">
          <T>Test SMS phone (E.164)</T>
        </Label>
        <Input
          id="tpl-test-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+15551234567"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--glass-border)]">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={testingTarget !== null}
            onClick={() => handleTestSend('email')}
          >
            {testingTarget === 'email' ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mail className="mr-1.5 h-3.5 w-3.5" />
            )}
            <T>Email</T>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={testingTarget !== null}
            onClick={() => handleTestSend('sms')}
          >
            {testingTarget === 'sms' ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            )}
            <T>SMS</T>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={testingTarget !== null}
            onClick={() => handleTestSend('telegram')}
          >
            {testingTarget === 'telegram' ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" />
            )}
            <T>Telegram</T>
          </Button>
        </div>

        <Button type="button" disabled={pending || !validation.valid} onClick={handleSave}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <T>Save</T>
        </Button>
      </div>
    </Card>
  )
}
