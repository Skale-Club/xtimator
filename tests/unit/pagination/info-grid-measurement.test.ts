// tests/unit/pagination/info-grid-measurement.test.ts
//
// The info grid (Project | Bill To) is MEASURED, not estimated: blocksFromModel emits one StackedColumn per
// column — line for line what components/pdf/shared/pdf-info-grid.tsx draws — and the engine charges
// baseHeightPt + the TALLEST column (fixed label part + the SUM of its wrapped lines). The numbers asserted
// below were verified against real react-pdf output (pdftotext -bbox, with vs. without the info-grid block).
import { describe, it, expect } from 'vitest'
import { blocksFromModel, type BlocksFromModelInfoGrid, type BlocksFromModelInput } from '@/lib/estimate/pagination/blocks-from-model'
import { blockHeightPt } from '@/lib/estimate/pagination/engine'
import { createFontkitMeasurementProvider } from '@/lib/estimate/pagination/measure/estimator'
import { resolvePresentationSettings } from '@/lib/estimate/presentation-settings'
import { LABELS } from '@/lib/estimate/document/labels'
import { ESTIMATE_DESIGN_TOKENS, ESTIMATE_PAGE_GEOMETRY, LINE_HEIGHT } from '@/lib/estimate/document/tokens'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'

const provider = createFontkitMeasurementProvider()

const CLIENT = {
  name: 'Michael Thompson',
  email: 'm.thompson@email.com',
  phone: '+15125550199',
  address: '4821 Oak Hollow Dr',
  city: 'Austin',
  state: 'TX',
  zip: '78745',
}

function infoGrid(overrides: Partial<BlocksFromModelInfoGrid> = {}): BlocksFromModelInfoGrid {
  return {
    projectName: 'Kitchen Remodel',
    projectType: null,
    client: CLIENT,
    estimate: { estimate_date: '2026-09-28', created_at: '2026-01-01T00:00:00Z', estimate_number: null, estimate_seq: 1 },
    language: 'en',
    ...overrides,
  }
}

function gridBlock(templateId: EstimateTemplateId, grid: BlocksFromModelInfoGrid, language: 'en' | 'es' | 'pt' = 'en') {
  const input: BlocksFromModelInput = {
    sections: [],
    summary: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    notes: null,
    company: {},
    discount_amount: 0,
    tax_amount: 0,
    dep: { showDeposit: false, depositAmount: 0, balanceDue: 0 },
    signature: null,
    photos: [],
    resolvedSettings: resolvePresentationSettings(undefined),
    preparedBy: null,
    L: LABELS[language],
    templateId,
    infoGrid: grid,
  }
  return blocksFromModel(input).find((b) => b.kind === 'info-grid')!
}

const heightOf = (templateId: EstimateTemplateId, grid: BlocksFromModelInfoGrid) =>
  blockHeightPt(gridBlock(templateId, grid), provider)

const LONG_NAME =
  'Thompson Residence Complete Kitchen, Pantry and Mudroom Remodel with Structural Changes and Full Electrical Rewiring Throughout the Entire Second Floor Addition'
const LONG_ADDRESS =
  '4821 Oak Hollow Drive Unit 12B, Building 3, Riverside Gardens Community Association Phase Two, Near the Old Mill'

