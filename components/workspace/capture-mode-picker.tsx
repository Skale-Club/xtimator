'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StepModalitySelect } from '@/components/projects/step-modality-select'
import type { InputMode } from '@/lib/schemas/project'
import type { CaptureMode } from '@/components/projects/estimate-creation-popup'

interface CaptureModePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (mode: CaptureMode) => void
}

export function CaptureModePicker({ open, onOpenChange, onSelect }: CaptureModePickerProps) {
  function handleSelect(mode: InputMode) {
    if (mode === 'mixed') return
    onOpenChange(false)
    onSelect(mode as CaptureMode)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add input to estimate</DialogTitle>
        </DialogHeader>
        <div className="pt-2 pb-1">
          <StepModalitySelect onSelect={handleSelect} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
