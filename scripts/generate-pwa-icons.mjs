/**
 * Gera os ícones PWA (PNG) a partir do SVG corrigido.
 * Execute: node scripts/generate-pwa-icons.mjs
 */

import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const out = join(root, 'public', 'icons')
mkdirSync(out, { recursive: true })

const GLYPH_PATH = `M181 146h74l47 72 49-72h75l-86 121 93 99h-77l-57-62-56 62h-77l93-99-88-121Zm82 118-44-64h-13l51 74-60 68h15l51-58 53 58h14l-61-68 50-74h-13l-44 64h-12Z`
const TRANSFORM = `translate(256 256) scale(0.85) translate(-299.5 -256)`

/** Ícone padrão: fundo claro com cantos arredondados */
function regularSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <rect fill="#eef3ff" x="32" y="32" width="448" height="448" rx="128" ry="128"/>
  <path fill="#406EF1" transform="${TRANSFORM}" d="${GLYPH_PATH}"/>
</svg>`
}

/** Ícone maskable: fundo escuro full-bleed (Android adapta a forma) */
function maskableSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <rect fill="#0a0a0f" x="0" y="0" width="512" height="512"/>
  <path fill="#406EF1" transform="${TRANSFORM}" d="${GLYPH_PATH}"/>
</svg>`
}

const icons = [
  { name: 'icon-192.png',          size: 192, svg: regularSvg  },
  { name: 'icon-512.png',          size: 512, svg: regularSvg  },
  { name: 'icon-maskable-192.png', size: 192, svg: maskableSvg },
  { name: 'icon-maskable-512.png', size: 512, svg: maskableSvg },
]

for (const { name, size, svg } of icons) {
  const dest = join(out, name)
  await sharp(Buffer.from(svg(size)))
    .png({ compressionLevel: 9 })
    .toFile(dest)
  console.log(`✓ ${name}  (${size}×${size})`)
}

console.log('\nIcones PWA gerados em public/icons/')
