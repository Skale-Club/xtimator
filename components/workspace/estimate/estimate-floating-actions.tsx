'use client'

import type { ReactNode } from 'react'
import {
  Loader2, Save, CheckCircle2, Plus, Lock,
  RotateCcw, Sparkles, Pencil, MoreHorizontal, UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
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
  onRecord?: () => void
  linkClientSlot?: ReactNode
}

// ---------------------------------------------------------------------------
// Desktop pill — unchanged layout
// ---------------------------------------------------------------------------

function DesktopPill({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-6 z-40 hidden md:flex justify-center pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-background/95 p-1.5 shadow-xl backdrop-blur">
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mobile bar — floating pill with lateral margin
// ---------------------------------------------------------------------------

function MobileBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-3 z-40 md:hidden flex px-4 pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="pointer-events-auto flex-1 flex items-center gap-2 rounded-full border border-border bg-background/95 backdrop-blur px-3 py-1.5 shadow-xl">
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared: Discard alert wrapper
// ---------------------------------------------------------------------------

function DiscardAlert({ onDiscard, children }: { onDiscard: () => void; children: ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
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
  )
}

// ---------------------------------------------------------------------------
// Shared: Consolidate alert wrapper
// ---------------------------------------------------------------------------

function ConsolidateAlert({ onConsolidate, children }: { onConsolidate: () => void; children: ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Consolidate this estimate?
            </span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            Consolidating saves your changes and locks this version. After that you can
            send it as PDF, email, SMS or share link. To make further changes, create a
            new version from this one.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <AlertDialogAction onClick={onConsolidate}>Save & consolidate</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

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
  onRecord,
  linkClientSlot,
}: EstimateFloatingActionsProps) {
  if (!isCurrent) return null

  // ── Saved confirmation flash ──────────────────────────────────────────────
  if (!isDirty && status === 'saved') {
    return (
      <>
        <div
          className="sticky bottom-6 z-40 hidden md:flex justify-center"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--success)/0.12)] px-4 py-2 text-sm text-[hsl(var(--success))] shadow-md">
            <CheckCircle2 className="h-4 w-4" />
            <span>Saved</span>
          </div>
        </div>
        <div
          className="sticky bottom-3 z-40 md:hidden flex px-4"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex-1 flex items-center justify-center gap-2 rounded-full bg-[hsl(var(--success)/0.12)] py-2 text-sm text-[hsl(var(--success))] shadow-md">
            <CheckCircle2 className="h-4 w-4" />
            Saved
          </div>
        </div>
      </>
    )
  }

  // ── Consolidated ──────────────────────────────────────────────────────────
  if (workflowStatus === 'consolidated') {
    return (
      <>
        {/* Desktop */}
        <DesktopPill>
          {/* md–lg: overflow dropdown for secondary actions */}
          {(onRecord || linkClientSlot) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="flex lg:hidden rounded-full px-2.5">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top">
                {onRecord && (
                  <DropdownMenuItem onClick={onRecord} className="gap-2">
                    <Pencil className="h-3.5 w-3.5" /> Edit Estimate
                  </DropdownMenuItem>
                )}
                {linkClientSlot && (
                  <DropdownMenuItem asChild>
                    <span className="flex items-center gap-2 cursor-pointer">
                      <UserPlus className="h-3.5 w-3.5" /> Link Client
                    </span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {/* lg+: secondary actions inline */}
          {onRecord && (
            <Button size="sm" variant="ghost" onClick={onRecord} className="hidden lg:inline-flex rounded-full gap-1.5 text-foreground">
              <Pencil className="h-3.5 w-3.5" />
              Edit Estimate
            </Button>
          )}
          {linkClientSlot && <span className="hidden lg:contents">{linkClientSlot}</span>}
          <Button size="sm" onClick={onNewVersion} disabled={isNewVersionPending} className="rounded-full gap-1.5">
            {isNewVersionPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            New version
          </Button>
        </DesktopPill>

        {/* Mobile */}
        <MobileBar>
          {(onRecord || linkClientSlot) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="rounded-full px-2.5">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top">
                {onRecord && (
                  <DropdownMenuItem onClick={onRecord} className="gap-2">
                    <Pencil className="h-3.5 w-3.5" /> Edit Estimate
                  </DropdownMenuItem>
                )}
                {linkClientSlot && (
                  <DropdownMenuItem asChild>
                    <span className="flex items-center gap-2 cursor-pointer">
                      <UserPlus className="h-3.5 w-3.5" /> Link Client
                    </span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            size="sm"
            onClick={onNewVersion}
            disabled={isNewVersionPending}
            className="flex-1 gap-1.5 rounded-full"
          >
            {isNewVersionPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            New version
          </Button>
        </MobileBar>
      </>
    )
  }

  // ── Draft ─────────────────────────────────────────────────────────────────
  const isSaving = status === 'saving'

  return (
    <>
      {/* Desktop pill */}
      <DesktopPill>
        {/* md–lg: overflow dropdown for secondary actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="flex lg:hidden rounded-full px-2.5">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            {onRecord && (
              <DropdownMenuItem onClick={onRecord} disabled={isSaving} className="gap-2">
                <Pencil className="h-3.5 w-3.5" /> Edit Estimate
              </DropdownMenuItem>
            )}
            {linkClientSlot && (
              <DropdownMenuItem className="gap-2 p-0">
                <span className="flex items-center gap-2 px-2 py-1.5 w-full">
                  <UserPlus className="h-3.5 w-3.5" />{linkClientSlot}
                </span>
              </DropdownMenuItem>
            )}
            {(onRecord || linkClientSlot) && <DropdownMenuSeparator />}
            <DiscardAlert onDiscard={onDiscard}>
              <DropdownMenuItem
                disabled={isSaving || !isDirty}
                onSelect={(e) => e.preventDefault()}
                className="gap-2 text-muted-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Discard changes
              </DropdownMenuItem>
            </DiscardAlert>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* lg+: secondary actions inline */}
        {onRecord && (
          <Button size="sm" variant="ghost" onClick={onRecord} disabled={isSaving} className="hidden lg:inline-flex rounded-full gap-1.5 text-foreground">
            <Pencil className="h-3.5 w-3.5" />
            Edit Estimate
          </Button>
        )}
        {linkClientSlot && <span className="hidden lg:contents">{linkClientSlot}</span>}
        <DiscardAlert onDiscard={onDiscard}>
          <Button size="sm" variant="ghost" disabled={isSaving || !isDirty} className="hidden lg:inline-flex rounded-full text-muted-foreground gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Discard
          </Button>
        </DiscardAlert>
        <Button size="sm" variant="secondary" onClick={onSaveDraft} disabled={isSaving || !isDirty} className="rounded-full gap-1.5">
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save draft
        </Button>
        <ConsolidateAlert onConsolidate={onConsolidate}>
          <Button size="sm" disabled={isSaving} className="rounded-full gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            Consolidate
          </Button>
        </ConsolidateAlert>
      </DesktopPill>

      {/* Mobile bar */}
      <MobileBar>
        {/* Overflow: secondary actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="rounded-full px-2.5 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            {onRecord && (
              <DropdownMenuItem onClick={onRecord} disabled={isSaving} className="gap-2">
                <Pencil className="h-3.5 w-3.5" /> Edit Estimate
              </DropdownMenuItem>
            )}
            {linkClientSlot && (
              <DropdownMenuItem className="gap-2 p-0">
                <span className="flex items-center gap-2 px-2 py-1.5 w-full">
                  <UserPlus className="h-3.5 w-3.5" />{linkClientSlot}
                </span>
              </DropdownMenuItem>
            )}
            {(onRecord || linkClientSlot) && <DropdownMenuSeparator />}
            <DiscardAlert onDiscard={onDiscard}>
              <DropdownMenuItem
                disabled={isSaving || !isDirty}
                onSelect={(e) => e.preventDefault()}
                className="gap-2 text-muted-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Discard changes
              </DropdownMenuItem>
            </DiscardAlert>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Primary actions */}
        <Button
          size="sm"
          variant="secondary"
          onClick={onSaveDraft}
          disabled={isSaving || !isDirty}
          className="flex-1 gap-1.5 rounded-full"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save draft
        </Button>

        <ConsolidateAlert onConsolidate={onConsolidate}>
          <Button size="sm" disabled={isSaving} className="flex-1 gap-1.5 rounded-full">
            <Lock className="h-4 w-4" />
            Consolidate
          </Button>
        </ConsolidateAlert>
      </MobileBar>
    </>
  )
}
