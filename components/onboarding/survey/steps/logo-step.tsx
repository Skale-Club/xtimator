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
}

export function LogoStep({
  values,
  logoPreview,
  setLogoFile,
  setLogoPreview,
}: Props) {
  function handleSelect(file: File, preview: string) {
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
      preview={logoPreview}
      companyInitial={
        values.companyName?.charAt(0)?.toUpperCase() || '?'
      }
      onFileSelect={handleSelect}
      onRemove={handleRemove}
    />
  )
}
