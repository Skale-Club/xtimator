import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WhatsAppTemplateComposer } from '@/components/admin/whatsapp-template-composer'

// Phase 179 Plan 04 — Task 1. Mirrors
// tests/unit/admin/notification-template-editor.test.tsx's RTL conventions.
// This component does NOT call any server action itself — only `onSubmit` as
// a plain vi.fn() prop — so no action-module mock is needed here.

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

function getBodyTextarea(): HTMLTextAreaElement {
  return screen.getByLabelText('Body') as HTMLTextAreaElement
}

describe('WhatsAppTemplateComposer', () => {
  it('renders a Body textarea and an Add variable button; zero param rows with no initialParams', () => {
    render(<WhatsAppTemplateComposer onSubmit={vi.fn()} submitLabel="Create template" />)

    expect(getBodyTextarea().value).toBe('')
    expect(screen.getByText('Add variable')).toBeTruthy()
    expect(screen.queryAllByLabelText('Label')).toHaveLength(0)
    expect(screen.queryAllByLabelText('Example')).toHaveLength(0)
  })

  it('clicking Add variable appends {{1}} to the body and renders one label + one example input, both empty', () => {
    render(<WhatsAppTemplateComposer onSubmit={vi.fn()} submitLabel="Create template" />)

    fireEvent.click(screen.getByText('Add variable'))

    expect(getBodyTextarea().value).toBe('{{1}}')
    expect(screen.getAllByLabelText('Label')).toHaveLength(1)
    expect(screen.getAllByLabelText('Example')).toHaveLength(1)
    expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Example') as HTMLInputElement).value).toBe('')
  })

  it('clicking Add variable a second time appends {{2}}, not {{1}} again (sequential via nextVariableToken)', () => {
    render(<WhatsAppTemplateComposer onSubmit={vi.fn()} submitLabel="Create template" />)

    fireEvent.click(screen.getByText('Add variable'))
    fireEvent.click(screen.getByText('Add variable'))

    expect(getBodyTextarea().value).toBe('{{1}} {{2}}')
    expect(screen.getAllByLabelText('Label')).toHaveLength(2)
  })

  it('typing into a specific variable row only updates that param, leaving the others untouched', () => {
    render(<WhatsAppTemplateComposer onSubmit={vi.fn()} submitLabel="Create template" />)

    fireEvent.click(screen.getByText('Add variable'))
    fireEvent.click(screen.getByText('Add variable'))

    const examples = screen.getAllByLabelText('Example') as HTMLInputElement[]
    fireEvent.change(examples[1]!, { target: { value: 'Second' } })

    const examplesAfter = screen.getAllByLabelText('Example') as HTMLInputElement[]
    expect(examplesAfter[0]!.value).toBe('')
    expect(examplesAfter[1]!.value).toBe('Second')
  })

  it('the live preview substitutes {{n}} tokens with example values, and shows the literal token when an example is not set yet', () => {
    render(
      <WhatsAppTemplateComposer
        initialBodyText="Hi {{1}}, your {{2}} is ready."
        initialParams={[
          { label: 'Name', example: 'John' },
          { label: 'Item', example: '' },
        ]}
        onSubmit={vi.fn()}
        submitLabel="Create template"
      />,
    )

    expect(screen.getByText('Hi John, your {{2}} is ready.')).toBeTruthy()
  })

  it('Remove last variable removes the last param and strips its exact token from the body; hides once params reach zero', () => {
    render(<WhatsAppTemplateComposer onSubmit={vi.fn()} submitLabel="Create template" />)

    fireEvent.click(screen.getByText('Add variable'))
    fireEvent.click(screen.getByText('Add variable'))
    expect(getBodyTextarea().value).toBe('{{1}} {{2}}')

    fireEvent.click(screen.getByText('Remove last variable'))
    expect(getBodyTextarea().value).not.toContain('{{2}}')
    expect(screen.getAllByLabelText('Label')).toHaveLength(1)

    fireEvent.click(screen.getByText('Remove last variable'))
    expect(screen.queryByText('Remove last variable')).toBeNull()
    expect(screen.queryAllByLabelText('Label')).toHaveLength(0)
  })

  it('a body that starts with a variable shows the validation error area and disables Submit', () => {
    render(<WhatsAppTemplateComposer onSubmit={vi.fn()} submitLabel="Create template" />)

    fireEvent.click(screen.getByText('Add variable'))

    expect(screen.getByTestId('composer-body-error')).toBeTruthy()
    const submitButton = screen.getByText('Create template').closest('button')
    expect(submitButton?.disabled).toBe(true)
  })

  it('seeding via initialBodyText/initialParams pre-fills the textarea and the param rows (Edit & Resubmit re-open path)', () => {
    render(
      <WhatsAppTemplateComposer
        initialBodyText="Hi {{1}}, thanks."
        initialParams={[{ label: 'Name', example: 'John' }]}
        onSubmit={vi.fn()}
        submitLabel="Update & Resubmit"
      />,
    )

    expect(getBodyTextarea().value).toBe('Hi {{1}}, thanks.')
    expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('Name')
    expect((screen.getByLabelText('Example') as HTMLInputElement).value).toBe('John')
  })

  it('Submit calls onSubmit exactly once with the trimmed body + params when the draft is valid', () => {
    const onSubmit = vi.fn()
    render(
      <WhatsAppTemplateComposer
        initialBodyText="Hi {{1}}, thanks for choosing us."
        initialParams={[{ label: 'Name', example: 'John' }]}
        onSubmit={onSubmit}
        submitLabel="Create template"
      />,
    )

    fireEvent.click(screen.getByText('Create template'))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      bodyText: 'Hi {{1}}, thanks for choosing us.',
      params: [{ label: 'Name', example: 'John' }],
    })
  })

  it('submitLabel controls the Submit button visible text', () => {
    render(
      <WhatsAppTemplateComposer
        initialBodyText="Hi {{1}}, thanks for choosing us."
        initialParams={[{ label: 'Name', example: 'John' }]}
        onSubmit={vi.fn()}
        submitLabel="Update & Resubmit"
      />,
    )

    expect(screen.getByText('Update & Resubmit')).toBeTruthy()
  })
})
