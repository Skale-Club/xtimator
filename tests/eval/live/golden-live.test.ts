/**
 * tests/eval/live/golden-live.test.ts
 *
 * SEED-057 Phase F: the LIVE canary. Runs the golden set against a real model
 * with the current prompt and playbooks, prints the rubric scores, latency and
 * cost per case, and fails when the mean drops more than MAX_MEAN_DROP points
 * below the committed baseline.
 *
 * SKIPPED unless EVAL_LIVE=1. It costs real money (about $1 for the full set at
 * the default model), so it never runs in CI by itself: the manual workflow
 * .github/workflows/eval-live.yml is the only automatic entry point.
 *
 *   EVAL_LIVE=1                  turn it on
 *   OPENROUTER_API_KEY           required (the canary does not read the platform DB)
 *   EVAL_LIVE_MODEL              estimator model, default anthropic/claude-sonnet-5
 *   EVAL_LIVE_TWO_STEP=1         run plan_scope first (judges Phase C on score, latency, cost)
 *   EVAL_LIVE_CASES=a,b          only these case ids
 *   EVAL_LIVE_MAX_CASES=N        hard cap on the number of cases (default 20)
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

const LIVE = process.env.EVAL_LIVE === '1'
const TWO_STEP = process.env.EVAL_LIVE_TWO_STEP === '1'
const MODEL = process.env.EVAL_LIVE_MODEL || DEFAULT_ESTIMATE_MODEL

function selectCases() {
  const wanted = (process.env.EVAL_LIVE_CASES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const cap = Math.max(1, Number(process.env.EVAL_LIVE_MAX_CASES) || 20)
  const pool = wanted.length > 0 ? GOLDEN_CASES.filter((c) => wanted.includes(c.id)) : GOLDEN_CASES
  return pool.slice(0, cap)
}

function readBaseline(): number | null {
  try {
    const raw = JSON.parse(readFileSync(resolve(__dirname, 'baseline.json'), 'utf8')) as Record<string, unknown>
    const value = raw[TWO_STEP ? 'twoStep' : 'single']
    return typeof value === 'number' ? value : null
  } catch {
    return null
  }
}

function report(results: LiveCaseResult[]) {
  const lines = results.map((r) => {
    const score = r.rubric ? String(r.rubric.score).padStart(3) : ' --'
    const plan = r.plan ? ` plan ${(r.plan.latencyMs / 1000).toFixed(1)}s${r.plan.usable ? '' : ' (unusable)'}` : ''
    const status = r.ok ? '' : `  FAILED: ${r.error}`
    return `${r.id.padEnd(28)} ${score}  ${(r.latencyMs / 1000).toFixed(1).padStart(5)}s  $${(r.costUsd ?? 0).toFixed(4)}${plan}${status}`
  })
  return lines.join('\n')
}

describe.skipIf(!LIVE)('golden set against a live model', () => {
  it(
    'scores the golden set and does not regress against the baseline',
    async () => {
      const apiKey = process.env.OPENROUTER_API_KEY
      expect(apiKey, 'OPENROUTER_API_KEY must be set for the live canary').toBeTruthy()

      const cases = selectCases()
      const results: LiveCaseResult[] = []
      for (const c of cases) {
        // Sequential on purpose: a rate-limited burst would corrupt the latency numbers.
        results.push(await runLiveCase(c, { apiKey: apiKey!, model: MODEL, twoStep: TWO_STEP }))
      }

      const mean = meanScore(results)
      const latencies = results.map((r) => r.latencyMs)
      const cost = results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0)
      const summary = {
        mode: TWO_STEP ? 'twoStep' : 'single',
        model: MODEL,
        cases: results.length,
        mean,
        medianLatencyMs: Math.round(median(latencies)),
        totalCostUsd: Math.round(cost * 10_000) / 10_000,
        failed: results.filter((r) => !r.ok).map((r) => r.id),
      }

      const out = resolve(process.env.EVAL_LIVE_OUT ?? 'tests/eval/live/.out/latest.json')
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, JSON.stringify({ summary, results }, null, 2))
      console.log(`\n${report(results)}\n\n${JSON.stringify(summary)}\n`)

      const baseline = readBaseline()
      if (baseline !== null) {
        expect(mean, `mean ${mean} dropped more than ${MAX_MEAN_DROP} below the baseline ${baseline}`).toBeGreaterThanOrEqual(
          baseline - MAX_MEAN_DROP,
        )
      }
    },
    30 * 60_000,
  )
})
