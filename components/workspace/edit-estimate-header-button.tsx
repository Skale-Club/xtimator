'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CaptureModePicker } from '@/components/workspace/capture-mode-picker'
import { captureHref, type CaptureMode } from '@/components/projects/estimate-creation-popup'

export function EditEstimateHeaderButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleSelect(mode: CaptureMode) {
    router.push(captureHref({ pathname, search: searchParams.toString(), mode, projectId }))
  }

  return (
    <>
      <Button
        variant="primary"
        size="lg"
        onClick={() => setOpen(true)}
        className="shrink-0 min-h-[44px] rounded-full gap-2"
      >
        <Pencil className="h-4 w-4" />
        Edit Estimate
      </Button>
      <CaptureModePicker open={open} onOpenChange={setOpen} onSelect={handleSelect} />
    </>
  )
}
