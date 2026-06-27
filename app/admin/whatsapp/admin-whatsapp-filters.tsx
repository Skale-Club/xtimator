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

interface AdminWhatsAppFiltersProps {
  companyId: string | undefined
  senderId: string | undefined
  q: string | undefined
  status: string | undefined
  unreadOnly: boolean
  dateFrom: string | undefined
  dateTo: string | undefined
}

export function AdminWhatsAppFilters({
  companyId,
  senderId,
  q,
  status,
  unreadOnly,
  dateFrom,
  dateTo,
}: AdminWhatsAppFiltersProps) {
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
    // Reset to page 1 on filter change
    params.delete('page')
    router.replace(`/admin/whatsapp?${params.toString()}`)
  }

  function handleRefresh() {
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search by phone or contact name */}
      <div className="relative flex-1 min-w-[200px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8 h-8 text-sm"
          placeholder={t('Search by phone or contact name…')}
          defaultValue={q ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              pushParam('q', (e.target as HTMLInputElement).value)
            }
          }}
          onBlur={(e) => {
            if (e.target.value !== (q ?? '')) {
              pushParam('q', e.target.value)
            }
          }}
        />
      </div>

      {/* Status filter */}
      <Select value={status || 'all'} onValueChange={(v) => pushParam('status', v)}>
        <SelectTrigger className="h-8 text-sm w-[130px]">
          <SelectValue placeholder={t('Status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('All statuses')}</SelectItem>
          <SelectItem value="active">{t('Active')}</SelectItem>
          <SelectItem value="suspended">{t('Suspended')}</SelectItem>
          <SelectItem value="pending_review">{t('Pending review')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Unread only toggle */}
      <Select
        value={unreadOnly ? 'true' : 'all'}
        onValueChange={(v) => pushParam('unreadOnly', v)}
      >
        <SelectTrigger className="h-8 text-sm w-[120px]">
          <SelectValue placeholder={t('Unread')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('All')}</SelectItem>
          <SelectItem value="true">{t('Unread only')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Date from */}
      <Input
        type="date"
        className="h-8 text-sm w-[150px]"
        defaultValue={dateFrom ?? ''}
        onChange={(e) => {
          const params = new URLSearchParams(sp.toString())
          if (e.target.value) {
            params.set('dateFrom', e.target.value)
          } else {
            params.delete('dateFrom')
          }
          params.delete('page')
          router.replace(`/admin/whatsapp?${params.toString()}`)
        }}
      />

      {/* Date to */}
      <Input
        type="date"
        className="h-8 text-sm w-[150px]"
        defaultValue={dateTo ?? ''}
        onChange={(e) => {
          const params = new URLSearchParams(sp.toString())
          if (e.target.value) {
            params.set('dateTo', e.target.value)
          } else {
            params.delete('dateTo')
          }
          params.delete('page')
          router.replace(`/admin/whatsapp?${params.toString()}`)
        }}
      />

      {/* Clear filters */}
      {(companyId || senderId || q || status || unreadOnly || dateFrom || dateTo) && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => router.replace('/admin/whatsapp')}
        >
          {t('Clear filters')}
        </Button>
      )}

      {/* Refresh — ml-auto pushes it right */}
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
