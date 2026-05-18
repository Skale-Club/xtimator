'use client'

import { useState, forwardRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n/use-translation'

interface MaskedKeyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** When set and input is untouched, render a masked preview ••••••••••••{last4} */
  initialLast4?: string | null
}

/**
 * Wraps shadcn Input with a default password type and a trailing eye-toggle
 * that flips between masked and visible. Mirrors the show/hide pattern from
 * app/(auth)/login/page.tsx:103-111.
 *
 * When `initialLast4` is provided AND the user has not yet focused/typed,
 * the placeholder shows ••••••••••••{last4} so the admin sees that *something*
 * is configured without ever exposing the plaintext to the client.
 */
export const MaskedKeyInput = forwardRef<HTMLInputElement, MaskedKeyInputProps>(
  function MaskedKeyInput(
    { initialLast4, placeholder, onFocus, className, ...props },
    ref
  ) {
    const [reveal, setReveal] = useState(false)
    const [touched, setTouched] = useState(false)
    const { t } = useTranslation()

    const showPreview = !!initialLast4 && !touched
    const previewPlaceholder = showPreview
      ? `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${initialLast4}`
      : placeholder

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={reveal ? 'text' : 'password'}
          placeholder={previewPlaceholder}
          onFocus={(e) => {
            setTouched(true)
            onFocus?.(e)
          }}
          className={['min-h-[44px] pr-10 font-mono', className]
            .filter(Boolean)
            .join(' ')}
          {...props}
        />
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => setReveal((v) => !v)}
          aria-label={reveal ? t('Hide API key') : t('Show API key')}
          tabIndex={-1}
        >
          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    )
  }
)
