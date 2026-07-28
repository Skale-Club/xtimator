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
