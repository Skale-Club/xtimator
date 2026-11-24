/** Normalize only horizontal extraction gaps before a two-digit decimal fraction. */
export function normalizePdfText(text: string): string {
  return text.replace(/(\d)[ \t\u00a0]+(?=\.\d{2}(?:\D|$))/g, '$1').replace(/\s+/g, ' ').trim()
}
