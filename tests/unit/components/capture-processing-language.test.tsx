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
          generatePhase={{
            phase: 'pricing',
            furthestPhase: 'pricing',
            startedAt: new Date().toISOString(),
          }}
        />
      </ScopedLanguageProvider>
    </LanguageProvider>
  )
}

describe('CaptureProcessingOverlay language scope (260806)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders in the app language even when the estimate language differs', () => {
    renderInPopup('pt', 'en')
    expect(screen.getByTestId('capture-processing-label').textContent).toContain(
      'Precificando os itens'
    )
  })

  it('does not follow the estimate language into Portuguese for an English app', () => {
    renderInPopup('en', 'pt')
    const label = screen.getByTestId('capture-processing-label').textContent ?? ''
    expect(label).toContain('Pricing the line items')
    expect(label).not.toContain('Precificando')
  })

  it('translates the quip line too, from the same app language', () => {
    renderInPopup('pt', 'en')
    const quip = screen.getByTestId('capture-processing-quip').textContent ?? ''
    // Every quip in the pricing pool is pre-seeded in the static dictionary, so
    // there is no English flash while an API round-trip resolves.
    expect(quip).not.toMatch(/Calling around|Haggling|Checking what/)
  })
})
