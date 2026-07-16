import { describe, it, expect } from 'vitest'
import {
  buildConfirmMessage,
  buildDroppedNote,
} from '@/lib/whatsapp/confirm-message'

/**
 * Localization (pt/en/es + fallback) of the WhatsApp `awaiting_confirm` "estimate
 * ready" confirmation frame and its partial-success dropped-item note.
 *
 * INVARIANTS pinned here:
 *   - The literal *send* / *cancel* protocol tokens survive in EVERY language
 *     (the agent + docs key on them; only the localized verb is added).
 *   - The N.M edit-command example numbers ("1.1", "2.3") survive in EVERY
 *     language (they are the stable display numbers, not translated).
 *   - The language-neutral breakdown + total are passed through verbatim.
 *   - Unknown languages fall back to English (English-first principle).
 *   - The English dropped-note keeps the "couldn't process N" substring the
 *     batch-reporting regression grep depends on.
 */

const BREAKDOWN = ['1. Labor — $150.00', '   1.1 Demo — $150.00'].join('\n')

describe('buildConfirmMessage — localized confirmation frame', () => {
  it('en: English header + send/cancel instruction + edit hint', () => {
    const body = buildConfirmMessage('en', { total: '$1,234.00', breakdown: BREAKDOWN })
    expect(body).toMatch(/Estimate ready - \$1,234\.00/)
    expect(body).toMatch(/deliver to your client/i)
    expect(body).toMatch(/discard/i)
    expect(body).toContain('*send*')
    expect(body).toContain('*cancel*')
    // Edit-hint example numbers preserved.
    expect(body).toContain('1.1')
    expect(body).toContain('2.3')
    // Language-neutral breakdown passed through.
    expect(body).toContain(BREAKDOWN)
  })

  it('pt: Portuguese header + instruction, protocol tokens + numbers preserved', () => {
    const body = buildConfirmMessage('pt', { total: 'R$ 1.234,00', breakdown: BREAKDOWN })
    expect(body).toMatch(/Orçamento pronto/i)
    expect(body).toMatch(/enviar ao cliente/i)
    expect(body).toMatch(/descartar/i)
    // Protocol keywords stay literal.
    expect(body).toContain('*send*')
    expect(body).toContain('*cancel*')
    // N.M example numbers untranslated.
    expect(body).toContain('1.1')
    expect(body).toContain('2.3')
    expect(body).toContain(BREAKDOWN)
  })

  it('es: Spanish header + instruction, protocol tokens + numbers preserved', () => {
    const body = buildConfirmMessage('es', { total: '$1.234,00', breakdown: BREAKDOWN })
    expect(body).toMatch(/Presupuesto listo/i)
    expect(body).toMatch(/cliente/i)
    expect(body).toMatch(/descartar/i)
    expect(body).toContain('*send*')
    expect(body).toContain('*cancel*')
    expect(body).toContain('1.1')
    expect(body).toContain('2.3')
    expect(body).toContain(BREAKDOWN)
  })

  it('unknown language falls back to English', () => {
    const body = buildConfirmMessage('de' as never, { total: '$1.00', breakdown: BREAKDOWN })
    expect(body).toBe(buildConfirmMessage('en', { total: '$1.00', breakdown: BREAKDOWN }))
  })

  it('appends the dropped-item note as part of the SAME single body when present', () => {
    const note = buildDroppedNote('en', { count: 1, reasons: ['download_failed'] })
    const body = buildConfirmMessage('en', { total: '$1.00', breakdown: BREAKDOWN, droppedNote: note })
    expect(body).toContain(note)
    // Note comes after the frame (single reply, no second send).
    expect(body.indexOf(note)).toBeGreaterThan(body.indexOf('*send*'))
  })

  it('omits the dropped-item region entirely on full success (no trailing blank note)', () => {
    const body = buildConfirmMessage('en', { total: '$1.00', breakdown: BREAKDOWN, droppedNote: '' })
    // Ends on the edit hint, not a dangling blank line + empty note.
    expect(body.endsWith('remove item 2.3".')).toBe(true)
  })
})

describe('buildDroppedNote — localized partial-success note', () => {
  it('returns empty string when nothing was dropped', () => {
    expect(buildDroppedNote('en', undefined)).toBe('')
    expect(buildDroppedNote('pt', { count: 0, reasons: [] })).toBe('')
  })

  it('en: keeps the "couldn\'t process N" substring the batch-reporting grep depends on', () => {
    expect(buildDroppedNote('en', { count: 1, reasons: ['x'] })).toMatch(/couldn't process 1 of your message\b/)
    expect(buildDroppedNote('en', { count: 3, reasons: ['x'] })).toMatch(/couldn't process 3 of your messages/)
  })

  it('pt: Portuguese note, pluralized (mensagem / mensagens)', () => {
    expect(buildDroppedNote('pt', { count: 1, reasons: ['x'] })).toMatch(/processar 1 mensagem\b/)
    expect(buildDroppedNote('pt', { count: 2, reasons: ['x'] })).toMatch(/processar 2 mensagens/)
    expect(buildDroppedNote('pt', { count: 1, reasons: ['x'] })).toMatch(/orçamento/i)
  })

  it('es: Spanish note, pluralized (mensaje / mensajes)', () => {
    expect(buildDroppedNote('es', { count: 1, reasons: ['x'] })).toMatch(/procesar 1 mensaje\b/)
    expect(buildDroppedNote('es', { count: 2, reasons: ['x'] })).toMatch(/procesar 2 mensajes/)
    expect(buildDroppedNote('es', { count: 1, reasons: ['x'] })).toMatch(/presupuesto/i)
  })

  it('unknown language falls back to English wording', () => {
    expect(buildDroppedNote('de' as never, { count: 2, reasons: ['x'] })).toBe(
      buildDroppedNote('en', { count: 2, reasons: ['x'] })
    )
  })
})
