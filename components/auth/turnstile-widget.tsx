'use client'

import { useRef, useImperativeHandle, forwardRef } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useTheme } from 'next-themes'

export type TurnstileWidgetRef = {
  reset: () => void
}

type Props = {
  onToken: (token: string) => void
  onExpire?: () => void
}

/**
 * Cloudflare Turnstile widget — Managed mode (auto-picks invisible/checkbox by risk).
 *
 * Wrapped in a ref so parent forms can `.reset()` after a failed submit
 * (Turnstile tokens are single-use; must refresh after Supabase rejects).
 *
 * Site key is the only public env var needed; the secret lives in Supabase
 * admin config (security_captcha_secret).
 */
export const TurnstileWidget = forwardRef<TurnstileWidgetRef, Props>(
  function TurnstileWidget({ onToken, onExpire }, ref) {
    const widgetRef = useRef<TurnstileInstance | null>(null)
    const { resolvedTheme } = useTheme()

    useImperativeHandle(ref, () => ({
      reset: () => widgetRef.current?.reset(),
    }))

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    if (!siteKey) {
      // Graceful degrade — no widget, no token, server-side captcha gate will block bots
      return null
    }

    return (
      <div className="flex justify-center">
        <Turnstile
          ref={widgetRef}
          siteKey={siteKey}
          onSuccess={onToken}
          onExpire={onExpire}
          options={{
            theme: resolvedTheme === 'light' ? 'light' : 'dark',
            size: 'flexible',
          }}
        />
      </div>
    )
  }
)
