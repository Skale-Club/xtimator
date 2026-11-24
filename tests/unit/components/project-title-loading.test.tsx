import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BreadcrumbProvider } from '@/components/app-shell/breadcrumb-context'
import { EditorTopBar } from '@/components/workspace/editor-frame/editor-top-bar'
import { WorkspaceSkeletonFrame } from '@/components/workspace/editor-frame/workspace-skeleton-frame'
import { ProjectHeader } from '@/components/workspace/project-header'
import type { ProjectDetail } from '@/lib/queries/project'

const { currentFrame, refresh, renameProject } = vi.hoisted(() => ({
  currentFrame: vi.fn<() => 'v1' | 'v2'>(),
  refresh: vi.fn(),
  renameProject: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))
vi.mock('@/components/workspace/editor-frame/frame', () => ({ useEditorFrame: currentFrame }))
vi.mock('@/components/workspace/edit-estimate-header-button', () => ({ EditEstimateHeaderButton: () => null }))
vi.mock('@/lib/actions/project', () => ({ renameProjectAction: renameProject }))

const project: ProjectDetail = {
  id: 'project-one',
  company_id: 'company-one',
  name: 'Porch railing',
  project_type: null,
  status: 'draft',
  target_budget: null,
  total: 0,
  created_at: '2026-11-24T00:00:00Z',
  needs_details: null,
  client: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  renameProject.mockResolvedValue({ data: { renamed: true } })
})
afterEach(cleanup)

describe('project title while the workspace streams', () => {
  it.each(['v1', 'v2'] as const)('keeps the %s fallback read-only in server markup and mounted UI', frame => {
    currentFrame.mockReturnValue(frame)
    const fallback = (
      <BreadcrumbProvider>
        <WorkspaceSkeletonFrame project={project}><p>Loading editor</p></WorkspaceSkeletonFrame>
      </BreadcrumbProvider>
    )
    const initial = document.createElement('div')
    initial.innerHTML = renderToString(fallback)
    expect(initial.querySelector<HTMLButtonElement>('button[aria-label="Rename project"]')?.disabled).toBe(true)

    render(fallback)
    const rename = screen.getByRole<HTMLButtonElement>('button', { name: 'Rename project' })
    const title = screen.getByRole('heading', { name: project.name })
    expect(rename.disabled).toBe(true)
    expect(title.classList.contains('cursor-pointer')).toBe(false)
    expect(screen.getByText('Loading editor').closest('[aria-busy="true"]')).toBeTruthy()
    fireEvent.click(rename)
    fireEvent.click(title)
    expect(screen.queryByRole('textbox', { name: 'Project name' })).toBeNull()
    expect(renameProject).not.toHaveBeenCalled()
    if (frame === 'v2') {
      expect(screen.getByRole('link', { name: 'Back to projects' }).getAttribute('href')).toBe('/projects')
    }
  })

  it.each(['v1', 'v2'] as const)('still edits and saves from the loaded %s header', async frame => {
    render(
      <BreadcrumbProvider>
        {frame === 'v2' ? <EditorTopBar project={project} /> : <ProjectHeader project={project} />}
      </BreadcrumbProvider>,
    )
    const rename = screen.getByRole<HTMLButtonElement>('button', { name: 'Rename project' })
    expect(rename.disabled).toBe(false)
    fireEvent.click(rename)
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Project name' })
    expect(input.value).toBe(project.name)
    fireEvent.change(input, { target: { value: 'Replace porch railing' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByRole('heading', { name: 'Replace porch railing' })).toBeTruthy()
    expect(renameProject).toHaveBeenCalledExactlyOnceWith(project.id, 'Replace porch railing')
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })
})
