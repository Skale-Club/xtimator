import { cn } from '@/lib/utils'

interface AppIconProps {
  logoUrl?: string | null
  appName?: string
  className?: string
}

export function AppIcon({ logoUrl, appName, className }: AppIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl ?? '/icons/icon-192.png'}
      alt={appName ?? ''}
      className={cn('h-10 w-10 object-contain', className)}
      aria-hidden="true"
    />
  )
}
