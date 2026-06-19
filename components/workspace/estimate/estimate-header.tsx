'use client'

import { type Dispatch } from 'react'
import { RefreshCw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { EstimateEditorState, EstimateAction } from './use-estimate-reducer'

interface EstimateHeaderProps {
  state: EstimateEditorState
  dispatch: Dispatch<EstimateAction>
  onRegenerate: () => void
  isReadOnly?: boolean
  isCurrent?: boolean
}

export function EstimateHeader({
  state,
  dispatch,
  onRegenerate,
  isReadOnly,
  isCurrent = true,
}: EstimateHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {!isReadOnly && (
          <Button variant="outline" size="sm" onClick={onRegenerate} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </Button>
        )}
        {!isCurrent && (
          <Badge variant="secondary">Read-only | older version</Badge>
        )}
      </div>

      {/* Editable fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-sm font-medium mb-1.5 block">Summary</label>
          <Textarea
            value={state.summary ?? ''}
            onChange={(e) => dispatch({ type: 'UPDATE_FIELD', field: 'summary', value: e.target.value || null })}
            placeholder="Estimate summary..."
            rows={3}
            disabled={isReadOnly}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium mb-1.5 block">Notes</label>
          <Textarea
            value={state.notes ?? ''}
            onChange={(e) => dispatch({ type: 'UPDATE_FIELD', field: 'notes', value: e.target.value || null })}
            placeholder="Additional notes..."
            rows={2}
            disabled={isReadOnly}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">Timeline</label>
          <Input
            value={state.timeline ?? ''}
            onChange={(e) => dispatch({ type: 'UPDATE_FIELD', field: 'timeline', value: e.target.value || null })}
            placeholder="e.g., 2-3 weeks"
            disabled={isReadOnly}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">Payment Terms</label>
          <Textarea
            value={state.payment_terms ?? ''}
            onChange={(e) => dispatch({ type: 'UPDATE_FIELD', field: 'payment_terms', value: e.target.value || null })}
            placeholder="Payment terms..."
            rows={2}
            disabled={isReadOnly}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium mb-1.5 block">Warranty Terms</label>
          <Textarea
            value={state.warranty_terms ?? ''}
            onChange={(e) => dispatch({ type: 'UPDATE_FIELD', field: 'warranty_terms', value: e.target.value || null })}
            placeholder="Warranty terms..."
            rows={2}
            disabled={isReadOnly}
          />
        </div>
      </div>
    </div>
  )
}
