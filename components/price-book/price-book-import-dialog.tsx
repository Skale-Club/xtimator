'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface PriceBookImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PriceBookImportDialog({ open, onOpenChange }: PriceBookImportDialogProps) {
  // Wave 1 fills in: stage state, file picker, parsePriceBookCsv call, preview table,
  // confirm/cancel buttons, importPriceBookItems action call, toast + router.refresh.
  const [_unused] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
        </DialogHeader>
        {/* Wave 1 content — file pick stage + preview stage */}
      </DialogContent>
    </Dialog>
  )
}
