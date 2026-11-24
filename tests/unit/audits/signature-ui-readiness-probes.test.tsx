import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChangeOrderPDF from '@/components/pdf/change-order-pdf'
import { ChangeOrderView } from '@/components/share/change-order-view'
import { buildContractSummary } from '@/lib/change-orders/contract'
import type { PublicChangeOrderData } from '@/lib/change-orders/types'
import { collectTextNodes } from '../estimate/_pdf-text-walker'
import { buildChangeOrder, buildChangeOrderData, SIGNED } from '../share/change-order-fixtures'
import { SignaturePad } from '@/components/share/signature-pad'

vi.mock('@/app/change-order/[token]/actions', () => ({ declineChangeOrder: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function publicView(data: PublicChangeOrderData) {
  return <ChangeOrderView data={data} token="tok-co1" appName="Xtimator" />
}

function openSignature() {
  fireEvent.click(screen.getByRole('button', { name: 'Approve and sign' }))
  return screen.findByRole('dialog')
}

function contractTotalsInView() {
  const totals = within(screen.getByTestId('change-order-totals'))
  return ['Current contract', 'New total'].map((label) => totals.getByText(label).nextSibling?.textContent)
}

function contractTotalsInPdf(data: PublicChangeOrderData) {
  const text: string[] = []
  collectTextNodes(ChangeOrderPDF({ data }), text)
  expect(text).toContain('Approved and signed by')
  expect(text).toContain(SIGNED.signer_name)
  return ['Current contract', 'New total'].map((label) => {
    expect(text).toContain(label)
    return text[text.indexOf(label) + 1]
  })
}

describe('Signature UI readiness regressions', () => {
  const dismissals = ['Cancel', 'Close', 'Escape', 'backdrop', 'mobile swipe']

  it.each(dismissals)('requires a new drawing after dismissal by %s', async (dismissal) => {
    const context = {
      beginPath: vi.fn(), fillRect: vi.fn(), lineTo: vi.fn(), moveTo: vi.fn(), setTransform: vi.fn(), stroke: vi.fn(),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(SIGNED.signature_data)
    vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(330)
    vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(160)
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, right: 330, bottom: 160, left: 0, width: 330, height: 160, toJSON: () => ({}),
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetchMock)
    if (dismissal === 'mobile swipe') {
      vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(500)
    }
    render(publicView(buildChangeOrderData()))

    const firstDialog = await openSignature()
    const firstCanvas = firstDialog.querySelector('canvas')!
    fireEvent.change(within(firstDialog).getByLabelText('Your full name'), { target: { value: 'Jane Doe' } })
    const pointer = { pointerId: 1, pointerType: 'touch' }
    fireEvent.pointerDown(firstCanvas, { ...pointer, clientX: 40, clientY: 50 })
    fireEvent.pointerMove(firstCanvas, { ...pointer, clientX: 180, clientY: 67 })
    fireEvent.pointerUp(firstCanvas, pointer)
    expect(within(firstDialog).getByRole('button', { name: 'Clear' })).toBeTruthy()
    expect(within(firstDialog).getByRole<HTMLButtonElement>('button', { name: 'Sign & Approve' }).disabled).toBe(false)

    if (dismissal === 'Cancel' || dismissal === 'Close') {
      fireEvent.click(within(firstDialog).getByRole('button', { name: dismissal }))
    } else if (dismissal === 'Escape') {
      fireEvent.keyDown(firstDialog, { key: 'Escape' })
    } else if (dismissal === 'backdrop') {
      // Radix installs its outside-pointer listener in the next task.
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
      fireEvent.pointerDown(document.querySelector('[data-slot="dialog-overlay"]')!, { pointerType: 'mouse' })
    } else {
      const grabber = within(firstDialog).getByTestId('sheet-grabber')
      fireEvent.pointerDown(grabber, { ...pointer, clientY: 50 })
      fireEvent.pointerMove(firstDialog, { ...pointer, clientY: 350 })
      fireEvent.pointerUp(firstDialog, { ...pointer, clientY: 350 })
    }
    await waitFor(() => expect(firstCanvas.isConnected).toBe(false))
    context.stroke.mockClear()

    const secondDialog = await openSignature()
    expect(secondDialog.querySelector('canvas')).not.toBe(firstCanvas)
    expect(within(secondDialog).getByText('Draw your signature above using your finger or mouse.')).toBeTruthy()
    expect(context.stroke).not.toHaveBeenCalled()

    const submit = within(secondDialog).getByRole<HTMLButtonElement>('button', { name: 'Sign & Approve' })
    expect(submit.disabled).toBe(true)
    fireEvent.click(submit)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves signed change-order totals on the public page and PDF after another approval', () => {
    const initial = buildChangeOrderData({
      status: 'accepted', client_response: 'accepted', responded_at: SIGNED.signed_at,
      hasSignature: true, signature: SIGNED,
      signedContract: { before: 10000, after: 11100, revision: 'signed-revision' },
    })
    const laterApproval = buildChangeOrder({
      id: 'co2', number: 2, title: 'Second change', total: 200,
      status: 'accepted', client_response: 'accepted', responded_at: '2026-02-04T15:00:00Z',
    })
    const latest = {
      ...initial,
      contract: buildContractSummary(initial.contract, [initial.changeOrder, laterApproval], { includeDrafts: false }),
    }

    const before = render(publicView(initial))
    expect(contractTotalsInView()).toEqual(['$10,000.00', '$11,100.00'])
    expect(contractTotalsInPdf(initial)).toEqual(['$10,000.00', '$11,100.00'])
    before.unmount()

    render(publicView(latest))
    const signature = within(screen.getByTestId('approved-signature')).getByRole('img')
    expect(signature.getAttribute('src')).toBe(SIGNED.signature_data)
    expect(contractTotalsInView()).toEqual(['$10,000.00', '$11,100.00'])
    expect(contractTotalsInPdf(latest)).toEqual(['$10,000.00', '$11,100.00'])
  })

  it('omits historical contract totals for a legacy signature without that evidence', () => {
    const data = buildChangeOrderData({ status: 'accepted', hasSignature: true, signature: SIGNED })
    render(publicView(data))
    expect(screen.getByTestId('approved-signature')).toBeTruthy()
    const totals = within(screen.getByTestId('change-order-totals'))
    expect(totals.queryByText('Current contract')).toBeNull()
    expect(totals.queryByText('New total')).toBeNull()
    const text: string[] = []
    collectTextNodes(ChangeOrderPDF({ data }), text)
    expect(text).toContain(SIGNED.signer_name)
    expect(text).not.toContain('Current contract')
    expect(text).not.toContain('New total')
  })

  it('exports both segments of an active stroke across a resize', () => {
    let width = 330
    let height = 160
    let resize = () => {}
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback }
      observe() {}
      disconnect() {}
    })
    const contexts = new Map<HTMLCanvasElement, { lineTo: ReturnType<typeof vi.fn>; stroke: ReturnType<typeof vi.fn> }>()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      const existing = contexts.get(this)
      if (existing) return existing as unknown as CanvasRenderingContext2D
      const context = {
        beginPath: vi.fn(), fillRect: vi.fn(), lineTo: vi.fn(), moveTo: vi.fn(), setTransform: vi.fn(), stroke: vi.fn(),
      }
      contexts.set(this, context)
      return context as unknown as CanvasRenderingContext2D
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(SIGNED.signature_data)
    vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)
    vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockImplementation(() => height)
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      x: 0, y: 0, top: 0, right: width, bottom: height, left: 0, width, height, toJSON: () => ({}),
    }))
    const onSignatureChange = vi.fn()
    const { container } = render(<SignaturePad signerName="Audit Signer" signerEmail="" onSignerNameChange={() => {}}
      onSignerEmailChange={() => {}} onSignatureChange={onSignatureChange} />)
    const canvas = container.querySelector('canvas')!
    const pointer = { pointerId: 1, pointerType: 'touch' }
    fireEvent.pointerDown(canvas, { ...pointer, clientX: 40, clientY: 50 })
    fireEvent.pointerMove(canvas, { ...pointer, clientX: 100, clientY: 70 })
    width = 660
    height = 320
    act(() => resize())
    fireEvent.pointerMove(canvas, { ...pointer, clientX: 300, clientY: 180 })
    expect(contexts.get(canvas)?.lineTo).toHaveBeenLastCalledWith(300, 180)
    fireEvent.pointerUp(canvas, pointer)
    expect(onSignatureChange).toHaveBeenCalledWith(SIGNED.signature_data)
    const exported = [...contexts.entries()].find(([element]) => element !== canvas)?.[1]
    expect(exported?.lineTo.mock.calls).toEqual([[200, 140], [300, 180]])
  })
})
