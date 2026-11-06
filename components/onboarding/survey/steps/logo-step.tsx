'use client'

import { LogoUploader } from '@/components/onboarding/logo-uploader'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  logoFile: File | null
  setLogoFile: (f: File | null) => void
  logoPreview: string | null
  setLogoPreview: (p: string | null) => void
  onNext: () => void
  logoUploadStatus?: 'uploading' | 'saved' | 'error'
  onRetryLogo?: () => void
}

export function LogoStep({
  values,
  setValue,
  logoPreview,
  setLogoFile,
  setLogoPreview,
  logoUploadStatus,
  onRetryLogo,
}: Props) {
  function handleSelect(file: File, preview: string) {
    setValue('logoUrl', '')
    if (logoPreview && logoPreview !== preview) {
      try {
        URL.revokeObjectURL(logoPreview)
      } catch {
        // ignore
      }
    }
    setLogoFile(file)
    setLogoPreview(preview)
  }

  function handleRemove() {
    setValue('logoUrl', '')
    if (logoPreview) {
      try {
        URL.revokeObjectURL(logoPreview)
      } catch {
        // ignore
      }
    }
    setLogoFile(null)
    setLogoPreview(null)
  }

  return (
    <LogoUploader
      presentation="onboarding"
      preview={logoPreview}
      status={logoUploadStatus ?? (values.logoUrl ? 'saved' : 'selected')}
      onRetry={onRetryLogo}
      onFileSelect={handleSelect}
      onRemove={handleRemove}
    />
  )
}
