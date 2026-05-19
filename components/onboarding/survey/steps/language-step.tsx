'use client'

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { FlagUS, FlagBR, FlagES } from '@/components/app-shell/flags'
import { useLanguage } from '@/lib/i18n/language-context'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

const FLAG_CLASS = 'h-5 w-5 rounded-[3px] shrink-0'

const LANG_OPTIONS = [
  { value: 'en' as EstimateLanguage, label: 'English', sublabel: 'Default', Flag: FlagUS },
  { value: 'pt' as EstimateLanguage, label: 'Português (BR)', sublabel: null, Flag: FlagBR },
  { value: 'es' as EstimateLanguage, label: 'Español', sublabel: null, Flag: FlagES },
]

interface LanguageStepProps {
  value: EstimateLanguage | undefined
  onChange: (lang: EstimateLanguage) => void
}

export function LanguageStep({ value, onChange }: LanguageStepProps) {
  const { setLanguage } = useLanguage()

  const selected = value ?? 'en'

  function handleSelect(lang: EstimateLanguage) {
    onChange(lang)
    setLanguage(lang)
  }

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        value={selected}
        onValueChange={(v) => handleSelect(v as EstimateLanguage)}
        className="flex flex-col gap-2"
      >
        {LANG_OPTIONS.map(({ value: optValue, label, sublabel, Flag }) => {
          const isSelected = selected === optValue
          return (
            <label
              key={optValue}
              htmlFor={`lang-${optValue}`}
              className={[
                'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-[var(--glass-border)] hover:bg-muted/40',
              ].join(' ')}
            >
              <Flag className={FLAG_CLASS} />
              <span className="flex-1">
                <span className="font-medium">{label}</span>
                {sublabel ? (
                  <span className="ml-2 text-sm text-muted-foreground">{sublabel}</span>
                ) : null}
              </span>
              <RadioGroupItem
                id={`lang-${optValue}`}
                value={optValue}
                aria-label={label}
              />
            </label>
          )
        })}
      </RadioGroup>

      <p className="text-sm text-muted-foreground">
        Your estimates will default to this language. You can change it per estimate when needed.
      </p>
    </div>
  )
}
