/**
 * components/capture/processing-narration.ts
 *
 * The words the capture checklist says while the pipeline works.
 *
 * Literal truth only. A row's label names work the journal says the server
 * actually started or finished, and a detail line only ever prints counts the
 * server actually reported ("18 of 38 items priced"). Never invent, never
 * round up, never show a count you did not receive.
 *
 * 260927: the rotating joke line ("Haggling with the supply house") is gone.
 * It was meant to give a long wait a pulse, but in grey italics under a frozen
 * bar it read as noise, and it translated poorly. The checklist gives the
 * pulse now: rows tick off, and every finished row keeps its fact on screen.
 *
 * Each row has two labels: the ongoing form ("Pricing the line items") while it
 * is pending or running, and the finished form ("Line items priced") once the
 * journal confirms it. Reading the finished list back should sound like a
 * foreman's report of what is already behind them.
 *
 * Pure module: no React, no clock reads. Every string here is an i18n key: the
 * overlay runs each one through t(), and lib/i18n/translations.ts pre-seeds
 * them so the screen never flashes English while a translation loads.
 */
import type { CaptureProgressMode, ChecklistRowId } from '@/lib/estimate/progress-model'
import type { GeneratePhase } from '@/lib/estimate/generation-phases'

export interface RowLabels {
  /** Pending or running: what the step does. */
  ongoing: string
  /** Finished: what the step achieved. */
  done: string
}

/** Headline per generate phase, used for the second-pass row's detail line. */
export const GENERATE_PHASE_LABELS: Record<GeneratePhase, string> = {
  context: 'Reading the job details',
  drafting: 'Writing the scope of work',
  pricing: 'Pricing the line items',
  saving: 'Putting the estimate together',
  reviewing: 'Checking the numbers',
  refining: 'Adding more detail',
}

const SAVE_LABELS: Record<CaptureProgressMode, RowLabels> = {
  audio: { ongoing: 'Saving the recording', done: 'Recording saved' },
  text: { ongoing: 'Saving the description', done: 'Description saved' },
  photos: { ongoing: 'Saving the photos', done: 'Photos saved' },
}

const ROW_LABELS: Record<Exclude<ChecklistRowId, 'save_recording'>, RowLabels> = {
  transcribe: { ongoing: 'Transcribing the audio', done: 'Audio transcribed' },
  analyze: { ongoing: 'Analyzing the photos', done: 'Photos analyzed' },
  'generate:context': { ongoing: 'Reading the job details', done: 'Job details read' },
  'generate:drafting': { ongoing: 'Writing the scope of work', done: 'Scope of work written' },
  'generate:pricing': { ongoing: 'Pricing the line items', done: 'Line items priced' },
  'generate:saving': { ongoing: 'Putting the estimate together', done: 'Estimate put together' },
  'generate:reviewing': { ongoing: 'Checking the numbers', done: 'Numbers checked' },
  'generate:refining': { ongoing: 'Adding more detail', done: 'More detail added' },
}

export function rowLabels(id: ChecklistRowId, mode: CaptureProgressMode): RowLabels {
  return id === 'save_recording' ? SAVE_LABELS[mode] : ROW_LABELS[id]
}

/**
 * Elapsed time as a clock, not as a raw second count.
 *
 * `148s` was accurate and unreadable: past a minute nobody converts it in their
 * head. `2:28` is the format every stopwatch already uses.
 *
 * Always zero-padded to m:ss so the width only changes at 10 minutes, which
 * (with tabular figures) keeps the digits from jittering as the clock ticks.
 * Rolls over to h:mm:ss rather than printing a three-digit minute count.
 */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * The time-left line, as a template plus its number, for the caller to run
 * through t(). Whole minutes only: a seconds-precise countdown built from
 * medians would be false precision, and it would visibly lie every time a
 * phase ran long. Rounded UP, so the promise errs on the side of "sooner than
 * I said".
 */
export type RemainingLine =
  | { kind: 'overdue' }
  | { kind: 'under_a_minute' }
  | { kind: 'minutes'; minutes: number }

export function remainingLine(remainingMs: number, overdue: boolean): RemainingLine {
  if (overdue) return { kind: 'overdue' }
  if (remainingMs < 60_000) return { kind: 'under_a_minute' }
  return { kind: 'minutes', minutes: Math.ceil(remainingMs / 60_000) }
}
