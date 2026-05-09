'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Edit3, Loader2, Send, Mic, ChevronDown, ChevronUp, Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { VoiceRefineRecorder } from './voice-refine-recorder'

interface RefineEstimatePanelProps {
  estimateId: string
  projectId: string
  onRefined: () => void
}

export function RefineEstimatePanel({
  estimateId,
  projectId,
  onRefined,
}: RefineEstimatePanelProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [voiceExpanded, setVoiceExpanded] = useState(false)
  const [photoExpanded, setPhotoExpanded] = useState(false)
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false)
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([])

  const handleRefine = useCallback(async () => {
    if (!instruction.trim() || isLoading) return

    setIsLoading(true)
    try {
      const res = await fetch(`/api/estimates/${estimateId}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: instruction.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Refinement failed')
      }

      toast.success(`Estimate refined — v${data.newVersion}`)
      setInstruction('')
      setIsOpen(false)
      onRefined()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Refinement failed')
    } finally {
      setIsLoading(false)
    }
  }, [instruction, isLoading, estimateId, onRefined, router])

  const handlePhotoRefine = useCallback(async () => {
    if (selectedPhotos.length === 0 || isUploadingPhotos) return

    setIsUploadingPhotos(true)
    try {
      const formData = new FormData()
      for (const photo of selectedPhotos) {
        formData.append('photos', photo)
      }

      const res = await fetch(`/api/estimates/${estimateId}/refine/photo`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Photo refinement failed')
      }

      toast.success(`Estimate refined — v${data.newVersion}`)
      setSelectedPhotos([])
      setPhotoExpanded(false)
      setIsOpen(false)
      onRefined()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Photo refinement failed')
    } finally {
      setIsUploadingPhotos(false)
    }
  }, [selectedPhotos, isUploadingPhotos, estimateId, onRefined, router])

  const handlePhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      setSelectedPhotos(Array.from(files).slice(0, 5)) // Max 5 photos
    }
  }, [])

  return (
    <Card className="p-4">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between text-left hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-2">
          <Edit3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Refine this estimate</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {isOpen ? 'Click to collapse' : 'Click to refine'}
        </span>
      </button>

      {/* Panel content */}
      {isOpen && (
        <div className="mt-4 space-y-3">
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="What should I change? e.g. 'Add gutter cleaning, about 80 linear feet'"
            rows={3}
            disabled={isLoading}
          />

          {/* Voice recorder toggle */}
          {!voiceExpanded && (
            <button
              type="button"
              onClick={() => setVoiceExpanded(true)}
              disabled={isLoading}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Mic className="h-4 w-4" />
              <span>Or record your instruction</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Voice recorder */}
          {voiceExpanded && (
            <div className="space-y-3 rounded-md border border-dashed border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Voice instruction</span>
                <button
                  type="button"
                  onClick={() => setVoiceExpanded(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              </div>
              <VoiceRefineRecorder
                estimateId={estimateId}
                onRecorded={async (transcript) => {
                  if (!transcript.trim()) {
                    toast.error("We couldn't catch any speech — please try again or type your instruction.")
                    return
                  }
                  setIsLoading(true)
                  try {
                    const res = await fetch(`/api/estimates/${estimateId}/refine`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ instruction: transcript.trim() }),
                    })

                    const data = await res.json()

                    if (!res.ok) {
                      throw new Error(data.error ?? 'Refinement failed')
                    }

                    toast.success(`Estimate refined — v${data.newVersion}`)
                    setVoiceExpanded(false)
                    setInstruction('')
                    setIsOpen(false)
                    onRefined()
                    router.refresh()
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Refinement failed')
                  } finally {
                    setIsLoading(false)
                  }
                }}
disabled={isLoading || isUploadingPhotos}
              />
            </div>
          )}

          {/* Photo upload toggle */}
          {!photoExpanded && !voiceExpanded && (
            <button
              type="button"
              onClick={() => setPhotoExpanded(true)}
              disabled={isLoading}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Camera className="h-4 w-4" />
              <span>Or upload photos to refine</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Photo upload section */}
          {photoExpanded && (
            <div className="space-y-3 rounded-md border border-dashed border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Photo instruction</span>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoExpanded(false)
                    setSelectedPhotos([])
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoSelect}
                  disabled={isUploadingPhotos}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                />
                {selectedPhotos.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedPhotos.length} photo(s) selected (max 5)
                  </p>
                )}
                <Button
                  size="sm"
                  onClick={handlePhotoRefine}
                  disabled={selectedPhotos.length === 0 || isUploadingPhotos}
                  className="gap-1.5 w-full"
                >
                  {isUploadingPhotos ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Camera className="h-3.5 w-3.5" />
                      Refine with Photos
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleRefine}
              disabled={!instruction.trim() || isLoading || isUploadingPhotos}
              className="gap-1.5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Refining...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Refine Estimate
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}