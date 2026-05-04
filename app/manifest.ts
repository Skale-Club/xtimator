import type { MetadataRoute } from 'next'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { getBranding } from '@/lib/platform-config'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const b = await getBranding()

  // Favicon is the preferred browser-tab icon.
  // Logo is the fallback when no dedicated favicon is set.
  // Static /icon and /apple-icon (app/icon.png, app/apple-icon.png) are the last resort.
  const smallIcon = b.faviconUrl ?? b.logoUrl
  const largeIcon = b.logoUrl ?? b.faviconUrl

  return {
    name: b.appName,
    short_name: b.appName,
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0f',
    theme_color: SYSTEM_COLORS.primary,
    icons: [
      ...(smallIcon
        ? [{ src: smallIcon, sizes: '32x32 64x64 96x96', type: 'image/png' }]
        : [{ src: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' }]),
      ...(largeIcon
        ? [{ src: largeIcon, sizes: '192x192 512x512', type: 'image/png' }]
        : [
            { src: '/icon', sizes: '512x512', type: 'image/png' },
            { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
          ]),
    ],
  }
}
