'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Re-renders the server-rendered Academy when the interface language changes. */
export function AcademyLanguageRefresh() {
  const router = useRouter()
  useEffect(() => {
    const onChange = () => router.refresh()
    window.addEventListener('xtimator:ui-language', onChange)
    return () => window.removeEventListener('xtimator:ui-language', onChange)
  }, [router])
  return null
}
