'use client'

import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { INDUSTRIES, resolveIndustries } from '@/lib/industries'

const LABEL_BY_ID = new Map(INDUSTRIES.map((i) => [i.id, i.label]))

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  logoPreview: string | null
  onNext: () => void
}

function dash(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'number') return String(v)
  return v.trim() === '' ? '—' : v
}

export function ReviewStep({ values, logoPreview }: Props) {
  const servicesLabel = resolveIndustries(values.industries, values.customIndustry)
    .map((v) => LABEL_BY_ID.get(v) ?? v)
    .join(', ')

  const rows: Array<[string, string]> = [
    ['Company name', dash(values.companyName)],
    ['Owner name', dash(values.ownerName)],
    ['Phone', dash(values.phone)],
    ['Email', dash(values.email)],
    ['Services', dash(servicesLabel)],
    ['Pre-fill price book', values.prefillPriceBook ? 'Yes' : 'No'],
    ['Brand color', dash(values.brandPrimaryColor)],
    ['Address', dash(values.address)],
    ['City / State / ZIP', dash(
      [values.city, values.state, values.zip].filter(Boolean).join(', ')
    )],
    ['License #', dash(values.licenseNumber)],
    ['Insurance', dash(values.insuranceInfo)],
    ['Tax rate', `${values.defaultTaxRate ?? 0}%`],
    ['Payment terms', dash(values.defaultPaymentTerms)],
    ['Warranty terms', dash(values.defaultWarrantyTerms)],
    ['Validity', `${values.defaultValidityDays ?? 30} days`],
  ]

  return (
    <div className="flex flex-col gap-4">
      {logoPreview ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoPreview}
            alt="Logo preview"
            className="h-12 w-12 rounded-md border border-border object-cover"
          />
          <span className="text-sm text-muted-foreground">Logo selected</span>
        </div>
      ) : null}

      <dl className="divide-y divide-border rounded-lg border border-border">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