describe.each(['classic', 'modern'] as const)('info-grid measurement — %s', (templateId) => {
  const geometry = ESTIMATE_PAGE_GEOMETRY[templateId]
  const design = ESTIMATE_DESIGN_TOKENS[templateId]
  const line = geometry.proseLineHeightMultiplier * 10
  // infoLabel line (8pt, natural bold line height) + its marginBottom (Classic 4 / Modern 5).
  const label = 8 * LINE_HEIGHT[design.fontFamilyBold] + (templateId === 'classic' ? 4 : 5)
  const rowMarginBottom = templateId === 'classic' ? 20 : 28

  it('emits Project + Bill To columns, each line measured at 48% of the content width', () => {
    const block = gridBlock(templateId, infoGrid())
    expect(block.columns).toHaveLength(2)
    expect(block.baseHeightPt).toBe(rowMarginBottom)
    for (const column of block.columns!) {
      for (const m of column.measurements) {
        expect(m.maxWidthPt).toBeCloseTo(geometry.contentWidthPt * 0.48, 9)
        expect(m.fontSizePt).toBe(10)
        expect(m.lineHeightMultiplier).toBe(geometry.proseLineHeightMultiplier)
      }
    }
  })

  it('Project column: name, formatted type (only when present), date line, estimate-number line', () => {
    const [project] = gridBlock(templateId, infoGrid({ projectType: 'kitchen_remodel' })).columns!
    expect(project.measurements.map((m) => m.text)).toEqual([
      'Kitchen Remodel',
      'Kitchen Remodel',
      'Date: September 28, 2026',
      'Estimate #0001',
    ])
    expect(project.measurements.every((m) => m.styleKey === design.fontFamily)).toBe(true)

    const [noType] = gridBlock(templateId, infoGrid({ projectType: null })).columns!
    expect(noType.measurements.map((m) => m.text)).toEqual(['Kitchen Remodel', 'Date: September 28, 2026', 'Estimate #0001'])
    // A blank / underscore-only type draws nothing, exactly like the template's `{projectTypeText && ...}`.
    const [blankType] = gridBlock(templateId, infoGrid({ projectType: '  ' })).columns!
    expect(blankType.measurements).toHaveLength(3)
  })

  it('the date falls back to created_at; the number prefers estimate_number; the language drives labels and the date', () => {
    const [fallback] = gridBlock(
      templateId,
      infoGrid({ estimate: { estimate_date: null, created_at: '2026-03-05T12:00:00Z', estimate_number: 'EST-1042', estimate_seq: 7 } })
    ).columns!
    expect(fallback.measurements.map((m) => m.text)).toEqual(['Kitchen Remodel', 'Date: March 5, 2026', 'Estimate #EST-1042'])

    const [es] = gridBlock(templateId, infoGrid({ language: 'es' }), 'es').columns!
    expect(es.measurements[1].text).toBe('Fecha: 28 de septiembre de 2026')
    expect(es.measurements[2].text).toBe('Presupuesto Nº0001')
  })

  it('Bill To column: bold name, then only the email / phone / address that exist; phone formatted, address "street\\ncity, ST zip"', () => {
    const [, billTo] = gridBlock(templateId, infoGrid()).columns!
    expect(billTo.measurements.map((m) => m.text)).toEqual([
      'Michael Thompson',
      'm.thompson@email.com',
      '+1 (512) 555-0199',
      '4821 Oak Hollow Dr\nAustin, TX 78745',
    ])
    expect(billTo.measurements.map((m) => m.styleKey)).toEqual([
      design.fontFamilyBold,
      design.fontFamily,
      design.fontFamily,
      design.fontFamily,
    ])

    const [, nameOnly] = gridBlock(
      templateId,
      infoGrid({ client: { name: 'Pat', email: null, phone: null, address: null, city: null, state: null, zip: null } })
    ).columns!
    expect(nameOnly.measurements.map((m) => m.text)).toEqual(['Pat'])
  })

  it('no client: the Bill To column does not exist at all (the template draws nothing there)', () => {
    const block = gridBlock(templateId, infoGrid({ client: null }))
    expect(block.columns).toHaveLength(1)
  })

  it('label part: infoLabel natural line + marginBottom; the Project column adds the date line\'s marginTop 4', () => {
    const [project, billTo] = gridBlock(templateId, infoGrid()).columns!
    expect(billTo.fixedHeightPt).toBeCloseTo(label, 9)
    expect(project.fixedHeightPt).toBeCloseTo(label + 4, 9)
  })

  it('charged height (short grid, full client) = infoRow margin + label + 5 Bill To lines (the 2-line address is 2 lines)', () => {
    // Bill To: name + email + phone + street + city line = 5 lines; Project: 3 lines + 4 -> Bill To is taller.
    expect(heightOf(templateId, infoGrid())).toBeCloseTo(rowMarginBottom + label + 5 * line, 9)
  })

  it('no client, short project: 3 Project lines (no type) + the date marginTop', () => {
    expect(heightOf(templateId, infoGrid({ client: null }))).toBeCloseTo(rowMarginBottom + label + 4 + 3 * line, 9)
    expect(heightOf(templateId, infoGrid({ client: null, projectType: 'kitchen' }))).toBeCloseTo(
      rowMarginBottom + label + 4 + 4 * line,
      9
    )
  })

  it('a long project name that wraps adds one line height per extra line (and takes over as the taller column)', () => {
    const base = heightOf(templateId, infoGrid({ client: null }))
    const wrapped = heightOf(templateId, infoGrid({ client: null, projectName: LONG_NAME }))
    const lines = provider.lineCount(LONG_NAME, design.fontFamily, 10, geometry.contentWidthPt * 0.48)
    expect(lines).toBeGreaterThanOrEqual(3)
    expect(wrapped - base).toBeCloseTo((lines - 1) * line, 9)
  })

  it('a long client address that wraps is charged (the old fixed 5-line estimate was not)', () => {
    const short = heightOf(templateId, infoGrid())
    const long = heightOf(templateId, infoGrid({ client: { ...CLIENT, address: LONG_ADDRESS } }))
    const streetLines = provider.lineCount(LONG_ADDRESS, design.fontFamily, 10, geometry.contentWidthPt * 0.48)
    expect(streetLines).toBeGreaterThanOrEqual(3)
    expect(long - short).toBeCloseTo((streetLines - 1) * line, 9)
  })

  it('a long client name wraps in the BOLD family', () => {
    const name = 'Michael and Jennifer Thompson-Alvarez Family Revocable Living Trust'
    const bold = provider.lineCount(name, design.fontFamilyBold, 10, geometry.contentWidthPt * 0.48)
    expect(bold).toBeGreaterThanOrEqual(2)
    expect(heightOf(templateId, infoGrid({ client: { ...CLIENT, name } })) - heightOf(templateId, infoGrid())).toBeCloseTo(
      (bold - 1) * line,
      9
    )
  })
})

