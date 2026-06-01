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

interface EventsControlsProps {
  search: string
  status: string
  inputType: string
  step: string
}

export function EventsControls({ search, status, inputType, step }: EventsControlsProps) {
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
    router.replace(`/admin/events?${params.toString()}`)
  }

  function handleRefresh() {
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8 h-8 text-sm"
          placeholder={t('Search by user, project, estimate, attempt ID, or error…')}
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

      {/* Status filter */}
      <Select value={status || 'all'} onValueChange={(v) => pushParam('status', v)}>
        <SelectTrigger className="h-8 text-sm w-[130px]">
          <SelectValue placeholder={t('Status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('All statuses')}</SelectItem>
          <SelectItem value="succeeded">{t('Succeeded')}</SelectItem>
          <SelectItem value="failed">{t('Failed')}</SelectItem>
          <SelectItem value="started">{t('In progress')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Input type filter */}
      <Select value={inputType || 'all'} onValueChange={(v) => pushParam('input_type', v)}>
        <SelectTrigger className="h-8 text-sm w-[140px]">
          <SelectValue placeholder={t('Input type')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('All types')}</SelectItem>
          <SelectItem value="recording">{t('Recording')}</SelectItem>
          <SelectItem value="photo">{t('Photo')}</SelectItem>
          <SelectItem value="manual_text">{t('Manual text')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Step filter */}
      <Select value={step || 'all'} onValueChange={(v) => pushParam('step', v)}>
        <SelectTrigger className="h-8 text-sm w-[170px]">
          <SelectValue placeholder={t('Step')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('All steps')}</SelectItem>
          <SelectItem value="save_recording">{t('Save recording')}</SelectItem>
          <SelectItem value="transcribe">{t('Transcribe')}</SelectItem>
          <SelectItem value="analyze">{t('Analyze')}</SelectItem>
          <SelectItem value="generate_estimate">{t('Generate estimate')}</SelectItem>
          <SelectItem value="preview_redirect">{t('Preview redirect')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Refresh — ml-auto pushes it right per UI-SPEC Discretion #3 */}
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
