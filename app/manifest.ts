import type { MetadataRoute } from 'next'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { getBranding } from '@/lib/platform-config'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let b: Awaited<ReturnType<typeof getBranding>>
  try {
    b = await getBranding()
  } catch (err) {
    console.warn('[manifest] branding lookup failed; using static manifest fallback:', err)
    b = {
      appName: 'Xtimator',
      logoUrl: null,
      primaryColor: null,
      emailFromName: null,
      siteTitle: null,
      metaDescription: null,
      ogImageUrl: null,
      canonicalBaseUrl: null,
      faviconUrl: null,
      landingContent: {
        heroHeadline: '',
        heroSubheadline: '',
        ctaLabel: '',
        heroImageUrl: null,
        heroBackgroundType: 'none',
        heroBackgroundImageUrl: null,
        heroBackgroundVideoUrl: null,
        howItWorksAnimations: true,
        howItWorksSteps: [],
        features: [],
      },
    }
  }

  return {
    name: b.appName,
    short_name: b.appName,
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0f',
    theme_color: SYSTEM_COLORS.primary,
    // Every icon is the real brand mark on a dark background, pre-composited
    // from public/icons/logo.png by scripts/generate-pwa-icons.mjs:
    // - "any" (desktop installs): dark rounded tile, transparent corners.
    // - "maskable" (Android): full-bleed dark, mark inside the safe zone so no
    //   launcher mask clips it.
    // The tab favicon (/icon) and apple-touch-icon (/apple-icon) stay dynamic.
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' as const },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' as const },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' as const },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' as const },
    ],
  }
}
