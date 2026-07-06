'use client'

import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { INDUSTRIES, resolveIndustries, isKnownIndustry } from '@/lib/industries'

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
  const servicesLabel = resolveIndustries([...values.industries, ...values.customIndustries])
    .map((v) => LABEL_BY_ID.get(v) ?? v)
    .join(', ')

  // Surface a soft warning for custom / unrecognized industries. They're allowed
  // (the selector supports free-text), but an unknown industry doesn't match a
  // curated template or knowledge-base scope — and a mismatched pick (e.g.
  // "Technology" for a cleaning business) silently degrades AI results. Uses the
  // existing isKnownIndustry() helper; empty for standard selections.
  const unknownIndustries = [...values.industries, ...values.customIndustries].filter(
    (v) => v.trim() !== '' && !isKnownIndustry(v),
  )

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

      {unknownIndustries.length > 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <span className="font-medium">Double-check your services:</span>{' '}
          {unknownIndustries.join(', ')}{' '}
          {unknownIndustries.length === 1 ? 'is a custom entry' : 'are custom entries'} that
          won&rsquo;t match a built-in template. If one of the standard trades fits your
          business, pick it for better AI estimates.
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
