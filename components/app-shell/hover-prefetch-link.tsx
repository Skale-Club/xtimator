'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { ComponentPropsWithoutRef } from 'react'

type HoverPrefetchLinkProps = ComponentPropsWithoutRef<typeof Link>

export function HoverPrefetchLink({ children, ...props }: HoverPrefetchLinkProps) {
  const [shouldPrefetch, setShouldPrefetch] = useState(false)

  return (
    <Link
      {...props}
      prefetch={shouldPrefetch ? null : false}
      onMouseEnter={() => setShouldPrefetch(true)}
    >
      {children}
    </Link>
  )
}
