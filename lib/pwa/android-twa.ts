/**
 * lib/pwa/android-twa.ts
 *
 * Identity of the Google Play app that wraps this PWA as a Trusted Web
 * Activity (TWA). Served at /.well-known/assetlinks.json so Android trusts the
 * app to open xtimator.com full-screen, without the browser URL bar.
 *
 * Both values are public by design (anyone can read assetlinks.json), so they
 * live in code, not env vars.
 *
 * SHA-256 fingerprints to list (uppercase hex, colon-separated):
 *   1. the Play App Signing key — Play Console → Test and release → App
 *      integrity → App signing key certificate. This is the key installs from
 *      Google Play are signed with.
 *   2. the upload key — same page, "Upload key certificate". Lets sideloaded
 *      builds signed locally (internal testing before Play) verify too.
 *
 * The package name is permanent once the app is published on Google Play.
 */

export const ANDROID_TWA_PACKAGE_NAME = 'com.xtimator.app'

export const ANDROID_TWA_SHA256_FINGERPRINTS: readonly string[] = [
  // Filled in after the app is created in Play Console and the first upload
  // key exists. Until then the route serves an empty statement list.
]

const FINGERPRINT_PATTERN = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/

export type AssetLinkStatement = {
  relation: string[]
  target: {
    namespace: 'android_app'
    package_name: string
    sha256_cert_fingerprints: string[]
  }
}

export function buildAssetLinks(
  packageName: string = ANDROID_TWA_PACKAGE_NAME,
  fingerprints: readonly string[] = ANDROID_TWA_SHA256_FINGERPRINTS,
): AssetLinkStatement[] {
  const valid = fingerprints
    .map((f) => f.trim().toUpperCase())
    .filter((f) => FINGERPRINT_PATTERN.test(f))

  if (valid.length === 0) return []

  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: valid,
      },
    },
  ]
}
