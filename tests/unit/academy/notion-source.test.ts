import { describe, it, expect } from 'vitest'
import { mapCourseRow, mapLessonRow } from '@/lib/academy/notion-source'
import { NAV_ITEMS } from '@/components/app-shell/nav-items'

const title = (text: string) => ({ title: [{ plain_text: text }] })
const rich = (text: string) => ({ rich_text: [{ plain_text: text }] })

describe('Notion row mapping (property names are the contract)', () => {
  it('maps a Courses row', () => {
    const course = mapCourseRow('page-1', {
      Name: title('Getting started'),
      Apps: { multi_select: [{ name: 'Xtimator' }, { name: 'Xpot' }] },
      Published: { checkbox: true },
      Order: { number: 2 },
      Description: rich('Two sentences.'),
      Language: { select: { name: 'Português' } },
      Group: rich('getting-started'),
    })
    expect(course).toEqual({
      id: 'page-1',
      title: 'Getting started',
      description: 'Two sentences.',
      order: 2,
      published: true,
      apps: ['Xtimator', 'Xpot'],
      language: 'pt',
      group: 'getting-started',
    })
  })

  it('maps a Lessons row', () => {
    const lesson = mapLessonRow('page-2', {
      Name: title('First lesson'),
      Course: { relation: [{ id: 'page-1' }] },
      Order: { number: 1 },
      Published: { checkbox: true },
      Video: { url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' },
      'Expected minutes': { number: 3 },
      Format: { select: { name: 'Vertical' } },
      Summary: rich('A one-liner'),
    })
    expect(lesson).toEqual({
      id: 'page-2',
      courseId: 'page-1',
      title: 'First lesson',
      order: 1,
      published: true,
      summary: 'A one-liner',
      videoUrl: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      format: 'vertical',
      expectedMinutes: 3,
    })
  })

  it('degrades to safe defaults when properties are missing', () => {
    const lesson = mapLessonRow('page-3', {})
    expect(lesson).toMatchObject({
      courseId: null,
      published: false,
      videoUrl: null,
      format: 'auto',
      expectedMinutes: null,
      order: 0,
    })
    expect(mapCourseRow('c', {})).toMatchObject({ published: false, apps: [], language: 'en', group: '' })
  })
})

describe('Academy entry point placement', () => {
  it('does not add Academy to the main nav (NAV_ITEMS stays untouched)', () => {
    expect(NAV_ITEMS.some((i) => /academy/i.test(i.label) || /academy/i.test(i.href))).toBe(false)
  })
})
