'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RefreshCw, Search } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { tiers } from '@/lib/entitlements'

interface CompaniesControlsProps {
  search: string
  tier: string
  override: string
  demo: string
}

export function CompaniesControls({ search, tier, override, demo }: CompaniesControlsProps) {
  const router = useRouter()
  const sp = useSearchParams()
  const { t } = useTranslation()

  function pushParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString())
    if (value && value !== 'all') {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('page') // Reset to page 1 on filter change
    router.replace(`/admin/companies?${params.toString()}`)
  }

  function handleRefresh() {
    router.refresh()
  }

  const tierOptions = Object.keys(tiers) // ['free', 'pro', 'business']

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8 h-8 text-sm"
          placeholder={t('Search by name or email…')}
          defaultValue={search}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              pushParam('q', (e.target as HTMLInputElement).value)
            }
          }}
          onBlur={(e) => {
            if (e.target.value !== search) {
              pushParam('q', e.target.value)
            }
          }}
        />
      </div>

      {/* Tier filter */}
      <Select value={tier || 'all'} onValueChange={(v) => pushParam('tier', v)}>
        <SelectTrigger className="h-8 text-sm w-[120px]">
          <SelectValue placeholder={t('Tier')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('All tiers')}</SelectItem>
          {tierOptions.map((tv) => (
            <SelectItem key={tv} value={tv}>
              {tv.charAt(0).toUpperCase() + tv.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* AI override filter */}
      <Select value={override || 'all'} onValueChange={(v) => pushParam('override', v)}>
        <SelectTrigger className="h-8 text-sm w-[160px]">
          <SelectValue placeholder={t('AI override')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('Any')}</SelectItem>
          <SelectItem value="has">{t('Has override')}</SelectItem>
          <SelectItem value="none">{t('Platform default')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Demo vs real filter */}
      <Select value={demo || 'all'} onValueChange={(v) => pushParam('demo', v)}>
        <SelectTrigger className="h-8 text-sm w-[120px]">
          <SelectValue placeholder={t('Demo / Real')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('Any')}</SelectItem>
          <SelectItem value="demo">{t('Demo')}</SelectItem>
          <SelectItem value="real">{t('Real')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Refresh — ml-auto pushes it right, per UI-SPEC decision #1 (included for parity with Event Log) */}
      <Button
        variant="outline"
        size="sm"
        className="ml-auto h-8 gap-1.5 text-xs"
        onClick={handleRefresh}
      >
        <RefreshCw size={13} />
        {t('Refresh')}
      </Button>
    </div>
  )
}
