'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import { History } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import {
  wizardReducer,
  initialWizardState,
  serializeDraft,
  deserializeDraft,
  type WizardStep,
} from '@/lib/csv/wizard-state'
import { StepIndicator } from './StepIndicator'
import { Step1Upload } from './Step1Upload'
import { Step2Map } from './Step2Map'
import { Step3Preview } from './Step3Preview'
import { Step4Confirm } from './Step4Confirm'

const DRAFT_KEY = 'xtimator:price-book-import:draft:v1'

const STEP_TITLES: Record<WizardStep, { title: string; description: string }> = {
  upload: {
    title: 'Import items from CSV',
    description:
      "Upload a spreadsheet exported from QuickBooks, Excel, or Google Sheets. We'll handle the mess.",
  },
  map: {
    title: 'Match your columns',
    description:
      "Tell us which spreadsheet column maps to which field. We've guessed where we can.",
  },
  preview: {
    title: 'Review your items',
    description: 'Click any cell to fix it. Choose how to handle duplicates below.',
  },
  confirm: {
    title: 'Ready to import',
    description: 'Final check before we add these to your Price Book.',
  },
}

export interface PriceBookImportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PriceBookImportWizard({ open, onOpenChange }: PriceBookImportWizardProps) {
  const { t } = useTranslation()
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [draftRestoredAt, setDraftRestoredAt] = useState<number | null>(null)
  const [draftAlertDismissed, setDraftAlertDismissed] = useState(false)
  const lastSavedRef = useRef<string>('')

  // On open: try restore draft
  useEffect(() => {
    if (!open) return
    if (typeof window === 'undefined') return
    try {
      const json = sessionStorage.getItem(DRAFT_KEY)
      if (!json) return
      const restored = deserializeDraft(json)
      if (restored) {
        dispatch({ type: 'RESTORE_DRAFT', draft: restored })
        setDraftRestoredAt(new Date(restored.savedAt).getTime())
        setDraftAlertDismissed(false)
      }
    } catch {
      // sessionStorage may be unavailable (Safari private, SSR) — ignore.
    }
  }, [open])

  // Persist on state change
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (state.savedAt === initialWizardState.savedAt) return
    if (state.savedAt === lastSavedRef.current) return
    try {
      sessionStorage.setItem(DRAFT_KEY, serializeDraft(state))
      lastSavedRef.current = state.savedAt
    } catch {
      // ignore
    }
  }, [state])

  const isMidProgress = state.step !== 'upload' || state.fileName !== null

  function handleClose() {
    if (!isMidProgress) {
      onOpenChange(false)
      return
    }
    setShowCloseConfirm(true)
  }

  function confirmSaveAndClose() {
    setShowCloseConfirm(false)
    onOpenChange(false)
  }

  function confirmDiscard() {
    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
    dispatch({ type: 'RESET' })
    setShowCloseConfirm(false)
    setDraftRestoredAt(null)
    onOpenChange(false)
  }

  function handleStartOver() {
    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
    dispatch({ type: 'RESET' })
    setDraftRestoredAt(null)
  }

  function handleSuccessClose() {
    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
    dispatch({ type: 'RESET' })
    setDraftRestoredAt(null)
    onOpenChange(false)
  }

  function handleStepClick(step: WizardStep) {
    const order: WizardStep[] = ['upload', 'map', 'preview', 'confirm']
    const currentIdx = order.indexOf(state.step)
    const targetIdx = order.indexOf(step)
    if (targetIdx >= 0 && targetIdx < currentIdx) {
      // back-track via BACK dispatches so reducer stays the source of truth
      let diff = currentIdx - targetIdx
      while (diff > 0) {
        dispatch({ type: 'BACK' })
        diff--
      }
    }
  }

  const { title, description } = STEP_TITLES[state.step]

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) handleClose()
          else onOpenChange(true)
        }}
      >
        <DialogContent className="sm:max-w-3xl max-w-[calc(100%-2rem)] max-h-[85vh] flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{t(title)}</DialogTitle>
            <DialogDescription>{t(description)}</DialogDescription>
          </DialogHeader>

          <StepIndicator currentStep={state.step} onStepClick={handleStepClick} />

          {draftRestoredAt && !draftAlertDismissed && (
            <Alert>
              <History className="h-4 w-4" />
              <AlertTitle>{t('Picked up where you left off')}</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-2">
                <span>
                  {t('Your draft is restored. Start over if you would rather.')}
                  {state.file === null && state.fileName !== null && (
                    <span className="block text-xs mt-1">
                      {t('Re-upload')} <strong>{state.fileName}</strong> {t('to continue.')}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={handleStartOver}>
                    {t('Start over')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDraftAlertDismissed(true)}
                    aria-label={t('Dismiss')}
                  >
                    ×
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2">
            {state.step === 'upload' && (
              <Step1Upload state={state} dispatch={dispatch} onCancel={handleClose} />
            )}
            {state.step === 'map' && (
              <Step2Map state={state} dispatch={dispatch} onCancel={handleClose} />
            )}
            {state.step === 'preview' && (
              <Step3Preview state={state} dispatch={dispatch} onCancel={handleClose} />
            )}
            {state.step === 'confirm' && (
              <Step4Confirm
                state={state}
                dispatch={dispatch}
                onCancel={handleClose}
                onDone={handleSuccessClose}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Save and close?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "We'll keep your progress for 24 hours. Reopen the importer to continue where you left off.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost" onClick={confirmDiscard}>
                {t('Discard')}
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmSaveAndClose}>
              {t('Save and close')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
