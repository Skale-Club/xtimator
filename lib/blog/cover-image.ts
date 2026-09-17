// =============================================================================
// lib/blog/cover-image.ts
//
// Cover images for generated posts (autoblog-parity XT-06, MASTER §8).
//
// Three steps, each of which may fail without failing the post: ask the image
// model, normalise the result to 16:9 WebP, upload it. A post with no cover is
// a worse post; a generation that DIED because an image model was busy is a
// missed publication, which is strictly worse. Every path here returns null
// instead of throwing.
//
// The bytes go to `platform-brand` — the public, immutably-cached bucket. These
// are the platform's own marketing assets, not tenant data: no company owns a
// blog post, so there is no tenant prefix to key them under.
// =============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'

import { getORKey, OPENROUTER_BASE } from '@/lib/ai/openrouter-client'
import { serverStorage } from '@/lib/storage/server'
import { storageProxyPath } from '@/lib/storage/asset-url'

/** Measured on the sibling products: a 1433 KB PNG cover became 94 KB at q82
 *  with no visible difference. */
const WEBP_QUALITY = 82

/** 16:9. Blog cards and OG previews both crop to it, so producing anything else
 *  means the crop happens in a browser, differently on every surface. */
const TARGET_WIDTH = 16
const TARGET_HEIGHT = 9

/** A model that answers the requested ratio within this needs no crop at all. */
const ASPECT_TOLERANCE = 0.05

const IMAGE_TIMEOUT_MS = 90_000

export interface CoverImageResult {
  /** Same-origin proxy path, never a backend hostname. */
  url: string
  durationMs: number
}

function coverPrompt(title: string, focusKeyword: string | null): string {
  return [
    `A professional, photographic cover image for a blog post titled "${title}".`,
    focusKeyword ? `The subject is ${focusKeyword}.` : '',
    'Editorial photography for a US home-services trade audience: real job sites, real tools, real work.',
    'Bright, clean, wide 16:9 composition with room for a title overlay.',
    'Absolutely no text, no words, no letters, no numbers, no watermarks, no logos, no brand marks.',
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Ask the image model. Returns null when the model answered without an image,
 * which several image-capable models do for a prompt they decline — that is a
 * normal outcome here, not an error.
 */
async function requestImage(
  model: string,
  prompt: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
  const apiKey = await getORKey()
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://xtimator.com',
      'X-Title': 'Xtimator',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      // Image-capable models return base64 data URLs under
      // choices[0].message.images[].image_url.url.
      modalities: ['image', 'text'],
    }),
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenRouter image request failed (${res.status}): ${body.slice(0, 300)}`)
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>
  }
  const dataUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url
  if (typeof dataUrl !== 'string') return null

  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i)
  if (!match) return null
  return { bytes: Buffer.from(match[2], 'base64'), mime: match[1].toLowerCase() }
}

/**
 * Crop to 16:9 when the model ignored the requested ratio, then encode WebP.
 *
 * Crops the long side away rather than scaling — never invent pixels — and uses
 * sharp's `attention` positioning so a square shot is not decapitated by a
 * naive centre crop.
 *
 * Never throws: a failed crop or a failed encode degrades to the original
 * bytes. A cover that is merely un-optimised still beats no cover.
 */
async function normaliseTo16x9(
  bytes: Buffer,
  mime: string,
): Promise<{ buffer: Buffer; mime: string; extension: string }> {
  let working = bytes
  try {
    const { default: sharp } = await import('sharp')
    const image = sharp(bytes)
    const { width, height } = await image.metadata()
    if (width && height) {
      const target = TARGET_WIDTH / TARGET_HEIGHT
      const actual = width / height
      if (Math.abs(actual - target) / target > ASPECT_TOLERANCE) {
        const [cropWidth, cropHeight] =
          actual > target ? [Math.round(height * target), height] : [width, Math.round(width / target)]
        working = await image
          .resize({ width: cropWidth, height: cropHeight, fit: 'cover', position: 'attention' })
          .toBuffer()
      }
    }
  } catch {
    // Bad metadata, corrupt bytes, sharp unavailable — encode what we have.
  }

  try {
    const { default: sharp } = await import('sharp')
    const webp = await sharp(working).webp({ quality: WEBP_QUALITY }).toBuffer()
    return { buffer: webp, mime: 'image/webp', extension: 'webp' }
  } catch {
    // The extension must describe what is actually in the buffer, never a
    // hardcoded assumption — serving WebP bytes as .png (or the reverse) is how
    // a "successful" upload becomes a broken image.
    return { buffer: working, mime, extension: mime.split('/')[1] || 'png' }
  }
}

/**
 * Generate, normalise and store a cover for one post.
 *
 * `null` means no cover this time, for any reason. The caller records the
 * stage timing and carries on — the post publishes either way.
 */
export async function generateCoverImage(
  svc: SupabaseClient,
  args: { model: string; title: string; focusKeyword: string | null; slug: string },
): Promise<CoverImageResult | null> {
  const model = args.model.trim()
  if (!model) return null

  const started = Date.now()
  try {
    const image = await requestImage(model, coverPrompt(args.title, args.focusKeyword))
    if (!image) return null

    const normalised = await normaliseTo16x9(image.bytes, image.mime)

    // The slug is already the URL-safe form of the title, and the timestamp is
    // what makes the key immutable — `platform-brand` is served with a one-year
    // immutable cache, so a reused key would strand every edge copy.
    const safeSlug = args.slug.replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'post'
    const path = `blog/${Date.now()}-${safeSlug}.${normalised.extension}`

    const result = await serverStorage(svc).upload('platform-brand', path, normalised.buffer, {
      contentType: normalised.mime,
      upsert: false,
    })

    return {
      // Same-origin path, never a backend hostname: a persisted provider URL
      // bills every view as provider egress and breaks the moment the backend
      // changes.
      url: storageProxyPath('platform-brand', result.path),
      durationMs: Date.now() - started,
    }
  } catch (err) {
    console.warn('[blog] cover image failed, publishing without one:', (err as Error).message)
    return null
  }
}
