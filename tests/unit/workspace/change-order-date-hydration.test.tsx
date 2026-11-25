import '@testing-library/jest-dom/vitest'
import { act, within } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { ChangeOrderStatusChip } from '@/components/workspace/change-orders/change-order-top-bar'
import { shortDate } from '@/components/workspace/change-orders/change-order-utils'

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (text: string) => text }),
}))

it('keeps the UTC approved date and accessible status when the browser local day differs', async () => {
  const timestamp = '2026-11-25T01:15:00.000Z'
  const original = Date.prototype.toLocaleDateString
  let localDate = 'Nov 25'
  const localeFormatter = vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(
    function (this: Date, locales, options) {
      if (this.getTime() === Date.parse(timestamp)) return localDate
      return original.call(this, locales, options)
    },
  )

  const tree = <ChangeOrderStatusChip status="accepted" viewCount={1} respondedAt={timestamp} onClick={vi.fn()} />
  const container = document.createElement('div')
  document.body.append(container)
  let root: Root | undefined
  try {
    container.innerHTML = renderToString(tree)
    const statusName = 'Change order status: Approved · Nov 25'
    const serverChip = within(container).getByRole('button', { name: statusName })
    const onRecoverableError = vi.fn()
    localDate = 'Nov 24'

    await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError }) })

    expect(onRecoverableError).not.toHaveBeenCalled()
    const hydratedChip = within(container).getByRole('button', { name: statusName })
    expect(hydratedChip).toBe(serverChip)
    expect(hydratedChip).toHaveTextContent('Approved · Nov 25')
  } finally {
    if (root) await act(async () => { root?.unmount() })
    localeFormatter.mockRestore()
    container.remove()
  }
})

it.each([
  ['2026-11-24T23:59:59.999Z', 'Nov 24'],
  ['2026-11-25T00:00:00.000Z', 'Nov 25'],
  ['2026-11-24T17:00:00.000-08:00', 'Nov 25'],
  ['invalid-date', ''],
  ['', ''],
  [null, ''],
  [undefined, ''],
] as const)('formats %s on the UTC contract day or returns empty', (timestamp, expected) => {
  expect(shortDate(timestamp)).toBe(expected)
})
