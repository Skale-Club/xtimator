'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createTextRecording } from '@/lib/actions/recording'
import { showBillingBlockToast } from '@/lib/billing/block-toast'
import { ArrowLeft, Loader2 } from 'lucide-react'
import type { ProjectDetail } from '@/lib/queries/project'
import { useTranslation } from '@/lib/i18n/use-translation'
import { waitForDedicatedEstimate } from './dedicated-generation-outcome'
import { useClientReady } from '@/hooks/use-client-ready'

interface TextDescribeProps {
  project: ProjectDetail
  companyId: string
  projectId: string
}

export function TextDescribe({ project, projectId }: TextDescribeProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const ready = useClientReady()
  const [text, setText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const handleTextGenerate = async () => {
    if (!text.trim()) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const attemptId = crypto.randomUUID()

    setIsGenerating(true)
    try {
      const saved = await createTextRecording(projectId, text.trim(), attemptId)
      if (saved.error || !saved.data) {
        if (!showBillingBlockToast((saved as { code?: unknown }).code, router, t)) {
          toast.error(saved.error ?? t('Failed to save description'))
        }
        setIsGenerating(false)
        return
      }

      const res = await fetch('/api/generate-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Phase 92 (EVENT-03 / D-07): explicit manual_text inputType for lineage.
        body: JSON.stringify({ projectId, attemptId, inputType: 'manual_text' }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error((data as { error?: string }).error ?? t('Failed to generate estimate'))
        setIsGenerating(false)
        return
      }

      const completed = await waitForDedicatedEstimate({
        projectId, attemptId, signal: controller.signal, router, t,
        vagueMessage: t('Description too vague — please add more detail with specific tasks, materials, and quantities'),
        timeoutMessage: t('Processing service is temporarily unavailable — your description is saved.'),
      })
      if (!completed && !controller.signal.aborted) setIsGenerating(false)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      console.error('Text describe error:', err)
      toast.error(t('Something went wrong. Please try again.'))
      setIsGenerating(false)
    }
  }

  return (
    // h-full: the capture layout already is the visible area (it follows the
    // phone keyboard), so the Generate button never sits behind the keyboard.
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 h-14 border-b shrink-0">
        <Link
          href={`/projects/${projectId}`}
          className="flex items-center justify-center w-10 h-10 rounded-md hover:bg-muted transition-colors"
          aria-label={t('Back to project')}
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Link>
        <span className="text-sm font-medium text-foreground truncate flex-1">
          {project.name}
        </span>
      </header>

      {/* Main content — Phase 71-08: glass card wrapper with primary CTA */}
      {/* The [html[data-keyboard=open]_&] classes compact the padding while typing so
          textarea + button fit above the keyboard on a small phone. */}
      <main className="flex-1 flex flex-col px-4 py-6 gap-6 min-h-0 [html[data-keyboard=open]_&]:py-2 [html[data-keyboard=open]_&]:gap-2">
        {/* Textarea wrapped in glass card */}
        <Card variant="glass" className="flex-1 flex flex-col min-h-0 px-6 mx-auto w-full max-w-2xl [html[data-keyboard=open]_&]:py-3 [html[data-keyboard=open]_&]:gap-2">
          <label htmlFor="job-description" className="block text-sm font-medium text-foreground">
            {t('Job Description')}
          </label>
          <textarea
            id="job-description"
            rows={12}
            minLength={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("Describe the job here | for example: 'Pressure wash the driveway and two-car garage, remove mold from the north-facing fascia boards, and seal all concrete surfaces. Approximately 1,800 sq ft total.'")}
            className="flex-1 min-h-[200px] [html[data-keyboard=open]_&]:min-h-[96px] w-full resize-none rounded-md border border-field-border bg-field px-4 py-3 text-sm leading-relaxed text-foreground hover:border-field-border-hover placeholder:text-field-placeholder focus-visible:outline-none focus-visible:border-[hsl(var(--primary))] focus-visible:shadow-glow-brand disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!ready || isGenerating}
          />
        </Card>

        {/* Footer primary (gradient) CTA */}
        <div className="shrink-0 mx-auto w-full max-w-2xl">
          <Button
            onClick={handleTextGenerate}
            disabled={!ready || !text.trim() || isGenerating}
            variant="primary"
            size="lg"
            className="w-full h-12 text-base font-semibold"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                {t('Saving & Generating…')}
              </>
            ) : (
              t('Save & Generate Estimate')
            )}
          </Button>
        </div>
      </main>
    </div>
  )
}
