import { describe, it } from 'vitest'
import { render } from '@testing-library/react'
import NewProjectLoading from '@/app/(app)/projects/new/loading'
import SettingsLoading from '@/app/(app)/settings/loading'
import AppearanceLoading from '@/app/(app)/settings/(tabs)/appearance/loading'

describe('loading.tsx smoke tests', () => {
  it('NewProjectLoading renders without throwing', () => {
    const { container } = render(<NewProjectLoading />)
  })
  it('SettingsLoading renders without throwing', () => {
    const { container } = render(<SettingsLoading />)
  })
  it('AppearanceLoading renders without throwing', () => {
    const { container } = render(<AppearanceLoading />)
  })
})
