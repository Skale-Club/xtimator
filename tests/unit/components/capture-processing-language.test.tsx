import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * 260806: the processing overlay follows the APP language, not the estimate's.
 *
 * The New Xtimate popup wraps its whole subtree in a ScopedLanguageProvider set
 * to the language the ESTIMATE will be written in, so the popup re-skins itself
 * for the document being produced. That is right for anything the client will
 * eventually read, and wrong for the processing screen, which only the operator
 * sees: a Portuguese-speaking contractor writing an English estimate for a US
 * client was getting an English loader inside an otherwise Portuguese app.
 *
 * These tests use the REAL providers and the REAL static dictionary (no mocked
 * t()), because the whole point is which context the hook resolves against.
 */

vi.mock('@/components/ui/tower-loader', () => ({
  TowerLoader: () => <div data-testid="tower-loader" />,
}))

import { LanguageProvider, ScopedLanguageProvider } from '@/lib/i18n/language-context'
import { CaptureProcessingOverlay } from '@/components/capture/capture-processing-overlay'

function renderInPopup(appLanguage: 'en' | 'pt' | 'es', estimateLanguage: 'en' | 'pt' | 'es') {
  localStorage.setItem('language', appLanguage)
  return render(
    <LanguageProvider>
      <ScopedLanguageProvider language={estimateLanguage} setLanguage={() => {}}>
        <CaptureProcessingOverlay
          stage="generating"
          mode="audio"
          completedSteps={['save_recording', 'transcribe']}
          activeStep="generate_estimate"
          activeStepStartedAt={new Date().toISOString()}
          phaseVisits={[{ phase: 'pricing', startedAt: new Date().toISOString(), detail: {} }]}
        />
      </ScopedLanguageProvider>
    </LanguageProvider>
  )
}

describe('CaptureProcessingOverlay language scope (260806)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const checklistText = () => screen.getByTestId('capture-progress-checklist').textContent ?? ''

  it('renders in the app language even when the estimate language differs', () => {
    renderInPopup('pt', 'en')
    expect(screen.getByTestId('capture-processing-label').textContent).toBe('Gerando seu orçamento')
    expect(checklistText()).toContain('Precificando os itens')
    expect(checklistText()).toContain('Áudio transcrito')
  })

  it('does not follow the estimate language into Portuguese for an English app', () => {
    renderInPopup('en', 'pt')
    expect(checklistText()).toContain('Pricing the line items')
    expect(checklistText()).not.toContain('Precificando')
  })

  it('pre-seeds every checklist string, so Portuguese never flashes English', () => {
    renderInPopup('pt', 'en')
    // The static dictionary covers every label, the header, the time-left line
    // and the leave hint: no English word may reach the screen while an
    // /api/translate round-trip resolves.
    const text = screen.getByTestId('capture-processing-overlay').textContent ?? ''
    expect(text).not.toMatch(/Saving|Transcrib|Reading|Writing|Pricing|Putting|Checking|left|leave/)
  })
})
