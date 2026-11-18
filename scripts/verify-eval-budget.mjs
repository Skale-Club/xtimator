// Read-only provider metadata check before any paid canary calls. Node 24.
import { verifyEvalBudget } from '../lib/ai/eval-budget.ts'

try {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('The dedicated evaluation key is not configured')
  const response = await fetch('https://openrouter.ai/api/v1/key', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error('Unable to verify the evaluation key budget')
  const result = await response.json()
  const budget = verifyEvalBudget(result.data, 5)
  console.log(JSON.stringify({ budgetVerified: true, ...budget }))
} catch (error) {
  // Only our own generic error messages, never key labels, headers or responses.
  const safe = error instanceof Error && !['TypeError', 'SyntaxError', 'TimeoutError'].includes(error.name)
    ? error.message : 'Unable to verify the evaluation key budget'
  console.error(safe)
  process.exitCode = 1
}
