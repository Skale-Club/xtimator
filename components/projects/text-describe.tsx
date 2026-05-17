'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createTextRecording } from '@/lib/actions/recording'
import {
  storeClientSuggestion,
  type GenerateEstimateResponse,
} from '@/components/workspace/estimate/client-suggestion-toast'
import { ArrowLeft, Loader2 } from 'lucide-react'
import type { ProjectDetail } from '@/lib/queries/project'

interface TextDescribeProps {
  project: ProjectDetail
  companyId: string
  projectId: string
}

export function TextDescribe({ project, companyId, projectId }: TextDescribeProps) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const handleTextGenerate = async () => {
    if (!text.trim()) return

    setIsGenerating(true)
    try {
      // Step 1: Save text as a recording
      const result = await createTextRecording(projectId, text.trim())
      if (result.error || !result.data) {
        toast.error(result.error ?? 'Failed to save description')
        setIsGenerating(false)
        return
      }

      // Step 2: Trigger estimate generation
      const res = await fetch('/api/generate-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to generate estimate')
        setIsGenerating(false)
        return
      }

      const data: GenerateEstimateResponse = await res.json()

      // Step 3: Store client suggestion and navigate to estimate editor
      storeClientSuggestion(projectId, data.clientSuggestion ?? null)
      router.push(`/projects/${projectId}?tab=estimate&estimate=${data.estimateId}`)
    } catch (err) {
      console.error('Text describe error:', err)
      toast.error('Something went wrong. Please try again.')
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 h-14 border-b shrink-0">
        <Link
          href={`/projects/${projectId}`}
          className="flex items-center justify-center w-10 h-10 rounded-md hover:bg-muted transition-colors"
          aria-label="Back to project"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Link>
        <span className="text-sm font-medium text-foreground truncate flex-1">
          {project.name}
        </span>
      </header>

      {/* Main content — Phase 71-08: glass card wrapper with primary CTA */}
      <main className="flex-1 flex flex-col px-4 py-6 gap-6 min-h-0">
        {/* Textarea wrapped in glass card */}
        <Card variant="glass" className="flex-1 flex flex-col min-h-0 px-6 mx-auto w-full max-w-2xl">
          <label htmlFor="job-description" className="block text-sm font-medium text-foreground">
            Job Description
          </label>
          <textarea
            id="job-description"
            rows={12}
            minLength={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe the job here — for example: 'Pressure wash the driveway and two-car garage, remove mold from the north-facing fascia boards, and seal all concrete surfaces. Approximately 1,800 sq ft total.'"
            className="flex-1 min-h-[200px] w-full resize-none rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg-light)] px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[hsl(var(--primary))] focus-visible:shadow-glow-brand disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isGenerating}
          />
        </Card>

        {/* Footer primary (gradient) CTA */}
        <div className="shrink-0 mx-auto w-full max-w-2xl">
          <Button
            onClick={handleTextGenerate}
            disabled={!text.trim() || isGenerating}
            variant="primary"
            size="lg"
            className="w-full h-12 text-base font-semibold"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Saving & Generating…
              </>
            ) : (
              'Save & Generate Estimate'
            )}
          </Button>
        </div>
      </main>
    </div>
  )
}
