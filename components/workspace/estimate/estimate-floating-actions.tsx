'use client'

import { Loader2, Save, CheckCircle2, Plus, Lock, RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type Status = 'idle' | 'saving' | 'saved' | 'error'

interface EstimateFloatingActionsProps {
  workflowStatus: 'draft' | 'consolidated'
  isCurrent: boolean
  isDirty: boolean
  status: Status
  onSaveDraft: () => void
  onConsolidate: () => void
  onDiscard: () => void
  onNewVersion: () => void
  isNewVersionPending?: boolean
}

/**
 * Bottom-right floating action panel. Replaces the 2s autosave from SEED-028 Phase B.
 *
 * - Draft + dirty: Save Draft / Consolidate / Discard
 * - Draft + clean: Save Draft & Discard disabled, Consolidate enabled
 * - Consolidated + current: New Version
 * - Non-current version: hidden
 */
export function EstimateFloatingActions({
  workflowStatus,
  isCurrent,
  isDirty,
  status,
  onSaveDraft,
  onConsolidate,
  onDiscard,
  onNewVersion,
  isNewVersionPending,
}: EstimateFloatingActionsProps) {
  // Old versions are inert.
  if (!isCurrent) return null

  // Consolidated current version: offer to fork a new draft.
  if (workflowStatus === 'consolidated') {
    return (
      <div
        className="fixed right-4 bottom-4 z-40 sm:right-6 sm:bottom-6"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Button
          size="lg"
          onClick={onNewVersion}
          disabled={isNewVersionPending}
          className="shadow-lg gap-2"
        >
          {isNewVersionPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New version
        </Button>
      </div>
    )
  }

  // Draft: show the brief "Saved" pulse right after a successful save.
  // Every other draft state (clean+idle, clean+error, dirty, saving) falls
  // through to the action cluster below.
  if (!isDirty && status === 'saved') {
    return (
      <div
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-[hsl(var(--success)/0.12)] px-4 py-2 text-sm text-[hsl(var(--success))] shadow-md sm:right-6 sm:bottom-6"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <CheckCircle2 className="h-4 w-4" />
        <span>Saved</span>
      </div>
    )
  }

  // Draft: render the action cluster (Save/Discard disabled when clean, Consolidate always enabled).
  const isSaving = status === 'saving'

  return (
    <div
      className="fixed right-4 bottom-4 z-40 sm:right-6 sm:bottom-6"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center gap-2 rounded-full border border-border bg-background/95 p-1.5 shadow-xl backdrop-blur">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              disabled={isSaving || !isDirty}
              className="rounded-full text-muted-foreground gap-1.5"
              aria-label="Discard changes"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Discard
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
              <AlertDialogDescription>
                Your in-progress edits will be lost and the editor will reload the last saved draft.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction onClick={onDiscard}>Discard</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button
          size="sm"
          variant="secondary"
          onClick={onSaveDraft}
          disabled={isSaving || !isDirty}
          className="rounded-full gap-1.5"
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save draft
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              disabled={isSaving}
              className="rounded-full gap-1.5"
            >
              <Lock className="h-3.5 w-3.5" />
              Consolidate
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Consolidate this estimate?
                </span>
              </AlertDialogTitle>
              <AlertDialogDescription>
                Consolidating saves your changes and locks this version. After
                that you can send it as PDF, email, SMS or share link. To make
                further changes, create a new version from this one.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Not yet</AlertDialogCancel>
              <AlertDialogAction onClick={onConsolidate}>
                Save & consolidate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