describe('info-grid measurement — real react-pdf numbers (pdftotext -bbox, with vs. without the block)', () => {
  // Short / long-name / long-address / no-client cases, verified 2026-10-02 against a real render.
  const real: Record<EstimateTemplateId, Record<string, number>> = {
    classic: { short: 108.68, longName3: 142.68, noClient: 82.68, noClientLongName: 142.68, allLong: 157.68 },
    modern: { short: 123.24, longName3: 159.24, noClient: 95.24, noClientLongName: 159.24, allLong: 175.24 },
  }
  const longType = 'kitchen_and_bath_remodel_with_structural_changes_and_more'
  const longClientName = 'Michael and Jennifer Thompson-Alvarez Family Revocable Living Trust'
  it.each(['classic', 'modern'] as const)('%s', (templateId) => {
    const r = real[templateId]
    expect(heightOf(templateId, infoGrid())).toBeCloseTo(r.short, 2)
    expect(heightOf(templateId, infoGrid({ projectName: LONG_NAME, projectType: 'kitchen_remodel' }))).toBeCloseTo(r.longName3, 2)
    expect(heightOf(templateId, infoGrid({ client: null }))).toBeCloseTo(r.noClient, 2)
    expect(heightOf(templateId, infoGrid({ client: null, projectName: LONG_NAME, projectType: 'kitchen_remodel' }))).toBeCloseTo(
      r.noClientLongName,
      2
    )
    expect(
      heightOf(
        templateId,
        infoGrid({
          projectName: LONG_NAME,
          projectType: longType,
          client: { ...CLIENT, name: longClientName, address: LONG_ADDRESS },
        })
      )
    ).toBeCloseTo(r.allLong, 0)
  })
})
