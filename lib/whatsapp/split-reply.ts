/**
 * Split an assistant reply into ordered, WhatsApp-sized chunks for sequential
 * sending. Splits first on blank-line (paragraph) boundaries; any paragraph
 * exceeding maxLen is further split on sentence/newline boundaries (greedy
 * packing), with a hard slice as the last resort. Empty/whitespace chunks are
 * dropped. A short reply yields a single chunk.
 */
export function splitReply(text: string, maxLen = 1000): string[] {
  if (!text || !text.trim()) return []

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const out: string[] = []

  for (const para of paragraphs) {
    if (para.length <= maxLen) {
      out.push(para)
      continue
    }

    // Oversized paragraph: split into sentence/line pieces, then greedily pack.
    const pieces = para
      .split(/(?<=[.!?])\s+/)
      .flatMap((s) => s.split('\n'))
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    let buffer = ''
    const flush = (): void => {
      const trimmed = buffer.trim()
      if (trimmed.length > 0) out.push(trimmed)
      buffer = ''
    }

    for (const piece of pieces) {
      if (piece.length > maxLen) {
        // A single piece still too long — flush buffer, then hard-slice.
        flush()
        for (let i = 0; i < piece.length; i += maxLen) {
          const slice = piece.slice(i, i + maxLen).trim()
          if (slice.length > 0) out.push(slice)
        }
        continue
      }
      const candidate = buffer ? `${buffer} ${piece}` : piece
      if (candidate.length > maxLen) {
        flush()
        buffer = piece
      } else {
        buffer = candidate
      }
    }
    flush()
  }

  return out
}
