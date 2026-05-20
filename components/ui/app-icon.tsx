import { cn } from '@/lib/utils'

interface AppIconProps {
  logoUrl?: string | null
  appName?: string
  className?: string
}

/**
 * Renders the platform brand icon.
 * - When logoUrl is provided: shows the uploaded logo image.
 * - Otherwise: renders the Xtimator "X" SVG icon (brand blue, white glyph).
 */
export function AppIcon({ logoUrl, appName, className }: AppIconProps) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={appName ?? ''}
        className={cn('h-10 w-10 object-contain', className)}
        aria-hidden="true"
      />
    )
  }
  return (
    <svg
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn('h-10 w-10', className)}
    >
      <rect x="32" y="32" width="448" height="448" rx="128" ry="128" fill="#406EF1" />
      <path
        fill="white"
        d="M181 146h74l47 72 49-72h75l-86 121 93 99h-77l-57-62-56 62h-77l93-99-88-121Zm82 118-44-64h-13l51 74-60 68h15l51-58 53 58h14l-61-68 50-74h-13l-44 64h-12Z"
      />
    </svg>
  )
}
