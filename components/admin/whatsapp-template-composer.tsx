'use client'

import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { T } from '@/components/i18n/t'
import { useTranslation } from '@/lib/i18n/use-translation'
import {
  nextVariableToken,
  validateComposerTemplate,
  type ComposerParam,
} from '@/lib/whatsapp/template-composer'

interface WhatsAppTemplateComposerProps {
  initialBodyText?: string
  initialParams?: ComposerParam[]
  onSubmit: (input: { bodyText: string; params: ComposerParam[] }) => void
  submitLabel: string
  pending?: boolean
}

/**
 * Phase 179 Plan 04 — Task 1.
 *
 * Ordered-variable HSM body composer: an admin builds a WhatsApp template
 * body EXCLUSIVELY by clicking "Add variable" (never free-typing `{{n}}`
 * braces), mirroring the `insertVariable`-by-click pattern already proven in
 * `notification-template-editor.tsx` (Phase 173). Every inserted token is
 * derived via `nextVariableToken`, so it is sequential by construction.
 *
 * Reusable for BOTH the create flow and the Edit & Resubmit flow — the
 * parent panel is expected to mount this with a `key` when switching between
 * two different rows (matching the Interface-First remount-by-key
 * convention), and `initialBodyText`/`initialParams` are read via LAZY
 * `useState` initializers so a fresh mount always re-seeds cleanly instead of
 * stale-merging state from a previously edited row.
 */
export function WhatsAppTemplateComposer({
  initialBodyText,
  initialParams,
  onSubmit,
  submitLabel,
  pending,
}: WhatsAppTemplateComposerProps) {
  const { t } = useTranslation()
  const [bodyText, setBodyText] = useState(() => initialBodyText ?? '')
  const [params, setParams] = useState<ComposerParam[]>(() => initialParams ?? [])

  function addVariable() {
    const token = nextVariableToken(params)
    setParams((prev) => [...prev, { label: '', example: '' }])
    setBodyText((prev) => (prev.trim() ? `${prev} ${token}` : token))
  }

  function removeLastVariable() {
    if (params.length === 0) return
    const lastIndex = params.length
    setParams((prev) => prev.slice(0, -1))
    setBodyText((prev) => prev.replace(`{{${lastIndex}}}`, ''))
  }

  function updateParam(index: number, field: 'label' | 'example', value: string) {
    setParams((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  const validation = useMemo(() => validateComposerTemplate(bodyText, params), [bodyText, params])
  const previewText = useMemo(
    () => bodyText.replace(/\{\{(\d+)\}\}/g, (match, n) => params[Number(n) - 1]?.example || match),
    [bodyText, params],
  )

  function handleSubmit() {
    if (!validation.valid) return
    onSubmit({ bodyText: bodyText.trim(), params })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="wa-tpl-body">
          <T>Body</T>
        </Label>
        <Textarea
          id="wa-tpl-body"
          rows={4}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          aria-invalid={!validation.valid}
        />
      </div>

      {params.length > 0 && (
        <div className="space-y-3">
          {params.map((param, i) => (
            <div
              key={i}
              className="grid gap-2 sm:grid-cols-[auto_1fr_1fr] sm:items-end"
              data-testid={`wa-tpl-param-row-${i}`}
            >
              <span className="font-mono text-xs text-muted-foreground">{`{{${i + 1}}}`}</span>
              <div className="space-y-1">
                <Label htmlFor={`wa-tpl-param-${i}-label`} className="text-xs">
                  <T>Label</T>
                </Label>
                <Input
                  id={`wa-tpl-param-${i}-label`}
                  value={param.label}
                  onChange={(e) => updateParam(i, 'label', e.target.value)}
                  placeholder={t('Client name')}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`wa-tpl-param-${i}-example`} className="text-xs">
                  <T>Example</T>
                </Label>
                <Input
                  id={`wa-tpl-param-${i}-example`}
                  value={param.example}
                  onChange={(e) => updateParam(i, 'example', e.target.value)}
                  placeholder={t('John Smith')}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addVariable}>
          <T>Add variable</T>
        </Button>
        {params.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={removeLastVariable}>
            <T>Remove last variable</T>
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>
          <T>Live preview</T>
        </Label>
        <div className="rounded-[var(--radius-md)] border border-input bg-muted/20 p-3 text-sm">
          <pre className="whitespace-pre-wrap font-sans">{previewText}</pre>
        </div>
      </div>

      {!validation.valid && (
        <div data-testid="composer-body-error" className="space-y-0.5 text-sm text-destructive">
          {validation.errors.map((err, i) => (
            <p key={i}>{err}</p>
          ))}
        </div>
      )}

      <Button type="button" disabled={!validation.valid || pending} onClick={handleSubmit}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </div>
  )
}
