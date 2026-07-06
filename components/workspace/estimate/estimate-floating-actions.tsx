'use client'

import type { ReactNode } from 'react'
import {
  Send, RotateCcw, Pencil, MoreHorizontal, UserPlus,
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
  isCurrent: boolean
  isDirty: boolean
  status: Status
  onSend: () => void
  onDiscard: () => void
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
// Main export
// ---------------------------------------------------------------------------

export function EstimateFloatingActions({
  isCurrent,
  isDirty,
  status,
  onSend,
  onDiscard,
  onRecord,
  linkClientSlot,
}: EstimateFloatingActionsProps) {
  if (!isCurrent) return null

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
        <Button size="sm" onClick={onSend} disabled={isSaving} className="rounded-full gap-1.5">
          <Send className="h-3.5 w-3.5" />
          Send
        </Button>
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
          onClick={onSend}
          disabled={isSaving}
          className="flex-1 gap-1.5 rounded-full"
        >
          <Send className="h-4 w-4" />
          Send
        </Button>
      </MobileBar>
    </>
  )
}
