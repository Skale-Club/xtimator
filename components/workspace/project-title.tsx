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
  /** 'compact' is the editor top bar's one-line title. */
  size?: 'display' | 'compact'
  /** A streaming fallback displays the title without starting a draft. */
  canRename?: boolean
}

export function ProjectTitle({ projectId, initialName, onRenameSuccess, size = 'display', canRename = true }: ProjectTitleProps) {
  const [name, setName] = useState(initialName)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialName)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { t } = useTranslation()
  const compact = size === 'compact'
  const inputRef = useRef<HTMLInputElement>(null)
  const renameButtonRef = useRef<HTMLButtonElement>(null)
  const restoreRenameFocus = useRef(false)

  // Select the draft on entry and return keyboard focus when the trigger remounts.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    } else if (restoreRenameFocus.current) {
      restoreRenameFocus.current = false
      if (document.activeElement === document.body) renameButtonRef.current?.focus()
    }
  }, [editing])

  function enterEdit() {
    setDraft(name)
    setEditing(true)
  }

  function handleCancel() {
    restoreRenameFocus.current = true
    setEditing(false)
    setDraft(name)
  }

  function handleSubmit(fromKeyboard = false) {
    // Ignore blur while a keyboard close is already removing the input.
    if (isPending || restoreRenameFocus.current) return

    const trimmed = draft.trim()

    // No-op: nothing changed — just close edit mode without server call
    if (trimmed === name) {
      restoreRenameFocus.current = fromKeyboard
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
      restoreRenameFocus.current = fromKeyboard
      setEditing(false)
      onRenameSuccess?.(trimmed)
      router.refresh()
    })
  }

  if (canRename && editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        enterKeyHint="done"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleSubmit(true)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            handleCancel()
          }
        }}
        onBlur={() => handleSubmit()}
        disabled={isPending}
        maxLength={200}
        aria-label={t('Project name')}
        className={`${compact ? 'text-[16.5px] md:text-[19px] font-semibold tracking-[-0.01em] leading-tight' : 'text-[clamp(22px,5.5vw,40px)] font-semibold tracking-[-0.02em] leading-[1.15]'} bg-transparent border-b border-border focus:border-primary focus:outline-none w-full disabled:opacity-60`}
      />
    )
  }

  return (
    <div className="flex items-center gap-2 group min-w-0">
      {/* Mobile: up to 3 wrapped lines (the "Edit with AI" pill leaves the title only ~160px on a 360px phone) at a smaller size (no mid-word "…" cut);
          sm+: single-line ellipsis as before. Pencil is always visible on touch
          (no hover on mobile) and hover-revealed on desktop. */}
      <h1
        onClick={canRename ? enterEdit : undefined}
        className={`${compact ? 'min-w-0 truncate text-[16.5px] md:text-[19px] font-semibold tracking-[-0.01em] leading-tight' : 'min-w-0 line-clamp-3 break-words sm:line-clamp-1 text-[clamp(22px,5.5vw,40px)] font-semibold tracking-[-0.02em] leading-[1.15]'}${canRename ? ' cursor-pointer' : ''}`}
      >
        {name}
      </h1>
      <button
        ref={renameButtonRef}
        type="button"
        onClick={canRename ? enterEdit : undefined}
        disabled={!canRename}
        className={`inline-flex items-center justify-center rounded-md ${compact ? 'p-1' : 'p-1.5'} text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 disabled:pointer-events-none`}
        aria-label={t('Rename project')}
      >
        <Pencil className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </button>
    </div>
  )
}
