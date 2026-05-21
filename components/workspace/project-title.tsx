'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { renameProjectAction } from '@/lib/actions/project'
import { useTranslation } from '@/lib/i18n/use-translation'

interface ProjectTitleProps {
  projectId: string
  initialName: string
}

export function ProjectTitle({ projectId, initialName }: ProjectTitleProps) {
  const [name, setName] = useState(initialName)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialName)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus + select-all when entering edit mode
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function enterEdit() {
    setDraft(name)
    setEditing(true)
  }

  function handleCancel() {
    setEditing(false)
    setDraft(name)
  }

  function handleSubmit() {
    // Guard against double-submit (Enter then blur during pending save)
    if (isPending) return

    const trimmed = draft.trim()

    // No-op: nothing changed — just close edit mode without server call
    if (trimmed === name) {
      setEditing(false)
      return
    }

    // Client-side validation mirrors server-side
    if (trimmed.length === 0) {
      toast.error(t('Project name is required'))
      return
    }
    if (trimmed.length > 200) {
      toast.error(t('Name must be 200 characters or less'))
      return
    }

    startTransition(async () => {
      const result = await renameProjectAction(projectId, trimmed)
      if (result.error) {
        toast.error(result.error)
        // Revert draft to last saved name; keep editing open so user can retry
        setDraft(name)
        return
      }
      setName(trimmed)
      setEditing(false)
      router.refresh()
    })
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleSubmit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            handleCancel()
          }
        }}
        onBlur={handleSubmit}
        disabled={isPending}
        maxLength={200}
        aria-label={t('Project name')}
        className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-[-0.02em] leading-[1.1] bg-transparent border-b border-border focus:border-primary focus:outline-none w-full disabled:opacity-60"
      />
    )
  }

  return (
    <div className="flex items-center gap-2">
      <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-[-0.02em] leading-[1.1]">
        {name}
      </h1>
      <button
        type="button"
        onClick={enterEdit}
        className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label={t('Rename project')}
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  )
}
