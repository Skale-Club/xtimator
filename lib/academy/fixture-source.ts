import type { ContentSource, RawCourse, RawLesson } from './types'

/**
 * Dev-only content source so the Academy UI can be exercised without Notion.
 * Only ever selected when NODE_ENV !== 'production' AND ACADEMY_FIXTURES=1
 * (see lib/academy/catalog.ts).
 *
 * One course, three lessons: a vertical video, a horizontal video and a
 * text-only lesson that exercises callout / toggle / list / table / image.
 */
export const FIXTURE_COURSE_ID = 'fixture-course-0001'
export const FIXTURE_LESSON_IDS = {
  vertical: 'fixture-lesson-vertical',
  horizontal: 'fixture-lesson-horizontal',
  text: 'fixture-lesson-text-only',
} as const
/** Portuguese translation of the sample course (same Group), to test the language switch. */
export const FIXTURE_COURSE_PT_ID = 'fixture-course-0001-pt'
export const FIXTURE_LESSON_PT_TEXT_ID = 'fixture-lesson-text-only-pt'
const FIXTURE_GROUP = 'fixture-group-getting-started'

const courses: RawCourse[] = [
  {
    id: FIXTURE_COURSE_ID,
    title: 'Getting started with Xtimator',
    description: 'A short sample course used to preview the Academy layout in development.',
    order: 1,
    published: true,
    apps: ['Xtimator'],
    language: 'en',
    group: FIXTURE_GROUP,
  },
  {
    id: FIXTURE_COURSE_PT_ID,
    title: 'Primeiros passos com o Xtimator',
    description: 'Um curso de exemplo curto para visualizar o layout da Academia em desenvolvimento.',
    order: 1,
    published: true,
    apps: ['Xtimator'],
    language: 'pt',
    group: FIXTURE_GROUP,
  },
]

const lessons: RawLesson[] = [
  {
    id: FIXTURE_LESSON_IDS.vertical,
    courseId: FIXTURE_COURSE_ID,
    title: 'Record your first walkthrough (vertical video)',
    order: 1,
    published: true,
    summary: 'A phone-recorded clip, shown in 9:16.',
    // Any well-known public video; the Format override forces the 9:16 layout.
    videoUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    format: 'vertical',
    expectedMinutes: 3,
  },
  {
    id: FIXTURE_LESSON_IDS.horizontal,
    courseId: FIXTURE_COURSE_ID,
    title: 'Review and send the estimate (horizontal video)',
    order: 2,
    published: true,
    summary: 'A screen recording, shown in 16:9.',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    format: 'auto',
    expectedMinutes: null,
  },
  {
    id: FIXTURE_LESSON_IDS.text,
    courseId: FIXTURE_COURSE_ID,
    title: 'Pricing tips (text only)',
    order: 3,
    published: true,
    summary: 'Reading lesson with a callout, a toggle, a list, a table and an image.',
    videoUrl: null,
    format: 'auto',
    expectedMinutes: null,
  },
  {
    id: FIXTURE_LESSON_PT_TEXT_ID,
    courseId: FIXTURE_COURSE_PT_ID,
    title: 'Dicas de preço (somente texto)',
    order: 1,
    published: true,
    summary: 'Aula de leitura com destaque, lista e tabela.',
    videoUrl: null,
    format: 'auto',
    expectedMinutes: null,
  },
]

const TEXT_LESSON_MARKDOWN_PT = `Bons orçamentos são **claros**, *específicos* e fáceis de aprovar. Aqui vai a versão curta.

<callout icon="💡" color="gray_bg">
	Dica: descreva o escopo com as palavras do cliente. Isso evita a maioria das perguntas depois.
</callout>

## Checklist

- Meça duas vezes, oriente uma vez
- Liste materiais e mão de obra separadamente
- Diga o que **não** está incluído

1. Grave a visita
2. Revise o rascunho
3. Envie o link

> Lembre-se: um orçamento rápido e claro fecha mais serviços do que um perfeito e atrasado.
`

const TEXT_LESSON_MARKDOWN = `Good estimates are **clear**, *specific* and easy to approve. Here is the short version.

<callout icon="💡" color="gray_bg">
	Tip: describe the scope in the customer's words. It removes most follow-up questions.
</callout>

## Checklist

- Measure twice, quote once
- List materials and labor separately
- State what is **not** included

1. Record the walkthrough
2. Review the draft
3. Send the link

<details>
<summary>Why separate labor and materials?</summary>
	Customers compare line items. When labor and materials are separate, a change in material cost
	does not force you to re-explain the whole price.
</details>

## Typical markup

<table header-row="true">
<tr>
<td>Item</td>
<td>Typical markup</td>
</tr>
<tr>
<td>Materials</td>
<td>10-20%</td>
</tr>
<tr>
<td>Subcontractors</td>
<td>10-15%</td>
</tr>
</table>

![The Xtimator logo](/icons/logo.png)

> Remember: a fast, clear estimate wins more jobs than a perfect, late one.
`

export function createFixtureSource(): ContentSource {
  return {
    kind: 'fixture',
    async loadRaw() {
      return { courses, lessons }
    },
    async getLessonMarkdown(lessonId) {
      if (lessonId === FIXTURE_LESSON_IDS.text) return TEXT_LESSON_MARKDOWN
      if (lessonId === FIXTURE_LESSON_PT_TEXT_ID) return TEXT_LESSON_MARKDOWN_PT
      return ''
    },
  }
}
