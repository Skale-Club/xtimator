import { describe, expect, it, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// SEED-057 Phase G: the owner-facing AI panel, the "AI needs review" banner and
// the per-line confidence dot.

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('tab=estimate'),
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

import { AiInsightsPanel } from '@/components/workspace/estimate/ai-insights-panel'
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

describe('AiInsightsPanel', () => {
  beforeEach(() => pushMock.mockReset())

  it('renders nothing without meta, or with nothing to say', () => {
    const { container, rerender } = render(<AiInsightsPanel meta={null} projectId="p1" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<AiInsightsPanel meta={{ v: 1, quality: { score: 90, band: 'ok', findings: [] } }} projectId="p1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the AI needs review banner with the findings when the band is review', () => {
    render(<AiInsightsPanel meta={full} projectId="p1" />)
    const banner = screen.getByTestId('ai-needs-review')
    expect(banner).toHaveTextContent('AI needs review')
    expect(banner).toHaveTextContent('No cleanup line.')
    expect(banner).toHaveTextContent('Give "Paint walls" a unit.')
  })

  it('the banner also covers a refine-band draft that was delivered after the one refine pass', () => {
    render(<AiInsightsPanel meta={{ v: 1, quality: { score: 30, band: 'refine', findings: ['Only 1 line for a job of this size.'] } }} projectId="p1" />)
    expect(screen.getByTestId('ai-needs-review')).toHaveTextContent('Only 1 line')
  })

  it('no banner when the draft was fine, but assumptions still show', () => {
    render(<AiInsightsPanel meta={{ ...full, quality: { score: 92, band: 'ok', findings: [] } }} projectId="p1" />)
    expect(screen.queryByTestId('ai-needs-review')).toBeNull()
    expect(screen.getByTestId('ai-assumptions')).toHaveTextContent('Assumes 8 ft ceilings')
  })

  it('lists assumptions, exclusions and open questions with their impact, marked as private to the owner', () => {
    render(<AiInsightsPanel meta={full} projectId="p1" />)
    expect(screen.getByTestId('ai-assumptions')).toHaveTextContent('Assumes 8 ft ceilings')
    expect(screen.getByTestId('ai-exclusions')).toHaveTextContent('Furniture moving')
    const questions = screen.getByTestId('ai-open-questions')
    expect(questions).toHaveTextContent('Is the closet included?')
    expect(questions).toHaveTextContent('High impact')
    expect(questions).toHaveTextContent('Low impact')
    expect(screen.getByTestId('ai-notes')).toHaveTextContent('Only you see this')
  })

  it('the details are open when there are questions, collapsed when there are none', () => {
    const { rerender } = render(<AiInsightsPanel meta={full} projectId="p1" />)
    expect(screen.getByTestId('ai-notes')).toHaveAttribute('open')
    rerender(<AiInsightsPanel meta={{ v: 1, assumptions: ['x'] }} projectId="p1" />)
    expect(screen.getByTestId('ai-notes')).not.toHaveAttribute('open')
  })

  it('Answer with AI opens the Edit with AI popup for this project', () => {
    render(<AiInsightsPanel meta={full} projectId="p1" />)
    fireEvent.click(screen.getByTestId('ai-answer-questions'))
    expect(pushMock).toHaveBeenCalledWith(editEstimateHref('tab=estimate', 'p1'), { scroll: false })
  })

  it('shows the banner alone when there are no notes', () => {
    render(<AiInsightsPanel meta={{ v: 1, quality: { score: 55, band: 'review', findings: ['No scope summary.'] } }} projectId="p1" />)
    expect(screen.getByTestId('ai-needs-review')).toBeInTheDocument()
    expect(screen.queryByTestId('ai-notes')).toBeNull()
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
