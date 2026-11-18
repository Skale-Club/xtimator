/**
 * tests/eval/live/golden-live.test.ts
 *
 * SEED-057 Phase F: the LIVE canary. Runs the golden set against a real model
 * with the current prompt and playbooks, prints the rubric scores, latency and
 * cost per case, and fails when the mean drops more than MAX_MEAN_DROP points
 * below the committed baseline. Without a baseline, a valid run is calibration.
 *
 * SKIPPED unless EVAL_LIVE=1. It costs real money (about $1 for the full set at
 * the default model), so it never runs in CI by itself: the manual workflow
 * .github/workflows/eval-live.yml is the only automatic entry point.
 *
 *   EVAL_LIVE=1                  turn it on
 *   OPENROUTER_API_KEY           required (the canary does not read the platform DB)
 *   EVAL_LIVE_MODEL              estimator model, default anthropic/claude-sonnet-5.5
 *   EVAL_LIVE_TWO_STEP=1         run plan_scope first (judges Phase C on score, latency, cost)
 *   EVAL_LIVE_CASES=a,b          only these case ids
 *   EVAL_LIVE_MAX_CASES=N        hard cap on the number of cases (default 18)
 *   EVAL_LIVE_OUT=path           where to write the JSON report
 *
 * To (re)set the baseline after an intended change, run it and copy the printed
 * mean into tests/eval/live/baseline.json under "single" or "twoStep".
 */
import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { GOLDEN_CASES } from '../golden/cases'
import { MAX_MEAN_DROP } from '../rubric'
import { DEFAULT_ESTIMATE_MODEL, meanScore, median, runLiveCase, type LiveCaseResult } from './run-case'
import { inspectLiveResults, selectLiveCases } from './acceptance'

const LIVE = process.env.EVAL_LIVE === '1'
const TWO_STEP = process.env.EVAL_LIVE_TWO_STEP === '1'
const MODEL = process.env.EVAL_LIVE_MODEL || DEFAULT_ESTIMATE_MODEL

function readBaseline(): number | null {
  const raw = JSON.parse(readFileSync(resolve(__dirname, 'baseline.json'), 'utf8')) as Record<string, unknown>
  const value = raw?.[TWO_STEP ? 'twoStep' : 'single']
  if (value === null) return null
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100) return value
  throw new Error('Invalid baseline')
}

function report(results: LiveCaseResult[]) {
  const lines = results.map((r) => {
    const score = r.rubric ? String(r.rubric.score).padStart(3) : ' --'
    const plan = r.plan ? ` plan ${(r.plan.latencyMs / 1000).toFixed(1)}s${r.plan.usable ? '' : ' (unusable)'}` : ''
    const status = r.ok ? '' : `  FAILED: ${r.error}`
    const cost = r.costUsd === null ? 'unknown cost' : `$${r.costUsd.toFixed(4)}`
    return `${r.id.padEnd(28)} ${score}  ${(r.latencyMs / 1000).toFixed(1).padStart(5)}s  ${cost}${plan}${status}`
  })
  return lines.join('\n')
}

describe.skipIf(!LIVE)('golden set against a live model', () => {
  it(
    'requires valid scored cases and compares them with the baseline when available',
    async () => {
      const apiKey = process.env.OPENROUTER_API_KEY
      const { cases, errors: preflightErrors } = selectLiveCases(
        GOLDEN_CASES, process.env.EVAL_LIVE_CASES, process.env.EVAL_LIVE_MAX_CASES,
      )
      if (!apiKey) preflightErrors.push('OPENROUTER_API_KEY must be set for the live canary')
      let baseline: number | null | undefined
      try {
        baseline = readBaseline()
      } catch {
        preflightErrors.push('baseline.json must contain a null or numeric baseline from 0 to 100 for the selected mode')
      }

      const results: LiveCaseResult[] = []
      if (apiKey && preflightErrors.length === 0) {
        for (const c of cases) {
          // Sequential on purpose: a rate-limited burst would corrupt the latency numbers.
          const started = Date.now()
          try {
            const result = await runLiveCase(c, { apiKey, model: MODEL, twoStep: TWO_STEP })
            results.push(result.error ? { ...result, error: result.error.replaceAll(apiKey, '[redacted]') } : result)
          } catch {
            results.push({ id: c.id, ok: false, error: 'Unexpected case runner failure', rubric: null,
              latencyMs: Date.now() - started, costUsd: null })
          }
        }
      }

      const outcome = preflightErrors.length
        ? { errors: preflightErrors, failedCases: [] }
        : inspectLiveResults(cases.length, results)
      const mean = meanScore(results)
      const latencies = results.map((r) => r.latencyMs)
      const knownCost = results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0)
      const unknownCostCases = results.filter((r) => r.costUsd === null).map((r) => r.id)
      const baselineFailed = typeof baseline === 'number' && mean < baseline - MAX_MEAN_DROP
      const errors = [...outcome.errors]
      if (!errors.length && baselineFailed) {
        errors.push(`Mean ${mean} dropped more than ${MAX_MEAN_DROP} below the baseline ${baseline}`)
      }
      const summary = {
        mode: TWO_STEP ? 'twoStep' : 'single',
        assessment: baseline === undefined ? 'invalid-baseline' : baseline === null ? 'calibration' : 'baseline-comparison',
        baseline: baseline ?? null,
        model: MODEL,
        selectedCases: cases.map((c) => c.id),
        cases: results.length,
        mean,
        medianLatencyMs: Math.round(median(latencies)),
        totalCostUsd: unknownCostCases.length ? null : Math.round(knownCost * 10_000) / 10_000,
        knownCostSubtotalUsd: Math.round(knownCost * 10_000) / 10_000,
        unknownCostCases,
        failed: outcome.failedCases.map((r) => r.id),
        errors,
      }

      const out = resolve(process.env.EVAL_LIVE_OUT ?? 'tests/eval/live/.out/latest.json')
      mkdirSync(dirname(out), { recursive: true })
      const json = JSON.stringify({ summary, results }, null, 2)
      writeFileSync(out, json)
      console.log(`\n${report(results)}\n\n${JSON.stringify(summary)}\n`)
      if (Buffer.byteLength(json, 'utf8') > 700_000) console.log(json)

      if (baseline === null) console.log('Calibration only. No rubric baseline is configured for this mode.')
      expect(errors, errors.join('\n')).toEqual([])
    },
    30 * 60_000,
  )
})
