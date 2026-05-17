'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { FlagUS, FlagBR, FlagES } from '@/components/app-shell/flags'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLanguage, type Language } from '@/lib/i18n/language-context'

const FLAG_CLASS = 'h-5 w-5 rounded-[3px] shrink-0'

const LANGUAGES: { value: Language; label: string; Flag: React.ComponentType<{ className?: string }> }[] = [
  { value: 'en', label: 'English',   Flag: FlagUS },
  { value: 'pt', label: 'Português', Flag: FlagBR },
  { value: 'es', label: 'Español',   Flag: FlagES },
]

export function LanguageToggle() {
  const [mounted, setMounted] = useState(false)
  const { language, setLanguage } = useLanguage()

  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  const current = LANGUAGES.find(l => l.value === language) ?? LANGUAGES[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Language: ${current.label}`}
          className="cursor-pointer"
        >
          <current.Flag className={FLAG_CLASS} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-44 glass-strong border border-[var(--glass-border)] shadow-glass"
      >
        {LANGUAGES.map(({ value, label, Flag }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setLanguage(value)}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <Flag className={FLAG_CLASS} />
            <span className="flex-1">{label}</span>
            {language === value && <Check className="h-4 w-4 text-primary shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
