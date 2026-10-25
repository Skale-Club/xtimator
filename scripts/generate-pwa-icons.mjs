/**
 * Gera os ícones PWA (PNG) a partir do logo real (public/icons/logo.png).
 * Execute: node scripts/generate-pwa-icons.mjs
 *
 * Padrão, igual em todos os apps:
 * - icon-192/512 (purpose "any", desktop): tile escuro arredondado, cantos
 *   transparentes, logo em 72%.
 * - icon-maskable-192/512 (Android): fundo escuro até a borda, logo em 56% —
 *   dentro da safe zone (círculo central de 80%), então nenhuma máscara corta.
 * O apple-touch-icon é dinâmico (app/apple-icon.tsx) e segue a mesma regra.
 */

import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const out = join(root, 'public', 'icons')
mkdirSync(out, { recursive: true })

const LOGO = join(out, 'logo.png')
const BG = '#0a0a0f'

async function mark(box) {
  const trimmed = await sharp(LOGO).trim().toBuffer()
  return sharp(trimmed)
    .resize(box, box, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

async function anyIcon(size) {
  const r = Math.round(size * 0.225)
  const tile = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${BG}"/></svg>`
  )
  return sharp(tile)
    .composite([{ input: await mark(Math.round(size * 0.72)), gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function maskableIcon(size) {
  return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: await mark(Math.round(size * 0.56)), gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

const icons = [
  { name: 'icon-192.png',          size: 192, render: anyIcon      },
  { name: 'icon-512.png',          size: 512, render: anyIcon      },
  { name: 'icon-maskable-192.png', size: 192, render: maskableIcon },
  { name: 'icon-maskable-512.png', size: 512, render: maskableIcon },
]

for (const { name, size, render } of icons) {
  await sharp(await render(size)).toFile(join(out, name))
  console.log(`✓ ${name}  (${size}×${size})`)
}

console.log('\nIcones PWA gerados em public/icons/')
