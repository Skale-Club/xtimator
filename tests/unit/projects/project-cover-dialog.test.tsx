import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  list: vi.fn(),
  setPhoto: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  reset: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: h.refresh, push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: h.toastSuccess, error: h.toastError } }))
vi.mock('@/lib/actions/project-cover', () => ({
  listProjectCoverPhotos: h.list,
  setProjectCoverFromPhoto: h.setPhoto,
  uploadProjectCover: h.upload,
  removeProjectCover: h.remove,
  resetProjectCover: h.reset,
}))
vi.mock('@/lib/projects/prepare-cover', () => ({
  prepareCoverImage: async (file: File) => ({ file }),
}))

import { ProjectCoverDialog } from '@/components/projects/project-cover-dialog'

const PHOTOS = [
  { id: 'ph1', url: '/storage/photos/c/p/ph1.webp' },
  { id: 'ph2', url: '/storage/photos/c/p/ph2.webp' },
]

function renderDialog(onOpenChange = vi.fn()) {
  render(<ProjectCoverDialog open onOpenChange={onOpenChange} projectId="proj-1" projectName="Kitchen Remodel" />)
  return onOpenChange
}

beforeEach(() => {
  vi.clearAllMocks()
  h.list.mockResolvedValue({ data: { mode: 'photo', coverPhotoId: 'ph2', photos: PHOTOS } })
  for (const fn of [h.setPhoto, h.upload, h.remove, h.reset]) fn.mockResolvedValue({ data: {} })
})

describe('ProjectCoverDialog', () => {
  it('shows the project photos and marks the current one', async () => {
    renderDialog()
    expect(screen.getByText('Thumbnail')).toBeTruthy()
    const grid = await screen.findByTestId('cover-photo-grid')
    const buttons = Array.from(grid.querySelectorAll('button'))
    expect(buttons).toHaveLength(2)
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    expect(buttons[0].querySelector('img')!.getAttribute('loading')).toBe('lazy')
    expect(h.list).toHaveBeenCalledWith('proj-1')
  })

  it('uses the tapped photo, toasts, refreshes and closes', async () => {
    const onOpenChange = renderDialog()
    const grid = await screen.findByTestId('cover-photo-grid')
    fireEvent.click(grid.querySelectorAll('button')[0])
    await waitFor(() => expect(h.setPhoto).toHaveBeenCalledWith('proj-1', 'ph1'))
    await waitFor(() => expect(h.refresh).toHaveBeenCalled())
    expect(h.toastSuccess).toHaveBeenCalledWith('Thumbnail updated')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows the server error and stays open when a change fails', async () => {
    h.setPhoto.mockResolvedValue({ error: 'Photo not found.' })
    const onOpenChange = renderDialog()
    const grid = await screen.findByTestId('cover-photo-grid')
    fireEvent.click(grid.querySelectorAll('button')[0])
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Photo not found.'))
    expect(h.refresh).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('says so when the project has no photos', async () => {
    h.list.mockResolvedValue({ data: { mode: 'auto', coverPhotoId: null, photos: [] } })
    renderDialog()
    expect(await screen.findByTestId('cover-no-photos')).toBeTruthy()
  })

  it('uploads the chosen image as form data', async () => {
    renderDialog()
    await screen.findByTestId('cover-photo-grid')
    const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('cover-file-input'), { target: { files: [file] } })
    await waitFor(() => expect(h.upload).toHaveBeenCalledTimes(1))
    const [projectId, formData] = h.upload.mock.calls[0]
    expect(projectId).toBe('proj-1')
    expect((formData as FormData).get('file')).toBeInstanceOf(File)
    await waitFor(() => expect(h.refresh).toHaveBeenCalled())
  })

  it('removes the thumbnail and goes back to automatic', async () => {
    renderDialog()
    await screen.findByTestId('cover-photo-grid')
    fireEvent.click(screen.getByRole('button', { name: /Use first photo automatically/ }))
    await waitFor(() => expect(h.reset).toHaveBeenCalledWith('proj-1'))
    await waitFor(() => expect(h.refresh).toHaveBeenCalled())
  })

  it('removes the thumbnail', async () => {
    renderDialog()
    await screen.findByTestId('cover-photo-grid')
    fireEvent.click(screen.getByRole('button', { name: /Remove thumbnail/ }))
    await waitFor(() => expect(h.remove).toHaveBeenCalledWith('proj-1'))
    expect(h.toastSuccess).toHaveBeenCalledWith('Thumbnail removed')
  })

  it('disables the choices that are already in effect', async () => {
    h.list.mockResolvedValue({ data: { mode: 'auto', coverPhotoId: null, photos: PHOTOS } })
    renderDialog()
    await screen.findByTestId('cover-photo-grid')
    const auto = screen.getByRole('button', { name: /Use first photo automatically/ }) as HTMLButtonElement
    expect(auto.disabled).toBe(true)
  })
})
