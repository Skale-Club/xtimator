'use client'

import { useEffect, useState, startTransition } from 'react'
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
import {
  popStoredClientSuggestion,
  showClientSuggestionToast,
  type GenerateEstimateResponse,
} from './client-suggestion-toast'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useLanguage } from '@/lib/i18n/language-context'
import { EstimateLanguageSelector } from '@/components/estimate/estimate-language-selector'
import {
  type EstimateLanguage,
  resolveEstimateLanguageWithSource,
} from '@/lib/i18n/resolve-estimate-language'

interface EstimateTabProps {
  projectId: string
  companyId: string
  currentEstimate: EstimateWithSections | null
  allVersions: Estimate[]
  recordings: Recording[]
  photos: Photo[]
  /** R6 — passed through to EstimateEditor's floating action bar. */
  onRecord?: () => void
  linkClientSlot?: React.ReactNode
}

export function EstimateTab({
  projectId,
  companyId,
  currentEstimate,
  allVersions,
  recordings,
  photos,
  onRecord,
  linkClientSlot,
}: EstimateTabProps) {
  const { t } = useTranslation()
  const { language: appLanguage } = useLanguage()
  const router = useRouter()
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStep, setGenerationStep] = useState(0)
  const [isCreatingBlank, setIsCreatingBlank] = useState(false)

  // Resolve estimate language via cascade (layers 4+5 available client-side)
  const cascadeResult = resolveEstimateLanguageWithSource({
    userAppLanguage: appLanguage as EstimateLanguage,
  })
  const [estimateLanguage, setEstimateLanguage] = useState<EstimateLanguage>(cascadeResult.language)

  const CASCADE_HINT: Partial<Record<typeof cascadeResult.source, string>> = {
    user: t('Defaulted from your app language'),
    company: t('Defaulted from your company settings'),
    client: t('Defaulted from client preference'),
  }

  useEffect(() => {
    const suggestion = popStoredClientSuggestion(projectId)
    if (suggestion) {
      queueMicrotask(() => {
        showClientSuggestionToast({ projectId, router, suggestion })
      })
    }
  }, [projectId, router])

  // Check prerequisites: at least one transcript or one photo
  const hasTranscript = recordings.some((r) => r.transcript && r.transcript.trim().length > 0)
  const hasPhotos = photos.length > 0
  const hasPrerequisites = hasTranscript || hasPhotos

  // -------------------------------------------------------------------------
  // Generation flow
  // -------------------------------------------------------------------------

  async function handleGenerate() {
    startTransition(() => {
      setIsGenerating(true)
      setGenerationStep(0)
    })

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
          throw new Error(err.error || t('Photo analysis failed'))
        }
      }

      // Step 1: Generate estimate (forward language override to cascade)
      setGenerationStep(1)
      const genRes = await fetch('/api/generate-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, language: estimateLanguage }),
      })
      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}))
        throw new Error(err.error || t('Estimate generation failed'))
      }
      const generated = (await genRes.json()) as GenerateEstimateResponse

      // Step 2: Saving
      setGenerationStep(2)
      await new Promise((r) => setTimeout(r, 500))

      // Step 3: Done
      setGenerationStep(3)
      await new Promise((r) => setTimeout(r, 1000))

      router.refresh()
      showClientSuggestionToast({
        projectId,
        router,
        suggestion: generated.clientSuggestion,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Generation failed. Please try again.'))
    } finally {
      setIsGenerating(false)
    }
  }

  // -------------------------------------------------------------------------
  // Blank estimate fallback
  // -------------------------------------------------------------------------

  async function handleCreateBlank() {
    startTransition(() => setIsCreatingBlank(true))
    const result = await createBlankEstimate(projectId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(t('Blank estimate created'))
      router.refresh()
    }
    startTransition(() => setIsCreatingBlank(false))
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
        onRecord={onRecord}
        linkClientSlot={linkClientSlot}
      />
    )
  }

  // -------------------------------------------------------------------------
  // Render: no estimate -- generation CTA
  // -------------------------------------------------------------------------

  return (
    <div className="flex items-center justify-center py-16">
      <Card variant="glass" className="w-full max-w-md">
        <CardContent className="flex flex-col items-center text-center pt-8 pb-6 space-y-4">
          <div className="h-14 w-14 rounded-full gradient-brand shadow-glow-brand flex items-center justify-center">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">{t('Generate AI Estimate')}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t('Create a professional estimate from your audio recordings and photos using AI.')}
            </p>
          </div>

          <EstimateLanguageSelector
            value={estimateLanguage}
            onChange={setEstimateLanguage}
            hint={CASCADE_HINT[cascadeResult.source]}
          />

          {hasPrerequisites ? (
            <Button variant="primary" size="lg" onClick={handleGenerate} className="gap-2 min-h-[44px]">
              <Sparkles className="h-4 w-4" />
              {t('Generate Estimate')}
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="primary" size="lg" disabled className="gap-2 min-h-[44px]">
                      <Sparkles className="h-4 w-4" />
                      {t('Generate Estimate')}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('Add at least one audio recording or photo before generating an estimate.')}</p>
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
            {isCreatingBlank ? t('Creating...') : t('Create Blank Estimate')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
