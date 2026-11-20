import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

/**
 * Notices review stage 1, part 2 (2026-11-20): the permanent "Shared with the
 * client" strip became one toast on the first edit after sharing; the
 * needs-details questions join the AI's review questions.
 */

const toast = vi.fn()
vi.mock('sonner', () => ({ toast: { info: (...args: unknown[]) => toast(...args) } }))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

import { mergeReviewQuestions, useSharedEditHint } from '@/components/workspace/estimate/shared-edit-hint'
import { clearCapturePrompts, readCapturePrompts, setCapturePrompts } from '@/lib/estimate/capture-prompts'

beforeEach(() => {
  toast.mockClear()
  window.localStorage.clear()
})

describe('mergeReviewQuestions', () => {
  it('keeps the AI questions first and drops repeats and blanks', () => {
    expect(mergeReviewQuestions(['How many rooms?', ' '], ['how many rooms?', 'Ceilings too?'])).toEqual([
      'How many rooms?',
      'Ceilings too?',
    ])
    expect(mergeReviewQuestions(undefined, null)).toEqual([])
  })

  it('never more than 3 questions in all (owner rule: not pesky)', () => {
    expect(mergeReviewQuestions(['a?', 'b?'], ['c?', 'd?', 'e?'])).toEqual(['a?', 'b?', 'c?'])
  })
})

describe('useSharedEditHint', () => {
  const base = { estimateId: 'e1', isDirty: true, shared: true, clientName: 'Maria' as string | null }

  it('one toast naming the client on the first edit after sharing, then never again for that estimate', () => {
    const { rerender } = renderHook((p: typeof base) => useSharedEditHint(p), { initialProps: base })
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls[0][0]).toBe('Maria already has this link. What you change shows up there right away.')
    rerender({ ...base, isDirty: false })
    rerender({ ...base, isDirty: true })
    expect(toast).toHaveBeenCalledTimes(1)
    // A new mount (another visit) remembers it too.
    renderHook(() => useSharedEditHint(base))
    expect(toast).toHaveBeenCalledTimes(1)
  })

  it('nothing for a draft, or before the first edit', () => {
    renderHook(() => useSharedEditHint({ ...base, shared: false }))
    renderHook(() => useSharedEditHint({ ...base, estimateId: 'e2', isDirty: false }))
    expect(toast).not.toHaveBeenCalled()
  })

  it('no client name: a generic line', () => {
    renderHook(() => useSharedEditHint({ ...base, clientName: null }))
    expect(toast.mock.calls[0][0]).toBe('Your client already has this link. What you change shows up there right away.')
  })
})

describe('capture prompts handoff', () => {
  it('hands the questions to the recorder for that project only, until cleared', () => {
    setCapturePrompts('p1', ['How many rooms?', ' '])
    expect(readCapturePrompts('p2')).toEqual([])
    expect(readCapturePrompts('p1')).toEqual(['How many rooms?'])
    expect(readCapturePrompts('p1')).toEqual(['How many rooms?'])
    setCapturePrompts('p1', ['a?', 'b?', 'c?', 'd?'])
    expect(readCapturePrompts('p1')).toEqual(['a?', 'b?', 'c?'])
    clearCapturePrompts('p1')
    expect(readCapturePrompts('p1')).toEqual([])
  })
})
