'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileText, Minus, Plus, Receipt, Share2, Trash2 } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { DockButton } from '@/components/workspace/editor-frame/dock-button'
import { formatDate } from '@/lib/estimate/document/format'
import { formatCurrency } from '@/lib/utils/format'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import {
  computeChangeOrderTotals,
  formatChangeOrderNumber,
  formatTaxRatePercent,
  type ChangeOrder,
  type ChangeOrderResponse,
  type ChangeOrderInvoice,
  type ContractSummary,
} from '@/lib/change-orders/types'
import { realChangeOrderActions, type ChangeOrderActions } from './change-order-actions'
import { ChangeOrderShareSheet } from './change-order-share-sheet'
import { ChangeOrderInvoiceSheet } from './change-order-invoice-sheet'
import { ChangeOrderInvoiceRow } from './change-order-invoice-row'
import { ChangeOrderStatusSheet } from './change-order-status-sheet'
import { ChangeOrderTopBar, CO_GUTTER, type CoSaveStatus } from './change-order-top-bar'
import { isReloadingForNewBuild, recoverFromStaleBuild, takeDraft } from '@/lib/deploy/stale-build'
import {
  blankLine,
  isBlankLine,
  lineFromItem,
  LinesEditor,
  lineUnitPrice,
  type LineDraft,
} from './change-order-lines'
import { deriveChangeOrderStatus, formatSigned } from './change-order-utils'
import { usePaywallReadOnly } from '@/components/billing/paywall-read-only'

const AUTOSAVE_MS = 1500

export interface ChangeOrderEditorCompany {
  name: string
  logo_url: string | null
  phone: string | null
  digital_signature_enabled: boolean
  brand_primary_color?: string | null
}

export interface ChangeOrderEditorProps {
  changeOrder: ChangeOrder
  /** Null when the summary could not be loaded: the contract rows are hidden. */
  contract: ContractSummary | null
  project: { id: string; name: string; clientName: string | null }
  company: ChangeOrderEditorCompany
  /**
   * Invoicing of this change order on its own: whether the company can take
   * payments, and its live invoice (open or paid) when there is one.
   */
  invoicing?: { paymentsEnabled: boolean; invoice: ChangeOrderInvoice | null }
  /** Defaults to the real server actions; tests and the dev fixture inject fakes. */
  actions?: Partial<ChangeOrderActions>
}

interface Fields {
  title: string
  reason: string
  extraDays: string
  lines: LineDraft[]
}

function fieldsFromChangeOrder(co: ChangeOrder): Fields {
  return {
    title: co.title,
    reason: co.reason ?? '',
    extraDays: co.extra_days == null ? '' : String(co.extra_days),
    lines: [...co.items].sort((a, b) => a.sort_order - b.sort_order).map(lineFromItem),
  }
}

function parseExtraDays(value: string): number | null {
  if (value.trim() === '') return null
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n >= 0 ? n : null
}

const PAPER_INPUT =
  'w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-neutral-900 outline-none placeholder:text-neutral-400 hover:border-neutral-200 focus:border-[hsl(var(--primary))] focus:bg-white focus:ring-2 focus:ring-[hsl(var(--primary)/0.25)] disabled:border-transparent disabled:px-0 disabled:opacity-100'

/**
 * Owner-side change order editor: top bar, the paper (company header, reference
 * to the accepted estimate, title, reason, lines, totals, signature) and a docked
 * action bar. Autosaves 1.5 s after the last edit with compare-and-set on
 * updated_at. Read-only as soon as the client answered or signed.
 */
