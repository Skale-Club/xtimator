'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { editEstimateHref } from '@/components/projects/new-project-dialog'
import { T } from '@/components/i18n/t'

/**
 * "Edit with AI" — opens the SAME multimodal New-Xtimate popup in edit mode for
 * the current project (shared between new-estimate and edit). Lives on the
 * project title line next to the status pill.
 */
export function EditEstimateHeaderButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  return (
    <Button
      variant="primary"
      size="sm"
      onClick={() =>
        router.push(editEstimateHref(searchParams.toString(), projectId), { scroll: false })
      }
      className="shrink-0 gap-1.5 rounded-full"
      data-testid="edit-with-ai-btn"
    >
      <Sparkles className="h-4 w-4" />
      <T>Edit with AI</T>
    </Button>
  )
}
