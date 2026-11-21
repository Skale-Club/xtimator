'use client'

import { storageProxyPath } from '@/lib/storage/asset-url'
import { sidePanelMonogram } from '@/components/ui/side-panel'
import { cn } from '@/lib/utils'

/**
 * Project thumbnail: the stored 160px WebP through the same-origin storage
 * proxy (authenticated pages only), or a muted square with the project's
 * initials when there is none. 40px in the table and on the phone card.
 */
export function ProjectThumb({
  name,
  thumbPath,
  size = 40,
  className,
}: {
  name: string
  thumbPath?: string | null
  size?: 40 | 48
  className?: string
}) {
  const box = cn(
    'shrink-0 overflow-hidden rounded-md',
    size === 48 ? 'size-12' : 'size-10',
    className,
  )
  let src: string | null = null
  if (thumbPath) {
    try {
      src = storageProxyPath('photos', thumbPath)
    } catch {
      src = null
    }
  }
  if (src) {
    return (
      <span className={cn(box, 'bg-muted')} data-testid="project-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny private thumb through the proxy */}
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      </span>
    )
  }
  return (
    <span
      className={cn(box, 'flex items-center justify-center bg-muted text-xs font-semibold text-muted-foreground')}
      data-testid="project-thumb-placeholder"
      aria-hidden
    >
      {sidePanelMonogram(name || '?')}
    </span>
  )
}
