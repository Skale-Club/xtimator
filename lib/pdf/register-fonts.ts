// lib/pdf/register-fonts.ts
// PDFPAR-01/ENGINE-03 — the ONE Font.register call site for every PDF
// template. Both estimate-pdf.tsx and estimate-pdf-modern.tsx import this
// module for its side effects (registration), before their own
// StyleSheet.create() runs. Font family NAMES here must exactly match the
// string values in lib/estimate/document/tokens.ts's ESTIMATE_DESIGN_TOKENS
// — Classic/Modern are two independently-named families (not one family +
// fontWeight variants), mirroring the existing 'Helvetica'/'Helvetica-Bold'
// convention this replaces.
import { Font } from '@react-pdf/renderer'
import path from 'node:path'

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts')

Font.register({ family: 'Inter', src: path.join(FONTS_DIR, 'inter', 'Inter-Regular.ttf') })
Font.register({ family: 'Inter-Bold', src: path.join(FONTS_DIR, 'inter', 'Inter-Bold.ttf') })
Font.register({ family: 'Lora', src: path.join(FONTS_DIR, 'lora', 'Lora-Regular.ttf') })
Font.register({ family: 'Lora-Bold', src: path.join(FONTS_DIR, 'lora', 'Lora-Bold.ttf') })

// Disable react-pdf's automatic hyphenation. By default @react-pdf/textkit
// runs every word through an English hyphenation dictionary and may break it
// across lines ("coun-tertops", "Sher-win-Williams") — wrong for brand/product
// names and unprofessional in a client-facing estimate. Returning the word
// whole as a single syllable means line breaks only happen at the break
// opportunities UAX#14 (the `linebreak` package) already defines: spaces and
// after an EXISTING hyphen-minus in the source text ("Sherwin-" / "Williams"),
// which is exactly what lib/estimate/pagination/measure/line-packer.ts (also
// `linebreak`-based) measures with — so measurement and render now agree on
// where a line can break. Process-global (Font is a singleton), set once at
// module load alongside the Font.register calls above.
Font.registerHyphenationCallback((word) => [word])