export function ChangeOrderEditor({ changeOrder, contract, project, company, invoicing, actions }: ChangeOrderEditorProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const api = useMemo<ChangeOrderActions>(() => ({ ...realChangeOrderActions, ...actions }), [actions])
  const apiRef = useRef(api)
  apiRef.current = api

  // ---- Editable fields ----------------------------------------------------
  const [fields, setFields] = useState<Fields>(() => fieldsFromChangeOrder(changeOrder))
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields

  // Server-owned state that changes without an edit (share, answer).
  const [meta, setMeta] = useState({
    sent_at: changeOrder.sent_at,
    view_count: changeOrder.view_count,
    viewed_at: changeOrder.viewed_at,
    client_response: changeOrder.client_response,
    responded_at: changeOrder.responded_at,
  })
  const [lockedByServer, setLockedByServer] = useState(false)

  const signature = changeOrder.signature
  const signedOnline = changeOrder.hasSignature || !!signature
  // A paywalled company is read-only on the server (billingEditDenied): the
  // change order locks like an answered one instead of failing every save.
  const paywalled = usePaywallReadOnly()
  const locked = lockedByServer || meta.client_response !== null || signedOnline || paywalled
  const status = deriveChangeOrderStatus({
    sentAt: meta.sent_at,
    viewCount: meta.view_count,
    clientResponse: meta.client_response,
  })

  // ---- Autosave -----------------------------------------------------------
  const updatedAtRef = useRef(changeOrder.updated_at)
  const [dirtyVersion, setDirtyVersion] = useState(0)
  const [savedVersion, setSavedVersion] = useState(0)
  const dirtyVersionRef = useRef(0)
  const savedVersionRef = useRef(0)
  const savingRef = useRef(false)
  const [saveStatus, setSaveStatus] = useState<CoSaveStatus>('idle')
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const lockedRef = useRef(locked)
  lockedRef.current = locked
  const isDirty = dirtyVersion > savedVersion

  const edit = useCallback((updater: (f: Fields) => Fields) => {
    setFields((prev) => updater(prev))
    dirtyVersionRef.current += 1
    setDirtyVersion(dirtyVersionRef.current)
  }, [])

  // A draft stashed because a save failed across a deploy (lib/deploy/stale-build):
  // put it back as unsaved edits, so this build saves it. Only taken when the
  // server copy is still the one the draft was based on.
  const draftKey = `change-order:${changeOrder.id}`
  useEffect(() => {
    const draft = takeDraft<Fields>(draftKey, changeOrder.updated_at)
    if (draft) edit(() => draft)
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Server data changed (router.refresh): adopt it unless unsaved edits are waiting.
  const seenServerRef = useRef(changeOrder)
  useEffect(() => {
    if (seenServerRef.current === changeOrder) return
    seenServerRef.current = changeOrder
    setMeta({
      sent_at: changeOrder.sent_at,
      view_count: changeOrder.view_count,
      viewed_at: changeOrder.viewed_at,
      client_response: changeOrder.client_response,
      responded_at: changeOrder.responded_at,
    })
    if (changeOrder.client_response === null && !changeOrder.hasSignature) setLockedByServer(false)
    const hasUnsaved = dirtyVersionRef.current > savedVersionRef.current
    if (!hasUnsaved || pausedRef.current) {
      setFields(fieldsFromChangeOrder(changeOrder))
      updatedAtRef.current = changeOrder.updated_at
      dirtyVersionRef.current = 0
      savedVersionRef.current = 0
      setDirtyVersion(0)
      setSavedVersion(0)
      pausedRef.current = false
      setPaused(false)
      setSaveStatus('idle')
      toast.dismiss('change-order-conflict')
    }
  }, [changeOrder])

  const runSave = useCallback(async (): Promise<boolean> => {
    if (lockedRef.current || savingRef.current) return false
    const startedVersion = dirtyVersionRef.current
    const f = fieldsRef.current
    savingRef.current = true
    setSaveStatus('saving')
    try {
      const result = await apiRef.current.saveChangeOrder({
        id: changeOrder.id,
        expectedUpdatedAt: updatedAtRef.current,
        title: f.title,
        reason: f.reason.trim() === '' ? null : f.reason,
        extra_days: parseExtraDays(f.extraDays),
        items: f.lines
          .filter((l) => !isBlankLine(l))
          .map((l, i) => ({
            id: l.id,
            description: l.description,
            quantity: Number(l.quantity) || 0,
            unit: l.unit.trim() === '' ? null : l.unit.trim(),
            unit_price: lineUnitPrice(l),
            taxable: l.taxable,
            sort_order: i,
          })),
      })
      if (result.error) {
        if (result.error === 'change_order_locked') {
          setSaveStatus('idle')
          setLockedByServer(true)
          toast.error(t('The client has already answered this change order, so it can no longer be edited.'))
          router.refresh()
          return false
        }
        setSaveStatus('error')
        if (result.conflict) {
          pausedRef.current = true
          setPaused(true)
          toast.error(t('This change order was changed somewhere else.'), {
            id: 'change-order-conflict',
            duration: Infinity,
            action: { label: t('Reload'), onClick: () => router.refresh() },
          })
          return false
        }
        if (await recoverFromStaleBuild(draftKey, updatedAtRef.current, fieldsRef.current)) return false
        toast.error(t('Could not save your changes. Try again.'))
        return false
      }
      if (!result.data) {
        setSaveStatus('error')
        return false
      }
      updatedAtRef.current = result.data.updated_at
      // Edits made while the request was in flight stay dirty and save next.
      savedVersionRef.current = startedVersion
      setSavedVersion(startedVersion)
      setSaveStatus('idle')
      return true
    } catch {
      setSaveStatus('error')
      // A Server Action from an older build throws here (404): if a new build
      // is live, keep the draft and reload instead of losing it.
      if (await recoverFromStaleBuild(draftKey, updatedAtRef.current, fieldsRef.current)) return false
      toast.error(t('Could not save your changes. Try again.'))
      return false
    } finally {
      savingRef.current = false
    }
  }, [changeOrder.id, draftKey, router, t])

  useEffect(() => {
    if (locked || paused || !isDirty) return
    const timer = setTimeout(() => {
      void runSave()
    }, AUTOSAVE_MS)
    return () => clearTimeout(timer)
    // dirtyVersion/savedVersion re-arm the timer on every edit and after each save.
  }, [locked, paused, isDirty, dirtyVersion, savedVersion, runSave])

  // Unsaved edits: warn on reload/close (same guard the estimate editor has).
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyVersionRef.current <= savedVersionRef.current || lockedRef.current) return
      // Reloading on purpose to save the stashed draft with the new build.
      if (isReloadingForNewBuild()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // ---- Derived numbers ----------------------------------------------------
  const taxRate = Number(changeOrder.tax_rate) || 0
  const currency = changeOrder.currency_code
  const totals = useMemo(
    () =>
      computeChangeOrderTotals(
        fields.lines.map((l) => ({
          quantity: Number(l.quantity) || 0,
          unit_price: lineUnitPrice(l),
          taxable: l.taxable,
        })),
        taxRate,
      ),
    [fields.lines, taxRate],
  )
  const documentNumber = contract ? formatChangeOrderNumber(contract.estimateNumber, changeOrder.number) : null

  // ---- Handlers -----------------------------------------------------------
  const [statusOpen, setStatusOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState<'delete' | 'reopen' | null>(null)

  const setLine = useCallback(
    (key: string, patch: Partial<LineDraft>) =>
      edit((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) })),
    [edit],
  )
  const removeLine = useCallback(
    (key: string) => edit((f) => ({ ...f, lines: f.lines.filter((l) => l.key !== key) })),
    [edit],
  )
  const addLine = useCallback(
    (credit: boolean) => {
      const line = blankLine(credit, true)
      edit((f) => ({ ...f, lines: [...f.lines, line] }))
      // The new line takes the focus so typing right after "Add item" fills it
      // (a timer, not requestAnimationFrame, which stalls in a background tab).
      setTimeout(() => {
        document.querySelector<HTMLInputElement>(`[data-line-key="${line.key}"] input`)?.focus()
      }, 30)
    },
    [edit],
  )

  const handleRecord = useCallback(
    async (response: ChangeOrderResponse | null) => {
      // The answer locks the content: make sure nothing typed is left behind.
      if (dirtyVersionRef.current > savedVersionRef.current && !(await runSave())) return
      const result = await apiRef.current.recordChangeOrderResponse(changeOrder.id, response)
      if (result.error || !result.data) {
        toast.error(t('Could not record the response. Try again.'))
        return
      }
      const data = result.data
      updatedAtRef.current = data.updated_at
      setMeta((m) => ({ ...m, client_response: data.client_response, responded_at: data.responded_at }))
      if (response === null) setLockedByServer(false)
      router.refresh()
    },
    [changeOrder.id, router, runSave, t],
  )

  const handleReopen = useCallback(async () => {
    setBusy('reopen')
    try {
      await handleRecord(null)
    } finally {
      setBusy(null)
    }
  }, [handleRecord])

  const invoice = invoicing?.invoice ?? null
  const approved = meta.client_response === 'accepted'
  const canInvoice = approved && !!invoicing?.paymentsEnabled && totals.total > 0 && !invoice && !paywalled
  const creditNote = approved && totals.total < 0

  const handleInvoiced = useCallback(() => router.refresh(), [router])

  const neverShared = status === 'draft' && !meta.sent_at && meta.view_count === 0
  const canDelete = neverShared && !locked

  const handleDelete = useCallback(async () => {
    setBusy('delete')
    const result = await apiRef.current.deleteChangeOrder(changeOrder.id)
    if (result.error) {
      setBusy(null)
      setDeleteOpen(false)
      toast.error(t('Could not delete the change order. Try again.'))
      return
    }
    router.push(`/projects/${project.id}`)
  }, [changeOrder.id, project.id, router, t])

  const handlePdf = useCallback(async () => {
    if (dirtyVersionRef.current > savedVersionRef.current) await runSave()
    window.open(`/api/change-orders/${changeOrder.id}/pdf`, '_blank', 'noopener')
  }, [changeOrder.id, runSave])

  const handleShare = useCallback(async () => {
    if (dirtyVersionRef.current > savedVersionRef.current && !(await runSave())) return
    setShareOpen(true)
  }, [runSave])

  const handleShared = useCallback(() => {
    setMeta((m) => ({ ...m, sent_at: m.sent_at ?? new Date().toISOString() }))
    router.refresh()
  }, [router])

  // ---- Render -------------------------------------------------------------
  const readOnly = locked
  const brand = company.brand_primary_color || '#0f172a'
  const acceptedLabel = contract?.acceptedAt ? formatDate(contract.acceptedAt) : ''
  const referenceText = [
    contract?.estimateNumber ? `${t('To estimate')} ${contract.estimateNumber}` : t('To the accepted estimate'),
    project.name,
  ]
    .filter(Boolean)
    .join(' · ')
  const referenceTail = acceptedLabel
    ? `, ${t('accepted on')} ${acceptedLabel}${project.clientName ? ` ${t('by')} ${project.clientName}` : ''}`
    : ''
  // An approved change order is already inside contract.contractTotal: take it
  // back out so "Current contract" means "before this change order" in every
  // state, and "New total" never counts it twice.
  const alreadyCounted =
    contract?.changeOrders.find((row) => row.id === changeOrder.id && row.status === 'accepted')?.total ?? 0
  const baseContract = contract ? contract.contractTotal - alreadyCounted : null
  const newTotal = baseContract !== null ? baseContract + totals.total : null

  return (
    <div data-testid="change-order-editor" className="flex min-h-full flex-1 flex-col">
      <ChangeOrderTopBar
        projectId={project.id}
        projectName={project.name}
        documentNumber={documentNumber}
        number={changeOrder.number}
        total={totals.total}
        currencyCode={currency}
        status={status}
        viewCount={meta.view_count}
        respondedAt={meta.responded_at}
        saveStatus={saveStatus}
        onRetrySave={!locked && !paused ? () => void runSave() : undefined}
        onOpenStatus={() => setStatusOpen(true)}
        signature={signature ? { name: signature.signer_name, at: signature.signed_at } : null}
        onReopen={status === 'declined' && !signedOnline && !paywalled ? () => void handleReopen() : undefined}
        reopening={busy === 'reopen'}
      />

      <div className={cn('min-w-0 flex-1 pt-3 pb-5 md:pt-5', CO_GUTTER)}>
        {/* Same backdrop as the estimate editor's document stage. */}
        <div className="isolate rounded-xl bg-[hsl(var(--doc-stage))] p-[var(--doc-stage-pad)]">
          <article
            data-testid="change-order-paper"
            className="mx-auto w-full max-w-3xl overflow-hidden rounded-lg bg-white text-neutral-900 shadow-sm"
          >
            {/* Company header */}
            <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 sm:px-8">
              <div className="min-w-0">
                <p className="text-lg font-bold leading-tight">{company.name}</p>
                {company.phone && <p className="mt-0.5 text-sm text-neutral-500">{company.phone}</p>}
              </div>
              {company.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.logo_url} alt="" className="max-h-14 max-w-[40%] object-contain" />
              )}
            </header>

            <div
              className="flex items-center justify-between gap-3 px-5 py-2.5 text-white sm:px-8"
              style={{ backgroundColor: '#0f172a' }}
            >
              <span className="text-sm font-semibold uppercase tracking-[0.12em]">
                {t('Change order')} #{changeOrder.number}
              </span>
              {documentNumber && <span className="text-xs font-medium tabular-nums opacity-80">{documentNumber}</span>}
            </div>

            <div className="flex flex-col gap-5 px-5 py-5 sm:px-8">
              <div
                data-testid="change-order-reference"
                className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-[13.5px] text-neutral-600"
              >
                {referenceText}
                {referenceTail}
              </div>

              <div className="flex flex-col gap-3">
                <input
                  value={fields.title}
                  onChange={(e) => edit((f) => ({ ...f, title: e.target.value }))}
                  disabled={readOnly}
                  aria-label={t('Title')}
                  placeholder={t('What is this change?')}
                  className={cn(PAPER_INPUT, 'text-xl font-semibold sm:text-2xl')}
                />
                <textarea
                  value={fields.reason}
                  onChange={(e) => edit((f) => ({ ...f, reason: e.target.value }))}
                  disabled={readOnly}
                  aria-label={t('Reason')}
                  placeholder={t('Why the work changed (optional)')}
                  rows={2}
                  className={cn(PAPER_INPUT, 'resize-none text-base text-neutral-600 [field-sizing:content] min-h-[4.25rem]')}
                />
              </div>
            </div>

            <div
              className="px-5 py-2 text-sm font-semibold tracking-wide text-white sm:px-8"
              style={{ backgroundColor: brand }}
            >
              {t('What changes')}
            </div>

            <div className="flex flex-col gap-3 px-5 py-4 sm:px-8">
              <LinesEditor
                lines={fields.lines}
                readOnly={readOnly}
                currencyCode={currency}
                showTaxable={taxRate > 0}
                onChange={setLine}
                onRemove={removeLine}
              />

              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => addLine(false)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[hsl(var(--primary)/0.1)] px-4 text-[13.5px] font-semibold text-[hsl(var(--primary))]"
                  >
                    <Plus className="size-4" aria-hidden />
                    {t('Add item')}
                  </button>
                  <button
                    type="button"
                    onClick={() => addLine(true)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-red-50 px-4 text-[13.5px] font-semibold text-red-600"
                  >
                    <Minus className="size-4" aria-hidden />
                    {t('Add credit')}
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-3">
                <label htmlFor="change-order-extra-days" className="text-sm font-medium text-neutral-700">
                  {t('Extra days')}
                </label>
                <input
                  id="change-order-extra-days"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={fields.extraDays}
                  onChange={(e) => edit((f) => ({ ...f, extraDays: e.target.value }))}
                  disabled={readOnly}
                  placeholder="0"
                  className="h-10 w-24 rounded-md border border-neutral-300 bg-white px-2.5 text-right text-base tabular-nums text-neutral-900 outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/0.25)] disabled:border-transparent disabled:bg-transparent disabled:opacity-100"
                />
              </div>

              {/* Totals */}
              <div data-testid="change-order-totals" className="ml-auto w-full rounded-xl bg-neutral-50 p-4 md:w-80">
                <dl className="flex flex-col gap-1.5 text-sm">
                  {contract && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-neutral-600">{t('Current contract')}</dt>
                      <dd className="font-medium tabular-nums">{formatCurrency(baseContract ?? 0, currency)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="text-neutral-600">{t('This change order')}</dt>
                    <dd
                      data-testid="change-order-subtotal"
                      className={cn('font-medium tabular-nums', totals.subtotal < 0 && 'text-red-600')}
                    >
                      {formatSigned(totals.subtotal, currency)}
                    </dd>
                  </div>
                  {taxRate > 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-neutral-600">{`${t('Tax')} (${formatTaxRatePercent(taxRate)})`}</dt>
                      <dd data-testid="change-order-tax" className={cn('font-medium tabular-nums', totals.tax_amount < 0 && 'text-red-600')}>
                        {formatSigned(totals.tax_amount, currency)}
                      </dd>
                    </div>
                  )}
                  {newTotal !== null && (
                    <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-neutral-200 pt-2">
                      <dt className="text-base font-bold">{t('New total')}</dt>
                      <dd data-testid="change-order-new-total" className="text-xl font-extrabold tabular-nums text-[hsl(var(--primary))]">
                        {formatCurrency(newTotal, currency)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            {/* Signature */}
            <div data-testid="change-order-signature" className="border-t border-neutral-200 px-5 py-4 sm:px-8">
              {signature ? (
                <div className="flex flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={signature.signature_data} alt={t('Client signature')} className="h-16 w-auto max-w-[260px] object-contain object-left" />
                  <p className="text-sm font-semibold">{signature.signer_name}</p>
                  <p className="text-xs text-neutral-500">{formatDate(signature.signed_at)}</p>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">
                  {changeOrder.client_response === 'accepted'
                    ? t('Approved without an online signature (recorded by you).')
                    : company.digital_signature_enabled
                    ? t('The client signs when you share this change order.')
                    : t('Approval is recorded manually after you share this change order.')}
                </p>
              )}
            </div>
          </article>
          {invoice && (
            <div className="mt-3">
              <ChangeOrderInvoiceRow
                invoice={invoice}
                voidInvoice={(id) => apiRef.current.voidInvoice(id)}
              />
            </div>
          )}
          {creditNote && (
            <p data-testid="change-order-credit-note" className="mx-auto mt-3 w-full max-w-3xl text-[13px] text-muted-foreground">
              {t('Credits are applied to the balance invoice.')}
            </p>
          )}
        </div>
      </div>

      {/* Docked actions */}
      <div data-editor-dock data-hide-on-keyboard className="sticky bottom-0 z-30">
        <div
          data-testid="change-order-dock"
          className="flex items-center gap-1 border-t border-border bg-background/95 px-2.5 pt-2 pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] backdrop-blur md:gap-2 md:px-5 md:py-2.5"
        >
          <div className="hidden flex-1 md:block" />
          <DockButton icon={<FileText size={20} />} onClick={() => void handlePdf()}>
            {t('PDF')}
          </DockButton>
          {canDelete && (
            <DockButton icon={<Trash2 size={20} />} onClick={() => setDeleteOpen(true)} data-testid="change-order-delete">
              {t('Delete')}
            </DockButton>
          )}
          {canInvoice ? (
            <>
              <DockButton
                icon={<Share2 size={20} />}
                onClick={() => void handleShare()}
                disabled={saveStatus === 'saving'}
                data-testid="change-order-share"
              >
                {t('Share')}
              </DockButton>
              <Button
                onClick={() => setInvoiceOpen(true)}
                data-testid="change-order-invoice"
                className="ml-1.5 h-[50px] min-w-0 flex-1 gap-2 rounded-full px-3 text-[15px] font-semibold md:h-[42px] md:flex-none md:px-5 md:text-sm"
              >
                <Receipt size={18} aria-hidden />
                {t('Invoice')}
              </Button>
            </>
          ) : (
            <Button
              onClick={() => void handleShare()}
              disabled={saveStatus === 'saving'}
              data-testid="change-order-share"
              className="ml-1.5 h-[50px] min-w-0 flex-1 gap-2 rounded-full px-3 text-[15px] font-semibold md:h-[42px] md:flex-none md:px-5 md:text-sm"
            >
              <Share2 size={18} aria-hidden />
              {t('Share')}
            </Button>
          )}
        </div>
      </div>

      <ChangeOrderStatusSheet
        open={statusOpen}
        onOpenChange={setStatusOpen}
        status={status}
        createdAt={changeOrder.created_at}
        sentAt={meta.sent_at}
        viewCount={meta.view_count}
        lastViewedAt={meta.viewed_at}
        clientResponse={meta.client_response}
        respondedAt={meta.responded_at}
        signedOnline={signedOnline}
        recordDisabled={isDirty || saveStatus === 'saving'}
        onRecord={handleRecord}
      />

      <ChangeOrderShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        changeOrderId={changeOrder.id}
        number={changeOrder.number}
        title={fields.title}
        total={totals.total}
        currencyCode={currency}
        projectName={project.name}
        clientName={project.clientName}
        shareToken={changeOrder.share_token}
        alreadyShared={!!meta.sent_at}
        markShared={(id) => apiRef.current.markChangeOrderShared(id)}
        onShared={handleShared}
      />

      <ChangeOrderInvoiceSheet
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        changeOrderId={changeOrder.id}
        number={changeOrder.number}
        total={totals.total}
        currencyCode={currency}
        invoiceChangeOrder={(id) => apiRef.current.invoiceChangeOrder(id)}
        onSent={handleInvoiced}
      />

      <AlertDialog open={deleteOpen} onOpenChange={(o) => busy !== 'delete' && setDeleteOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete this change order?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('It was never shared, so nothing changes for the client. This can’t be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === 'delete'}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === 'delete'}
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
            >
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
