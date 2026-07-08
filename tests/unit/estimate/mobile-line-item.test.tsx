import { describe, it } from 'vitest'

// Wave 0 scaffold — Phase 162 plan 162-05 converts these to real tests when
// ItemCardMobile is rebuilt to doc-native transparent inputs per DOCUX-06.

describe('mobile line-item editor (DOCUX-06)', () => {
  it.todo('no glass card — rendered DOM does NOT contain the string "glass" as a class value')
  it.todo('no glass card — no <Card> wrapper (the outer node is a <div>, not a Card)')
  it.todo('transparent inputs — description input uses INLINE_INPUT_CLS bg-transparent styling')
  it.todo('transparent inputs — qty input uses INLINE_INPUT_CLS text-right styling')
  it.todo('transparent inputs — unit-price MoneyInput uses bg-transparent border-0 shadow-none')
  it.todo('touch targets — trash button preserves min-h-[44px] min-w-[44px]')
  it.todo('touch targets — Switch container preserves min-h-[44px]')
  it.todo('row structure — border-b border-border/50 last:border-b-0 even:bg-muted/20')
  it.todo('preserves onUpdate + onRemove props signature (same as current ItemCardMobile)')
})
