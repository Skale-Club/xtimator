'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLanguage, type Language } from '@/lib/i18n/language-context'

const CYCLE: Language[] = ['en', 'pt', 'es']
const LABELS: Record<Language, string> = { en: 'EN', pt: 'PT', es: 'ES' }
const ARIA_LABELS: Record<Language, string> = {
  en: 'Switch language: currently English',
  pt: 'Switch language: currently Português',
  es: 'Switch language: currently Español',
}

export function LanguageToggle() {
  const [mounted, setMounted] = useState(false)
  const { language, setLanguage } = useLanguage()

  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  const next = () => {
    const idx = CYCLE.indexOf(language)
    setLanguage(CYCLE[(idx + 1) % CYCLE.length])
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={next}
      aria-label={ARIA_LABELS[language]}
      className="cursor-pointer"
    >
      <span className="text-xs font-bold">{LABELS[language]}</span>
    </Button>
  )
}
