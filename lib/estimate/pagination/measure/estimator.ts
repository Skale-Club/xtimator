// lib/estimate/pagination/measure/estimator.ts
//
// Phase 184 Plan 03 (PGBRK-05) — the REAL server-side MeasurementProvider,
// backed by the exact fontkit + linebreak line-packer Plan 184-01 hand-
// validated against the real vendored Inter TTF
// (tests/unit/pagination/measure/fontkit-arithmetic.test.ts). This is the
// ONE file inside lib/estimate/pagination/ allowed to import 'fontkit',
// 'linebreak', and 'node:path' — see
// tests/unit/pagination/pagination-engine-boundary.test.ts's explicit
// exclusion comment. SERVER ONLY (`import 'server-only'` below, mirroring
// lib/demo/session.ts's convention) — never imported by client bundles.
import 'server-only'
import path from 'node:path'
// fontkit ships ONLY named ESM exports (no default) — a namespace import
// mirrors what `require('fontkit')` returns (Plan 184-01's Decision, see
// 184-01-SUMMARY.md's key-decisions).
import * as fontkit from 'fontkit'
import { packLines } from './line-packer'
import type { MeasurementProvider } from './types'

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts')

// Mirrors lib/pdf/register-fonts.ts's Font.register calls verbatim — the
// ONLY 4 valid font family names/paths this estimator resolves. Never invent
// a 5th family or a different path here without also registering it there.
const FONT_FAMILY_TO_PATH: Record<string, string> = {
  Inter: path.join(FONTS_DIR, 'inter', 'Inter-Regular.ttf'),
  'Inter-Bold': path.join(FONTS_DIR, 'inter', 'Inter-Bold.ttf'),
  Lora: path.join(FONTS_DIR, 'lora', 'Lora-Regular.ttf'),
  'Lora-Bold': path.join(FONTS_DIR, 'lora', 'Lora-Bold.ttf'),
}

// Module-scope cache, keyed by family name — opened lazily on first use.
// Mirrors register-fonts.ts's "register/parse once" discipline: a TTF is
// never re-parsed on a second call for the same family.
const fontCache = new Map<string, fontkit.Font>()

function getFont(fontFamily: string): fontkit.Font {
  const cached = fontCache.get(fontFamily)
  if (cached) return cached

  const fontPath = FONT_FAMILY_TO_PATH[fontFamily]
  if (!fontPath) {
    throw new Error(
      `estimateLineCount: unknown font family "${fontFamily}" — must be one of ${Object.keys(FONT_FAMILY_TO_PATH).join(', ')} (see lib/pdf/register-fonts.ts)`
    )
  }

  // openSync's return type is `Font | FontCollection` (a .ttc/.dfont
  // collection) — every vendored path above is a single-font .ttf, so this
  // narrows deterministically. `layout` only exists on Font, never on
  // FontCollection (see @types/fontkit), so the `in` check is a safe,
  // exhaustive type guard (not a defensive-but-untested assumption).
  const opened = fontkit.openSync(fontPath)
  if (!('layout' in opened)) {
    throw new Error(
      `estimateLineCount: "${fontPath}" resolved to a font collection, not a single font — check FONT_FAMILY_TO_PATH`
    )
  }

  fontCache.set(fontFamily, opened)
  return opened
}

/**
 * Signature matches MeasurementProvider.lineCount exactly: `fontFamily` here
 * IS the `styleKey` the engine/rules pass through opaquely (Inter,
 * Inter-Bold, Lora, or Lora-Bold). The empty-text guard MUST stay here,
 * BEFORE getFont() — an empty-text measurement must never trigger a font
 * parse (Phase 185 Plan 01 preserved this exact ordering; moving the check
 * "inside packLines only" would eagerly open/parse a font on every call
 * regardless of text length). The actual greedy line-packing loop now lives
 * in the isomorphic lib/estimate/pagination/measure/line-packer.ts, shared
 * with the browser measurement provider (measure/browser-estimator.ts).
 */
export function estimateLineCount(
  text: string,
  fontFamily: string,
  fontSizePt: number,
  maxWidthPt: number
): number {
  if (text.length === 0) return 0

  const font = getFont(fontFamily)
  return packLines(font, text, fontSizePt, maxWidthPt)
}

export function createFontkitMeasurementProvider(): MeasurementProvider {
  return { lineCount: estimateLineCount }
}
