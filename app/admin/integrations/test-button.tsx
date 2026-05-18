'use client'

import { useEffect, useState, useTransition } from 'react'
import { Loader2, FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useTranslation } from '@/lib/i18n/use-translation'

export type TestResult = { ok: boolean; message?: string }

interface TestButtonProps {
  disabled?: boolean
  onRun: () => Promise<TestResult>
}

/**
 * Inline "Test" action with idle / loading / success / error states.
 *
 * State inventory matches UI-SPEC §State Inventory IntegrationCard:
 * - idle: outline button labeled "Test"
 * - loading: disabled spinner + "Testing..."
 * - success: outline button + green-tinted Alert with message (auto-dismiss 10s)
 * - error: outline button + destructive Alert with message (auto-dismiss 10s)
 */
export function TestButton({ disabled, onRun }: TestButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<TestResult | null>(null)
  const { t } = useTranslation()

  useEffect(() => {
    if (!result) return
    const t = setTimeout(() => setResult(null), 10_000)
    return () => clearTimeout(t)
  }, [result])

  function handleClick() {
    startTransition(async () => {
      try {
        const r = await onRun()
        setResult(r)
      } catch (e) {
        setResult({
          ok: false,
          message: e instanceof Error ? e.message : t('Unexpected error'),
        })
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={disabled || isPending}
        className="min-h-[44px] w-fit"
      >
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FlaskConical className="mr-2 h-4 w-4" />
        )}
        {isPending ? t('Testing\u2026') : t('Test')}
      </Button>
      {result && (
        <Alert
          variant={result.ok ? 'default' : 'destructive'}
          aria-live="polite"
        >
          <AlertDescription>{result.message ?? (result.ok ? t('Verified.') : t('Failed.'))}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
