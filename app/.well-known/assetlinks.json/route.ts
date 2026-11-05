// Digital Asset Links for the Google Play TWA (see lib/pwa/android-twa.ts).
// Android fetches this without cookies or redirects, so it must stay a plain,
// public, same-origin JSON response.

import { NextResponse } from 'next/server'
import { buildAssetLinks } from '@/lib/pwa/android-twa'

export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json(buildAssetLinks(), {
    headers: { 'cache-control': 'public, max-age=3600' },
  })
}
