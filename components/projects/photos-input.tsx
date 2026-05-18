'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PhotoDropZone } from '@/components/workspace/photos/photo-drop-zone'
import {
  storeClientSuggestion,
  type GenerateEstimateResponse,
} from '@/components/workspace/estimate/client-suggestion-toast'
import { ArrowLeft, Loader2 } from 'lucide-react'
import type { Photo } from '@/lib/queries/photo'
import type { ProjectDetail } from '@/lib/queries/project'
import { useTranslation } from '@/lib/i18n/use-translation'

interface PhotosInputProps {
  project: ProjectDetail
  companyId: string
  projectId: string
}

export function PhotosInput({ project, companyId, projectId }: PhotosInputProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  const handlePhotosUploaded = useCallback((newPhotos: Photo[]) => {
    setPhotos((prev) => [...prev, ...newPhotos])
  }, [])

  const handleGenerateFromPhotos = async () => {
    if (photos.length === 0) return

    setIsGenerating(true)
    try {
      // Call generate-estimate API (already supports photos-only path)
      const res = await fetch('/api/generate-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? t('Failed to generate estimate'))
        setIsGenerating(false)
        return
      }

      const data: GenerateEstimateResponse = await res.json()

      // Store client suggestion and navigate to estimate editor
      storeClientSuggestion(projectId, data.clientSuggestion ?? null)
      router.push(`/projects/${projectId}?tab=estimate&estimate=${data.estimateId}`)
    } catch (err) {
      console.error('Photos input error:', err)
      toast.error(t('Something went wrong. Please try again.'))
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
          aria-label={t('Back to project')}
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Link>
        <span className="text-sm font-medium text-foreground truncate flex-1">
          {project.name}
        </span>
      </header>

      {/* Main content — Phase 71-08: glass card wrapper + primary CTA */}
      <main className="flex-1 flex flex-col px-4 py-6 gap-6 min-h-0 overflow-y-auto">
        {/* Photo upload section wrapped in glass card */}
        <Card variant="glass" className="flex-1 flex flex-col min-h-0 px-6 mx-auto w-full max-w-2xl">
          <PhotoDropZone
            projectId={projectId}
            companyId={companyId}
            currentCount={photos.length}
            maxPhotos={20}
            onPhotosUploaded={handlePhotosUploaded}
          />

          {/* Photo thumbnails */}
          {photos.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mt-4">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square rounded-md overflow-hidden bg-[var(--glass-bg-light)] border border-[var(--glass-border)]"
                >
                  {/* Placeholder for thumbnail - will show actual image with proper URL in production */}
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                    {t('Photo')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Footer primary (gradient) CTA */}
        <div className="shrink-0 mx-auto w-full max-w-2xl">
          <Button
            onClick={handleGenerateFromPhotos}
            disabled={photos.length === 0 || isGenerating}
            variant="primary"
            size="lg"
            className="w-full h-12 text-base font-semibold"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                {t('Analyzing Photos & Generating…')}
              </>
            ) : (
              t('Generate from Photos')
            )}
          </Button>
        </div>
      </main>
    </div>
  )
}