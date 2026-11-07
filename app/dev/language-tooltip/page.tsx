'use client'

import { useState } from 'react'
import { notFound } from 'next/navigation'
import { ContextualTooltip, TOOLTIP_KEYS } from '@/components/tour/contextual-tooltip'
import { LanguageToggle } from '@/components/app-shell/language-toggle'
import { TooltipProvider } from '@/components/ui/tooltip'

/** Dev-only: the top bar's language hint + menu, composed exactly as in topbar.tsx. */
export default function LanguageTooltipPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Preview />
}

function Preview() {
  const [open, setOpen] = useState(false)
  return <TooltipProvider>
    <main className="flex min-h-dvh justify-end bg-background p-6">
      <ContextualTooltip
        tooltipKey={TOOLTIP_KEYS.languageToggle}
        text="Switch languages | estimates can be sent in EN, PT, or ES"
        side="left"
        suppressed={open}
      >
        <span data-tour="language-toggle">
          <LanguageToggle onOpenChange={setOpen} />
        </span>
      </ContextualTooltip>
    </main>
  </TooltipProvider>
}
