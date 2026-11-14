import type { MetadataRoute } from 'next'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { getBranding } from '@/lib/platform-config'
import { GOOGLE_PLAY_PACKAGE, GOOGLE_PLAY_URL } from '@/lib/store-links'

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
    // The Android app (TWA) on Google Play. prefer_related_applications stays
    // false so browsers keep offering the web install; declaring the app lets
    // navigator.getInstalledRelatedApps() report it on Android Chrome later.
    related_applications: [{ platform: 'play', url: GOOGLE_PLAY_URL, id: GOOGLE_PLAY_PACKAGE }],
    prefer_related_applications: false,
    // Every icon is the real brand mark on a dark background:
    // - the "any" tile is the dynamic /icon route (app/icon.tsx), which
    //   composites the DB favicon/logo over #0a0a0f and re-renders when the
    //   admin changes branding — no stale static copy.
    // - the maskable tiles are pre-composited dark PNGs generated from the real
    //   logo by scripts/generate-pwa-icons.mjs, with the mark inside the safe
    //   zone so no launcher mask clips it.
    icons: [
      { src: '/icon', sizes: '192x192 512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' as const },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' as const },
    ],
  }
}
