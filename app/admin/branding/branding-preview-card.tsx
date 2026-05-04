'use client'

import type { CSSProperties } from 'react'
import { hexToHslTriplet } from '@/lib/color'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { LogoFallback } from '@/components/auth/auth-card'

export type PreviewBranding = {
  appName: string
  logoUrl: string | null
  primaryColor: string | null
}

interface BrandingPreviewCardProps {
  branding: PreviewBranding
}

/**
 * Live preview rendered inside the BrandingEditor right column.
 *
 * Wraps two mini previews (auth dark + admin nav) in a `data-theme="dark-auth"`
 * div with `--platform-primary` set inline, so the scoped dark CSS vars from
 * Plan 03's `app/globals.css` block apply without leaking outside this card.
 *
 * Per UI-SPEC §"BrandingPreviewCard": styled `<div>` (NOT iframe) with two
 * mini previews — dark auth (200px tall, logo + wordmark + "Sign in" button
 * in primary color) and admin nav (left-rail mock with active item using
 * primary color).
 */
export function BrandingPreviewCard({ branding }: BrandingPreviewCardProps) {
  const triplet =
    hexToHslTriplet(branding.primaryColor ?? '') ?? SYSTEM_COLORS.primaryHsl
  const platformPrimary = `hsl(var(--platform-primary, ${SYSTEM_COLORS.primaryHsl}))`
  const themedStyle: CSSProperties = {
    ['--platform-primary' as string]: triplet,
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
        Preview
      </h2>

      <div
        data-theme="dark-auth"
        style={themedStyle}
        className="overflow-hidden rounded-lg border border-border"
      >
        {/* Auth dark mini-preview */}
        <div
          aria-label="Auth page preview"
          className="flex h-[200px] flex-col items-center justify-center gap-3 bg-background p-6 text-foreground"
        >
          <div className="flex flex-col items-center gap-2">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt=""
                width={32}
                height={32}
                aria-hidden="true"
                className="rounded"
              />
            ) : (
              <LogoFallback />
            )}
            <span className="text-base font-semibold leading-tight tracking-tight">
              {branding.appName || 'Untitled'}
            </span>
          </div>
          <button
            type="button"
            disabled
            className="pointer-events-none rounded-md px-4 py-1.5 text-xs font-medium"
            style={{
              backgroundColor: platformPrimary,
              color: 'white',
            }}
          >
            Sign in
          </button>
        </div>

        {/* Admin nav mini-preview */}
        <div
          aria-label="Admin nav preview"
          data-theme="admin-dark"
          className="flex gap-0 border-t border-border bg-background"
        >
          <nav className="flex w-[140px] flex-col gap-1 p-2 text-xs">
            {(['Integrations', 'Branding', 'Admins'] as const).map((label, idx) => {
              const active = idx === 1
              return (
                <div
                  key={label}
                  className="rounded px-2 py-1.5"
                  style={
                    active
                      ? {
                          backgroundColor: `hsl(var(--platform-primary, ${SYSTEM_COLORS.primaryHsl}) / 0.12)`,
                          borderLeft: `3px solid ${platformPrimary}`,
                          paddingLeft: 'calc(0.5rem - 3px)',
                          color: 'hsl(var(--foreground))',
                        }
                      : { color: 'hsl(var(--muted-foreground))' }
                  }
                >
                  {label}
                </div>
              )
            })}
          </nav>
          <div className="flex-1 p-3 text-xs text-muted-foreground">
            <div className="mb-2 text-sm font-semibold text-foreground">
              Branding
            </div>
            <div>Sample admin content</div>
          </div>
        </div>
      </div>
    </div>
  )
}
