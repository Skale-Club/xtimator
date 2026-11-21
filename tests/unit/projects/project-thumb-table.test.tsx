import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ProjectTable, type ProjectTableRow } from '@/components/projects/project-table'
import { ProjectThumb } from '@/components/projects/project-thumb'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/actions/project', () => ({ linkProjectToClient: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const KEY = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/cover-abc.webp'

function row(overrides: Partial<ProjectTableRow>): ProjectTableRow {
  return {
    id: 'p1',
    name: 'Kitchen Remodel',
    status: 'draft',
    total: 100,
    created_at: '2026-04-01T00:00:00Z',
    ...overrides,
  }
}

describe('ProjectThumb', () => {
  it('renders a lazy proxy image with empty alt text for a stored thumb', () => {
    const { container } = render(<ProjectThumb name="Kitchen Remodel" thumbPath={KEY} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe(`/storage/photos/${KEY}`)
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('alt')).toBe('')
    expect(container.firstElementChild!.className).toContain('size-10')
  })

  it('is 48px on the phone card size', () => {
    const { container } = render(<ProjectThumb name="Kitchen Remodel" thumbPath={KEY} size={48} />)
    expect(container.firstElementChild!.className).toContain('size-12')
  })

  it('shows the initials when there is no thumb', () => {
    const { container, getByTestId } = render(<ProjectThumb name="Kitchen Remodel" thumbPath={null} />)
    expect(container.querySelector('img')).toBeNull()
    expect(getByTestId('project-thumb-placeholder').textContent).toBe('KR')
  })

  it('falls back to initials for a key the proxy cannot serve', () => {
    const { container } = render(<ProjectThumb name="Deck Build" thumbPath="../etc/passwd" />)
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('ProjectTable thumbnails', () => {
  it('shows the thumb or the initials beside each name, in the table and on the phone card', () => {
    const { container } = render(
      <ProjectTable<ProjectTableRow>
        projects={[row({ id: 'p1', name: 'Kitchen Remodel', cover_thumb_path: KEY }), row({ id: 'p2', name: 'Deck Build' })]}
        renderActions={() => null}
      />,
    )
    const imgs = Array.from(container.querySelectorAll('img'))
    // One per layout (desktop table + phone card) for the project that has a thumb.
    expect(imgs.length).toBeGreaterThanOrEqual(2)
    expect(imgs.every((img) => img.getAttribute('src') === `/storage/photos/${KEY}`)).toBe(true)
    const placeholders = Array.from(container.querySelectorAll('[data-testid="project-thumb-placeholder"]'))
    expect(placeholders.length).toBeGreaterThanOrEqual(2)
    expect(placeholders.every((p) => p.textContent === 'DB')).toBe(true)
    // 40px in the table and on the phone card (48px squeezed the name on a phone).
    const sizes = new Set([...imgs, ...placeholders].map((el) => (el.closest('span') ?? el).className.match(/size-1[02]/)?.[0]))
    expect([...sizes]).toEqual(['size-10'])
  })
})
