import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { Progress } from '@/components/ui/progress'

afterEach(cleanup)

it.each([0, 33])('exposes the determinate progress value %i to assistive technology', value => {
  render(<Progress aria-label="Course progress" value={value} />)

  const bar = screen.getByRole('progressbar', { name: 'Course progress' })
  expect(bar.getAttribute('aria-valuemin')).toBe('0')
  expect(bar.getAttribute('aria-valuemax')).toBe('100')
  expect(bar.getAttribute('aria-valuenow')).toBe(String(value))
  expect(bar.getAttribute('data-state')).toBe('loading')
})

it('leaves the accessible current value unset when progress is unknown', () => {
  render(<Progress aria-label="Course progress" value={null} />)

  const bar = screen.getByRole('progressbar', { name: 'Course progress' })
  expect(bar.getAttribute('aria-valuenow')).toBeNull()
  expect(bar.getAttribute('data-state')).toBe('indeterminate')
})
