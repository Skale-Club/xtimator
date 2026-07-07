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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
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
    router.replace(`/admin/inbox?${params.toString()}`)
  }

  function handleRefresh() {
    router.refresh()
  }

  const activeFilterCount = [
    status && status !== 'all',
    unreadOnly,
    dateFrom,
    dateTo,
    companyId,
    senderId,
  ].filter(Boolean).length

  return (
    <div className="flex items-center gap-2">
      {/* Search by phone or contact name - Takes up remaining space */}
      <div className="relative flex-1 min-w-0">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8 h-9 text-sm bg-[var(--glass-bg-light)] border-border/50 focus-visible:ring-1 focus-visible:ring-primary/30"
          placeholder={t('Search...')}
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

      {/* Advanced Filters Popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 relative bg-[var(--glass-bg-light)] border-border/50">
            <SlidersHorizontal size={15} className="text-muted-foreground" />
            {activeFilterCount > 0 && (
              <Badge 
                className="absolute -top-1.5 -right-1.5 h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-primary text-primary-foreground border-none"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4 space-y-4 shadow-xl" align="end">
          <div className="flex items-center justify-between pb-2 border-b">
            <h4 className="font-medium text-sm">{t('Filters')}</h4>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const params = new URLSearchParams(sp.toString())
                  params.delete('status')
                  params.delete('unreadOnly')
                  params.delete('dateFrom')
                  params.delete('dateTo')
                  params.delete('companyId')
                  params.delete('senderId')
                  router.replace(`/admin/inbox?${params.toString()}`)
                }}
              >
                {t('Clear all')}
              </Button>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t('Status')}</Label>
              <Select value={status || 'all'} onValueChange={(v) => pushParam('status', v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={t('Status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('All statuses')}</SelectItem>
                  <SelectItem value="active">{t('Active')}</SelectItem>
                  <SelectItem value="suspended">{t('Suspended')}</SelectItem>
                  <SelectItem value="pending_review">{t('Pending review')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t('Message Status')}</Label>
              <Select
                value={unreadOnly ? 'true' : 'all'}
                onValueChange={(v) => pushParam('unreadOnly', v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={t('Unread')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('All messages')}</SelectItem>
                  <SelectItem value="true">{t('Unread only')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t('From')}</Label>
                <Input
                  type="date"
                  className="h-8 text-sm"
                  defaultValue={dateFrom ?? ''}
                  onChange={(e) => pushParam('dateFrom', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t('To')}</Label>
                <Input
                  type="date"
                  className="h-8 text-sm"
                  defaultValue={dateTo ?? ''}
                  onChange={(e) => pushParam('dateTo', e.target.value)}
                />
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Refresh Button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={handleRefresh}
        title={t('Refresh')}
      >
        <RefreshCw size={15} />
      </Button>
    </div>
  )
}
