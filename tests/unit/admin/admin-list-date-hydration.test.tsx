import '@testing-library/jest-dom/vitest'
import { act, within } from '@testing-library/react'
import { format } from 'date-fns'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { AdminList } from '@/app/admin/admins/admin-list'

vi.mock('@/app/admin/admins/actions', () => ({ removePlatformAdmin: vi.fn() }))
vi.mock('date-fns', () => ({ format: vi.fn() }))

it('hydrates the sole admin row before formatting the joined date in the browser', async () => {
  const admin = {
    user_id: 'synthetic-admin',
    email: 'synthetic-admin@example.invalid',
    created_at: '2026-11-25T01:15:00.000Z',
  }
  const formatter = vi.mocked(format)
  formatter.mockReturnValue('Nov 25, 2026')

  const tree = <AdminList admins={[admin]} currentUserId={admin.user_id} />
  const container = document.createElement('div')
  document.body.append(container)
  let root: Root | undefined
  try {
    container.innerHTML = renderToString(tree)
    const queryAdminRow = () => within(container).getByRole('row', { name: /synthetic-admin@example\.invalid/ })
    const serverRow = queryAdminRow()
    const serverJoined = within(serverRow).getAllByRole('cell')[1].textContent
    const serverFormatCalls = formatter.mock.calls.length
    expect(within(serverRow).getByRole('button', { name: 'Remove' })).toBeDisabled()

    formatter.mockReturnValue('Nov 24, 2026')
    const onRecoverableError = vi.fn()
    await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError }) })

    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(serverFormatCalls).toBe(0)
    expect(serverJoined).toBe('Admin since —')
    const hydratedRow = queryAdminRow()
    expect(hydratedRow).toBe(serverRow)
    expect(within(hydratedRow).getByRole('cell', { name: 'Admin since Nov 24, 2026' })).toBeVisible()
    expect(within(hydratedRow).getByRole('button', { name: 'Remove' })).toBeDisabled()
    expect(formatter).toHaveBeenCalledWith(new Date(admin.created_at), 'MMM d, yyyy')
  } finally {
    if (root) await act(async () => { root?.unmount() })
    formatter.mockReset()
    container.remove()
  }
})
