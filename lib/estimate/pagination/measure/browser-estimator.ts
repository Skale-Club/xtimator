// lib/estimate/pagination/measure/browser-estimator.ts
//
// Phase 185 Plan 01 (PGBRK-01/04) — the browser-safe twin of
// measure/estimator.ts, sharing the SAME isomorphic packLines() core
// (measure/line-packer.ts) so the web paginated preview (Plan 185-03+)
// measures text IDENTICALLY to the PDF renderer. CLIENT-SAFE: zero
// Node-filesystem, Node-path-module, or server-restricted-package imports
// (enforced by tests/unit/pagination/pagination-engine-boundary.test.ts's
// inverse assertion). Designed to be dynamically imported (Plan 185-03
// wires the actual lazy import) — never eagerly bundled into the main
// client chunk.
//
// BARE specifier — NOT an explicit subpath. fontkit's package.json
// "exports" map (reproduced in 185-01-PLAN.md's <interfaces> block) has no
// subpath entries at all; a direct subpath import of fontkit's browser
// build cannot be resolved (throws ERR_PACKAGE_PATH_NOT_EXPORTED, verified). The "node"
// condition (server build) is matched ONLY by a genuine Node.js resolver
// (plain Node, or Vitest running under Node). ANY other resolution
// target — including webpack's client compilation, and any browser/
// web-targeted bundler — does NOT set the "node" condition, so it falls
// through to the plain "import"/"require" keys: the BROWSER build,
// automatically, with zero extra config. This file's own import is
// therefore just the bare specifier; this plan's own parity test
// (browser-estimator-parity.test.ts) is the ONE place that must force the
// browser build under Node/Vitest, via a test-scoped mock — never this
// production file.
import * as fontkit from 'fontkit'
import { packLines } from './line-packer'
import type { MeasurementProvider } from './types'

// Mirrors measure/estimator.ts's FONT_FAMILY_TO_PATH — the SAME 4 valid
// font family names, resolved to a public/ URL instead of a filesystem
// path. Never invent a 5th family or a different asset here without also
// updating estimator.ts / lib/pdf/register-fonts.ts.
const FONT_FAMILY_TO_URL: Record<string, string> = {
  Inter: '/fonts/inter/Inter-Regular.ttf',
  'Inter-Bold': '/fonts/inter/Inter-Bold.ttf',
  Lora: '/fonts/lora/Lora-Regular.ttf',
  'Lora-Bold': '/fonts/lora/Lora-Bold.ttf',
}

// Module-scope cache, keyed by family name — mirrors estimator.ts's "parse
// once" discipline. An in-flight Map de-dupes concurrent loads of the same
// family (two blocks needing the same font before either has resolved).
const fontCache = new Map<string, fontkit.Font>()
const inFlight = new Map<string, Promise<fontkit.Font>>()

async function loadFont(fontFamily: string): Promise<void> {
  if (fontCache.has(fontFamily)) return
  const existing = inFlight.get(fontFamily)
  if (existing) {
    await existing
    return
  }

  const url = FONT_FAMILY_TO_URL[fontFamily]
  if (!url) {
    throw new Error(
      `createBrowserFontkitMeasurementProvider: unknown font family "${fontFamily}" — must be one of ${Object.keys(FONT_FAMILY_TO_URL).join(', ')} (see lib/pdf/register-fonts.ts)`
    )
  }

  const promise = (async () => {
    const response = await fetch(url)
    const buffer = await response.arrayBuffer()
    // new Uint8Array — NOT Buffer.from — the browser fontkit build has zero
    // Buffer usage (verified, 185-RESEARCH.md), so this works identically
    // in real browsers, Next.js's client bundle, AND this plan's own test
    // with no polyfill.
    const opened = fontkit.create(new Uint8Array(buffer))
    if (!('layout' in opened)) {
      throw new Error(
        `createBrowserFontkitMeasurementProvider: "${url}" resolved to a font collection, not a single font — check FONT_FAMILY_TO_URL`
      )
    }
    fontCache.set(fontFamily, opened)
    return opened
  })()

  inFlight.set(fontFamily, promise)
  try {
    await promise
  } finally {
    inFlight.delete(fontFamily)
  }
}

/**
 * Async factory: preloads every requested font family (fetch + parse) BEFORE
 * returning, so the returned MeasurementProvider's `lineCount` can stay
 * synchronous — matching the MeasurementProvider contract exactly. Defaults
 * to all 4 registered families; Plan 185-03 passes only the active
 * template's 2 (fontFamily/fontFamilyBold).
 */
export async function createBrowserFontkitMeasurementProvider(
  fontFamilies: string[] = Object.keys(FONT_FAMILY_TO_URL)
): Promise<MeasurementProvider> {
  await Promise.all(fontFamilies.map(loadFont))
  return {
    lineCount: (text, styleKey, fontSizePt, maxWidthPt) => {
      const font = fontCache.get(styleKey)
      if (!font) {
        throw new Error(
          `createBrowserFontkitMeasurementProvider: font "${styleKey}" was not preloaded — pass it in fontFamilies`
        )
      }
      return packLines(font, text, fontSizePt, maxWidthPt)
    },
  }
}
