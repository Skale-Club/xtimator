'use client'

import { useRef, useState, useCallback } from 'react'
import { Upload, CameraIcon, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { compressImage } from '@/lib/utils/image-compressor'
import { createClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'
import { createPhoto } from '@/lib/actions/photo'
import type { Photo } from '@/lib/queries/photo'

interface PhotoDropZoneProps {
  projectId: string
  companyId: string
  currentCount: number
  maxPhotos?: number
  onPhotosUploaded: (photos: Photo[]) => void
}

export function PhotoDropZone({
  projectId,
  companyId,
  currentCount,
  maxPhotos = 20,
  onPhotosUploaded,
}: PhotoDropZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 })

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'))
      if (fileArray.length === 0) {
        toast.error('No image files selected')
        return
      }

      // Enforce 20-photo limit
      if (currentCount + fileArray.length > maxPhotos) {
        const remaining = maxPhotos - currentCount
        toast.error(
          `Maximum ${maxPhotos} photos per project. You can add ${remaining} more.`
        )
        return
      }

      setIsUploading(true)
      setUploadProgress({ completed: 0, total: fileArray.length })

      const supabase = createClient()
      const storage = createStorage(supabase)
      const newPhotos: Photo[] = []

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]

        // Compress image, fallback to original on failure
        let blob: Blob
        try {
          blob = await compressImage(file, 2000, 0.85)
        } catch {
          blob = file
        }

        // Generate unique path
        const photoId = crypto.randomUUID()
        const storagePath = `${companyId}/${projectId}/${photoId}.jpg`

        // Upload to Supabase Storage
        try {
          await storage.upload('photos', storagePath, blob, {
            contentType: 'image/jpeg',
            upsert: false,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unknown error'
          toast.error(`Failed to upload photo ${i + 1}: ${message}`)
          continue
        }

        // Create DB record
        const result = await createPhoto(projectId, storagePath, currentCount + i)
        if ('error' in result) {
          toast.error(`Failed to save photo ${i + 1}`)
          continue
        }

        newPhotos.push(result.data as Photo)
        setUploadProgress({ completed: i + 1, total: fileArray.length })
      }

      setIsUploading(false)
      if (newPhotos.length > 0) {
        onPhotosUploaded(newPhotos)
        toast.success(`${newPhotos.length} photo${newPhotos.length > 1 ? 's' : ''} uploaded`)
      }
    },
    [projectId, companyId, currentCount, maxPhotos, onPhotosUploaded]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files)
      }
    },
    [processFiles]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files)
        e.target.value = ''
      }
    },
    [processFiles]
  )

  const remaining = maxPhotos - currentCount

  return (
    <div className="space-y-3">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Uploading {uploadProgress.completed}/{uploadProgress.total}...
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drop photos here or click to upload
            </p>
            <p className="text-xs text-muted-foreground">
              {currentCount} / {maxPhotos} photos
              {remaining > 0 && remaining < maxPhotos && ` (${remaining} remaining)`}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={remaining <= 0}
              >
                <Upload className="h-4 w-4 mr-1.5" />
                Upload Photos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => cameraInputRef.current?.click()}
                disabled={remaining <= 0}
              >
                <CameraIcon className="h-4 w-4 mr-1.5" />
                Take Photo
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
