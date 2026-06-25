import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { EntryForm } from '@/app/(app)/settings/knowledge/entry-form'
import { companyKnowledgeEntrySchema } from '@/lib/schemas/knowledge'

/**
 * KOVL-01 (UI half): the tenant overlay form is a deliberate divergence from the
 * Phase-119 admin form — it OMITS the industry <Select> (company rows carry
 * industry_id NULL) and resolves companyKnowledgeEntrySchema. These tests lock
 * that divergence: the rendered form exposes ONLY title/body/source, and the
 * route surface imports none of the admin/industry primitives (the two-panel rule).
 */

// i18n <T>/t() passthrough so copy assertions run on plain text.
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

const KNOWLEDGE_DIR = path.join(process.cwd(), 'app', '(app)', 'settings', 'knowledge')

describe('company overlay EntryForm', () => {
  it('renders the title, body and source fields', () => {
    const { container } = render(<EntryForm onSave={async () => {}} isPending={false} />)
    const html = container.innerHTML
    expect(container.querySelector('#title')).not.toBeNull()
    expect(container.querySelector('#body')).not.toBeNull()
    expect(container.querySelector('#source')).not.toBeNull()
    expect(html).toContain('Title')
    expect(html).toContain('Body')
    expect(html).toContain('Source (optional)')
    expect(html).toContain('Save entry')
  })

  it('has NO industry field (the company overlay divergence)', () => {
    const { container } = render(<EntryForm onSave={async () => {}} isPending={false} />)
    expect(container.querySelector('#industry_id')).toBeNull()
    expect(container.innerHTML).not.toContain('Industry')
    expect(container.innerHTML).not.toContain('Select industry')
  })
})

describe('companyKnowledgeEntrySchema (the form resolver)', () => {
  it('accepts { title, body } with an optional source', () => {
    expect(companyKnowledgeEntrySchema.safeParse({ title: 'T', body: 'B' }).success).toBe(true)
    expect(
      companyKnowledgeEntrySchema.safeParse({ title: 'T', body: 'B', source: 's' }).success,
    ).toBe(true)
  })

  it('rejects an empty title or body, and never carries industry_id', () => {
    expect(companyKnowledgeEntrySchema.safeParse({ title: '', body: 'B' }).success).toBe(false)
    expect(companyKnowledgeEntrySchema.safeParse({ title: 'T', body: '' }).success).toBe(false)
    // industry_id is not part of the schema shape — a parse drops it.
    const parsed = companyKnowledgeEntrySchema.parse({ title: 'T', body: 'B', industry_id: 'x' })
    expect('industry_id' in parsed).toBe(false)
  })
})

describe('the /settings/knowledge route surface (the two-panel rule)', () => {
  const files = [
    'page.tsx',
    'new/page.tsx',
    'entry-form.tsx',
    'entry-form-wrapper.tsx',
    'entry-actions.tsx',
    path.join('[id]', 'page.tsx'),
    path.join('[id]', 'edit-entry-wrapper.tsx'),
  ]

  it('imports none of the admin/service/industry primitives', () => {
    const forbidden = [
      'requireAdmin',
      'requireServiceClient',
      'getIndustryLabel',
      'INDUSTRIES',
      'industry_id',
    ]
    for (const file of files) {
      const src = readFileSync(path.join(KNOWLEDGE_DIR, file), 'utf8')
      for (const token of forbidden) {
        expect(src, `${file} must not reference ${token}`).not.toContain(token)
      }
    }
  })

  it('scopes the list + edit loads to scope=company + company_id', () => {
    const list = readFileSync(path.join(KNOWLEDGE_DIR, 'page.tsx'), 'utf8')
    const edit = readFileSync(path.join(KNOWLEDGE_DIR, '[id]', 'page.tsx'), 'utf8')
    for (const src of [list, edit]) {
      expect(src).toContain("'company'")
      expect(src).toContain('company.id')
      expect(src).toContain('getActiveCompany')
    }
  })

  it('wires the three Plan 120-01 actions', () => {
    expect(readFileSync(path.join(KNOWLEDGE_DIR, 'entry-form-wrapper.tsx'), 'utf8')).toContain(
      'createCompanyEntry',
    )
    expect(
      readFileSync(path.join(KNOWLEDGE_DIR, '[id]', 'edit-entry-wrapper.tsx'), 'utf8'),
    ).toContain('updateCompanyEntry')
    expect(readFileSync(path.join(KNOWLEDGE_DIR, 'entry-actions.tsx'), 'utf8')).toContain(
      'deleteCompanyEntry',
    )
  })
})
