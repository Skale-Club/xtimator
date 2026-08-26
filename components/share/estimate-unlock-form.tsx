'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/use-translation'
import { unlockEstimate } from '@/app/estimate/[token]/actions'
import { ensureReadableOnWhite, readableTextColor } from '@/lib/color/contrast'
import { SYSTEM_COLORS } from '@/lib/system-colors'

export interface EstimateUnlockFormProps {
  token: string
  companyName: string
  logoUrl: string | null
  brandColor: string | null
}

/**
 * Phase 193-02 — rendered by both public share pages
 * (app/estimate/[token]/page.tsx and its friendly-URL sibling) INSTEAD of
 * EstimateView whenever the estimate is password-locked and the visitor
 * holds no valid unlock cookie. Deliberately receives only branding fields
 * (company name/logo/brand color) — no project name, client name, or totals
 * ever reach this component's props.
 */
export function EstimateUnlockForm({
  token,
  companyName,
  logoUrl,
  brandColor,
}: EstimateUnlockFormProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const brand = brandColor ?? SYSTEM_COLORS.primary
  const brandText = ensureReadableOnWhite(brand)
  const brandOnFill = readableTextColor(brand)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!password.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await unlockEstimate(token, password)
      if (result.success) {
        // The server action already set the signed unlock cookie -- refresh
        // re-runs the page's server component, which now resolves the
        // estimate normally instead of returning this form.
        router.refresh()
      } else {
        setError(result.error ?? t('Incorrect password. Please try again.'))
        setSubmitting(false)
      }
    } catch {
      setError(t('Something went wrong. Please try again.'))
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-24">
      <Card variant="glass">
        <CardContent className="p-6 sm:p-8 space-y-6 text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={companyName}
              className="mx-auto h-12 max-w-full object-contain"
            />
          ) : (
            <Lock className="mx-auto h-10 w-10" style={{ color: brandText }} aria-hidden />
          )}
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {t('This estimate is password-protected')}
            </h1>
            {companyName && (
              <p className="mt-1 text-sm text-muted-foreground">
                {t('Enter the password provided by')} {companyName}
              </p>
            )}
          </div>
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div className="space-y-2">
              <Label htmlFor="estimate-unlock-password">{t('Password')}</Label>
              <Input
                id="estimate-unlock-password"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              style={{ backgroundColor: brand, color: brandOnFill }}
              disabled={submitting || !password.trim()}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('Unlock estimate')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
