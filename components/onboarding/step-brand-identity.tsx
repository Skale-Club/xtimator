'use client'

import type { UseFormReturn } from 'react-hook-form'
import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { Separator } from '@/components/ui/separator'
import { IndustrySelector } from '@/components/onboarding/industry-selector'
import { ColorPicker } from '@/components/onboarding/color-picker'
import { LogoUploader } from '@/components/onboarding/logo-uploader'

interface StepBrandIdentityProps {
  form: UseFormReturn<OnboardingValues>
  logoFile: File | null
  logoPreview: string | null
  onLogoChange: (file: File | null, preview: string | null) => void
}

export function StepBrandIdentity({
  form,
  logoPreview,
  onLogoChange,
}: StepBrandIdentityProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold leading-[1.2]">Brand Identity</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose your industry and customize your brand.
        </p>
      </div>

      {/* Industry selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">
          Select Your Industry
        </label>
        <IndustrySelector
          value={form.watch('industry')}
          customValue={form.watch('customIndustry')}
          onChange={(id) => form.setValue('industry', id)}
          onCustomChange={(value) => form.setValue('customIndustry', value)}
        />
      </div>

      <Separator />

      {/* Brand color */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">
          Brand Color
        </label>
        <ColorPicker
          value={form.watch('brandPrimaryColor')}
          onChange={(color) => form.setValue('brandPrimaryColor', color)}
        />
      </div>

      <Separator />

      {/* Logo upload */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">
          Upload Logo
        </label>
        <LogoUploader
          preview={logoPreview}
          companyInitial={
            form.watch('companyName')?.charAt(0)?.toUpperCase() || '?'
          }
          onFileSelect={(file, preview) => onLogoChange(file, preview)}
          onRemove={() => onLogoChange(null, null)}
        />
      </div>
    </div>
  )
}
