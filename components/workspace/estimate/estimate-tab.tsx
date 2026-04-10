'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { createBlankEstimate } from '@/lib/actions/estimate'
import type { EstimateWithSections, Estimate } from '@/lib/queries/estimate'
import type { Recording } from '@/lib/queries/recording'
import type { Photo } from '@/lib/queries/photo'
import { GenerationProgress } from './generation-progress'
import { EstimateEditor } from './estimate-editor'

interface EstimateTabProps {
  projectId: string
  companyId: string
  currentEstimate: EstimateWithSections | null
  allVersions: Estimate[]
  recordings: Recording[]
  photos: Photo[]
}

export function EstimateTab({
  projectId,
  companyId,
  currentEstimate,
  allVersions,
  recordings,
  photos,
}: EstimateTabProps) {
  const router = useRouter()
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStep, setGenerationStep] = useState(0)
  const [isCreatingBlank, setIsCreatingBlank] = useState(false)

  // Check prerequisites: at least one transcript or one photo
  const hasTranscript = recordings.some((r) => r.transcript && r.transcript.trim().length > 0)
  const hasPhotos = photos.length > 0
  const hasPrerequisites = hasTranscript || hasPhotos

  // -------------------------------------------------------------------------
  // Generation flow
  // -------------------------------------------------------------------------

  async function handleGenerate() {
    setIsGenerating(true)
    setGenerationStep(0)

    try {
      // Step 0: Analyze photos (if any)
      if (hasPhotos) {
        const photoRes = await fetch('/api/analyze-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        })
        if (!photoRes.ok) {
          const err = await photoRes.json().catch(() => ({}))
          throw new Error(err.error || 'Photo analysis failed')
        }
      }

      // Step 1: Generate estimate
      setGenerationStep(1)
      const genRes = await fetch('/api/generate-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}))
        throw new Error(err.error || 'Estimate generation failed')
      }

      // Step 2: Saving
      setGenerationStep(2)
      await new Promise((r) => setTimeout(r, 500))

      // Step 3: Done
      setGenerationStep(3)
      await new Promise((r) => setTimeout(r, 1000))

      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  // -------------------------------------------------------------------------
  // Blank estimate fallback
  // -------------------------------------------------------------------------

  async function handleCreateBlank() {
    setIsCreatingBlank(true)
    const result = await createBlankEstimate(projectId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Blank estimate created')
      router.refresh()
    }
    setIsCreatingBlank(false)
  }

  // -------------------------------------------------------------------------
  // Render: generation in progress
  // -------------------------------------------------------------------------

  if (isGenerating) {
    return <GenerationProgress currentStep={generationStep} />
  }

  // -------------------------------------------------------------------------
  // Render: has estimate -- show editor
  // -------------------------------------------------------------------------

  if (currentEstimate) {
    return (
      <EstimateEditor
        estimate={currentEstimate}
        versions={allVersions}
        projectId={projectId}
        companyId={companyId}
        recordings={recordings}
        photos={photos}
      />
    )
  }

  // -------------------------------------------------------------------------
  // Render: no estimate -- generation CTA
  // -------------------------------------------------------------------------

  return (
    <div className="flex items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center text-center pt-8 pb-6 space-y-4">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Generate AI Estimate</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Create a professional estimate from your audio recordings and photos using AI.
            </p>
          </div>

          {hasPrerequisites ? (
            <Button size="lg" onClick={handleGenerate} className="gap-2 min-h-[44px]">
              <Sparkles className="h-4 w-4" />
              Generate Estimate
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button size="lg" disabled className="gap-2 min-h-[44px]">
                      <Sparkles className="h-4 w-4" />
                      Generate Estimate
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add at least one audio recording or photo before generating an estimate.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <Button
            variant="link"
            size="sm"
            onClick={handleCreateBlank}
            disabled={isCreatingBlank}
            className="gap-1.5 text-muted-foreground"
          >
            <FileText className="h-3.5 w-3.5" />
            {isCreatingBlank ? 'Creating...' : 'Create Blank Estimate'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
