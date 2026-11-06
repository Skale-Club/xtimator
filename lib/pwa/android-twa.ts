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
  // Play App Signing key (Google-managed; signs every install from Play).
  'AC:DE:D8:7A:6F:89:8B:70:18:AB:1A:DF:2E:26:FD:FC:3F:F9:CF:58:A0:06:22:CF:D4:D1:49:9C:80:6F:C0:5C',
  // Upload key (~/.android-keys/xtimator-upload.jks, alias "upload").
  '6F:3B:D5:45:06:5D:E4:43:5B:A4:53:96:E9:0D:6A:7A:3B:23:78:02:CA:AE:6F:C5:97:BE:50:A1:C4:1A:E3:D2',
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
