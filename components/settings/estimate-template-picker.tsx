'use client'

import Image from 'next/image'

import { ESTIMATE_TEMPLATES } from '@/lib/estimate/templates/registry'
import { useTranslation } from '@/lib/i18n/use-translation'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

// Intrinsic size of the generated thumbnails (scripts/generate-template-thumbnails.ts:
// US Letter page 1 rasterized at 480px wide). Used for width/height so the browser
// reserves the right aspect ratio before the image loads (no layout shift).
const THUMBNAIL_WIDTH = 480
const THUMBNAIL_HEIGHT = 621

interface EstimateTemplatePickerProps {
  value: string
  onValueChange: (value: string) => void
}

/**
 * Estimate Design picker: one clickable card per template, each with a page-1
 * preview of the REAL PDF output above its radio + text. Radix RadioGroup
 * semantics and keyboard behaviour (arrow keys, roving tabindex) are unchanged;
 * the whole card is the <label> for its radio. Two columns at every width -
 * even at 360px each card stays ~130px wide, enough to tell the layouts apart.
 */
export function EstimateTemplatePicker({ value, onValueChange }: EstimateTemplatePickerProps) {
  const { t } = useTranslation()
  return (
    <RadioGroup value={value} onValueChange={onValueChange} className="mt-2 grid max-w-xl grid-cols-2 gap-3">
      {ESTIMATE_TEMPLATES.map((tpl) => (
        <label
          key={tpl.id}
          htmlFor={`estimate-template-${tpl.id}`}
          className="flex cursor-pointer flex-col gap-3 rounded-lg border border-border p-3 transition-shadow hover:bg-muted/20 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50"
        >
          <Image
            src={tpl.thumbnail}
            alt={`${t(tpl.label)} ${t('template preview')}`}
            width={THUMBNAIL_WIDTH}
            height={THUMBNAIL_HEIGHT}
            // Tiny pre-optimized static WebP: skip the /_next/image round trip.
            unoptimized
            sizes="(min-width: 1024px) 240px, 45vw"
            className="h-auto w-full rounded-md border border-border bg-white shadow-sm"
          />
          <span className="flex items-start gap-2">
            <RadioGroupItem value={tpl.id} id={`estimate-template-${tpl.id}`} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium text-foreground">{t(tpl.label)}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t(tpl.description)}</span>
            </span>
          </span>
        </label>
      ))}
    </RadioGroup>
  )
}
