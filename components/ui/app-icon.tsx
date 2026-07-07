import { cn } from '@/lib/utils'

interface AppIconProps {
  logoUrl?: string | null
  appName?: string
  className?: string
}

/**
 * Renders the platform brand mark inline (header/footer/nav).
 *
 * Always the real logo image: the admin-uploaded logo from `platform_branding`
 * when present, else the bundled real-logo asset at /icons/logo.png. There is
 * intentionally NO hand-drawn glyph fallback — the mark is never a substitute
 * "X" drawn in code.
 */
export function AppIcon({ logoUrl, appName, className }: AppIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl ?? '/icons/logo.png'}
      alt={appName ?? ''}
      className={cn('h-10 w-10 object-contain', className)}
      aria-hidden="true"
    />
  )
}
