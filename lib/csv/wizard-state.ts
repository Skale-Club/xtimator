/**
 * Phase 76 PB-CSV-01: 4-step wizard state machine.
 *
 * Pure reducer (no React imports — works with React.useReducer or anywhere).
 * Backed by sessionStorage via `serializeDraft` / `deserializeDraft` so the
 * wizard resumes after accidental close within a 24h TTL.
 */

import type { ParsedRow, ImportRow } from './price-book-import'
import type { LocaleMode, CustomLocale } from './locale-parser'
import type { TargetField } from './price-book-aliases'

export type WizardStep = 'upload' | 'map' | 'preview' | 'confirm'
export type DedupeStrategy = 'skip' | 'update' | 'new'
export type MappingValue = TargetField | '_skip'

export interface WizardState {
  step: WizardStep
  file: File | null
  fileName: string | null
  headers: string[]
  rows: ParsedRow[]
  locale: LocaleMode
  customLocale?: CustomLocale
  mapping?: Record<string, MappingValue>
  dedupeStrategy: DedupeStrategy
  perRowDedupeOverrides: Record<number, DedupeStrategy>
  cellEdits: Record<number, Partial<ImportRow>>
  savedAt: string // ISO timestamp
}

export const initialWizardState: WizardState = {
  step: 'upload',
  file: null,
  fileName: null,
  headers: [],
  rows: [],
  locale: 'plain',
  mapping: {},
  dedupeStrategy: 'skip',
  perRowDedupeOverrides: {},
  cellEdits: {},
  savedAt: new Date(0).toISOString(),
}

export type WizardAction =
  | {
      type: 'FILE_PARSED'
      file: File | null
      rows: ParsedRow[]
      headers: string[]
      detectedLocale?: LocaleMode
    }
  | { type: 'LOCALE_SET'; mode: LocaleMode; custom?: CustomLocale }
  | { type: 'MAPPING_SET'; header: string; target: MappingValue }
  | { type: 'MAPPING_COMPLETE' }
  | {
      type: 'EDIT_CELL'
      rowNumber: number
      field: keyof ImportRow
      value: string | number
    }
  | { type: 'DEDUPE_STRATEGY_SET'; strategy: DedupeStrategy }
  | {
      type: 'DEDUPE_ROW_OVERRIDE'
      rowNumber: number
      strategy: DedupeStrategy
    }
  | { type: 'PREVIEW_COMPLETE' }
  | { type: 'BACK' }
  | { type: 'RESET' }
  | { type: 'RESTORE_DRAFT'; draft: Partial<WizardState> }

const STEPS: WizardStep[] = ['upload', 'map', 'preview', 'confirm']

const stamp = <T extends WizardState>(s: T): T => ({
  ...s,
  savedAt: new Date().toISOString(),
})

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'FILE_PARSED': {
      const fileName =
        action.file && typeof (action.file as File).name === 'string'
          ? (action.file as File).name
          : null
      return stamp({
        ...state,
        step: 'map',
        file: action.file,
        fileName,
        headers: action.headers,
        rows: action.rows,
        locale: action.detectedLocale ?? state.locale,
        // Preserve any prior mapping; UI may overwrite via MAPPING_SET.
        mapping: state.mapping ?? {},
      })
    }
    case 'LOCALE_SET':
      return stamp({ ...state, locale: action.mode, customLocale: action.custom })
    case 'MAPPING_SET':
      return stamp({
        ...state,
        mapping: { ...(state.mapping ?? {}), [action.header]: action.target },
      })
    case 'MAPPING_COMPLETE':
      return stamp({ ...state, step: 'preview' })
    case 'EDIT_CELL': {
      const existing = state.cellEdits[action.rowNumber] ?? {}
      return stamp({
        ...state,
        cellEdits: {
          ...state.cellEdits,
          [action.rowNumber]: { ...existing, [action.field]: action.value },
        },
      })
    }
    case 'DEDUPE_STRATEGY_SET':
      return stamp({ ...state, dedupeStrategy: action.strategy })
    case 'DEDUPE_ROW_OVERRIDE':
      return stamp({
        ...state,
        perRowDedupeOverrides: {
          ...state.perRowDedupeOverrides,
          [action.rowNumber]: action.strategy,
        },
      })
    case 'PREVIEW_COMPLETE':
      return stamp({ ...state, step: 'confirm' })
    case 'BACK': {
      const idx = STEPS.indexOf(state.step)
      return stamp({ ...state, step: STEPS[Math.max(0, idx - 1)] })
    }
    case 'RESET':
      return { ...initialWizardState }
    case 'RESTORE_DRAFT':
      // Merge draft over initial so any missing fields keep safe defaults.
      return { ...initialWizardState, ...action.draft }
    default:
      return state
  }
}

const DRAFT_VERSION = 1
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000 // 24h

/**
 * Serialize wizard state for sessionStorage. `file` is dropped — File objects
 * aren't serializable and the user must re-upload after reload anyway.
 */
export function serializeDraft(state: WizardState): string {
  const { file: _file, ...rest } = state
  void _file
  return JSON.stringify({ version: DRAFT_VERSION, state: rest })
}

/**
 * Restore wizard state. Returns null when:
 *   - JSON is malformed
 *   - version doesn't match (forward-compat / migration trigger)
 *   - savedAt is older than DRAFT_TTL_MS
 */
export function deserializeDraft(json: string): WizardState | null {
  try {
    const parsed = JSON.parse(json) as { version: number; state: Partial<WizardState> }
    if (parsed.version !== DRAFT_VERSION) return null
    const savedAtStr = parsed.state.savedAt
    if (savedAtStr) {
      const savedAt = new Date(savedAtStr).getTime()
      if (Number.isFinite(savedAt) && Date.now() - savedAt > DRAFT_TTL_MS) return null
    }
    return { ...initialWizardState, ...parsed.state, file: null }
  } catch {
    return null
  }
}
