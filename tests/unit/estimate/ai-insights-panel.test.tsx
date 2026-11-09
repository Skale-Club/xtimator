import { describe, expect, it, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// SEED-057 Phase G: the AI notes shown in the platform-admin debug dialog and
// the per-line confidence dot.

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('tab=estimate'),
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

import { AiInsightsSections } from '@/components/workspace/estimate/ai-insights-panel'
import { ConfidenceDot, isConfidenceLevel } from '@/components/workspace/estimate/confidence-dot'
import { editEstimateHref } from '@/components/projects/new-project-dialog'
import type { AiMeta } from '@/lib/estimate/ai-meta'

const full: AiMeta = {
  v: 1,
  assumptions: ['Assumes 8 ft ceilings'],
  exclusions: ['Furniture moving'],
  open_questions: [
    { question: 'Is the closet included?', impact: 'high' },
    { question: 'Any HOA rules?', impact: 'low' },
  ],
  scope_confidence: 'medium',
  quality: { score: 60, band: 'review', findings: ['No cleanup line.', 'Give "Paint walls" a unit.'] },
}

describe('AiInsightsSections (platform-admin debug dialog content)', () => {
  beforeEach(() => pushMock.mockReset())

  it('renders nothing without meta, or with nothing to list', () => {
    const { container, rerender } = render(<AiInsightsSections meta={null} projectId="p1" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<AiInsightsSections meta={{ v: 1, quality: { score: 90, band: 'ok', findings: [] } }} projectId="p1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('does not render the owner-facing review banner or the owner caption any more', () => {
    render(<AiInsightsSections meta={full} projectId="p1" />)
    expect(screen.queryByTestId('ai-needs-review')).toBeNull()
    expect(screen.queryByText('Only you see this')).toBeNull()
  })

  it('lists assumptions, exclusions and open questions with their impact', () => {
    render(<AiInsightsSections meta={full} projectId="p1" />)
    expect(screen.getByTestId('ai-assumptions')).toHaveTextContent('Assumes 8 ft ceilings')
    expect(screen.getByTestId('ai-exclusions')).toHaveTextContent('Furniture moving')
    const questions = screen.getByTestId('ai-open-questions')
    expect(questions).toHaveTextContent('Is the closet included?')
    expect(questions).toHaveTextContent('High impact')
    expect(questions).toHaveTextContent('Low impact')
  })

  it('Answer with AI closes the host, then opens the Edit with AI popup for this project', () => {
    const onNavigate = vi.fn()
    render(<AiInsightsSections meta={full} projectId="p1" onNavigate={onNavigate} />)
    fireEvent.click(screen.getByTestId('ai-answer-questions'))
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith(
      editEstimateHref(
        'tab=estimate',
        'p1',
        'Q: Is the closet included?
A: 

Q: Any HOA rules?
A: ',
      ),
      { scroll: false },
    )
  })
})

describe('ConfidenceDot', () => {
  it.each([
    ['high', 'bg-emerald-500'],
    ['medium', 'bg-amber-500'],
    ['low', 'bg-red-500'],
  ] as const)('%s uses %s and exposes the basis on hover', (level, color) => {
    render(<ConfidenceDot confidence={level} basis="12 x 14 ft room stated in the audio" />)
    const dot = screen.getByTestId('confidence-dot')
    expect(dot.className).toContain(color)
    expect(dot).toHaveAttribute('data-confidence', level)
    expect(dot.getAttribute('title')).toContain('12 x 14 ft room stated in the audio')
    expect(dot.getAttribute('aria-label')).toBe(dot.getAttribute('title'))
  })

  it('renders nothing without a valid confidence', () => {
    const { container, rerender } = render(<ConfidenceDot confidence={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<ConfidenceDot confidence={undefined} basis="x" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<ConfidenceDot confidence={'certain' as never} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('works without a basis', () => {
    render(<ConfidenceDot confidence="low" />)
    expect(screen.getByTestId('confidence-dot').getAttribute('title')).toBe('AI confidence: low, check this line')
  })

  it('isConfidenceLevel', () => {
    expect(isConfidenceLevel('low')).toBe(true)
    expect(isConfidenceLevel('LOW')).toBe(false)
    expect(isConfidenceLevel(null)).toBe(false)
  })
})
