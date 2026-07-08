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
  onRenameSuccess?: (name: string) => void
}

export function ProjectTitle({ projectId, initialName, onRenameSuccess }: ProjectTitleProps) {
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
      onRenameSuccess?.(trimmed)
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
        className="text-[clamp(22px,5.5vw,40px)] font-semibold tracking-[-0.02em] leading-[1.15] bg-transparent border-b border-border focus:border-primary focus:outline-none w-full disabled:opacity-60"
      />
    )
  }

  return (
    <div className="flex items-center gap-2 group min-w-0">
      {/* Mobile: up to 2 wrapped lines at a smaller size (no mid-word "…" cut);
          sm+: single-line ellipsis as before. Pencil is always visible on touch
          (no hover on mobile) and hover-revealed on desktop. */}
      <h1
        onClick={enterEdit}
        className="min-w-0 line-clamp-2 break-words sm:line-clamp-1 text-[clamp(22px,5.5vw,40px)] font-semibold tracking-[-0.02em] leading-[1.15] cursor-pointer"
      >
        {name}
      </h1>
      <button
        type="button"
        onClick={enterEdit}
        className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors opacity-60 sm:opacity-0 sm:group-hover:opacity-100 shrink-0"
        aria-label={t('Rename project')}
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  )
}
