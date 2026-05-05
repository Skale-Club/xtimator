// Wave 0 scaffold — RED until Phase 18 plan 01 implements reduced projectSchema.
// This test turns GREEN in Phase 18 plan 01 task 2 (schema reduction).

import { describe, it, expect } from 'vitest'

// We import the schema directly — the test is designed to assert the REDUCED schema shape.
// Before task 2 runs (schema reduction), this test will fail because the schema still has name/projectType/etc.
// After task 2, the schema is reduced and the assertions pass.
import { projectSchema, STEP_FIELDS } from '@/lib/schemas/project'

describe('projectSchema (1-step)', () => {
  it('rejects when clientId is empty', () => {
    const result = projectSchema.safeParse({ clientId: '', clientName: '' })
    expect(result.success).toBe(false)
  })

  it('accepts valid clientId and clientName', () => {
    const result = projectSchema.safeParse({ clientId: 'client-abc', clientName: 'Jane Doe' })
    expect(result.success).toBe(true)
  })

  it('does NOT validate name/projectType/targetBudget — they are removed from schema', () => {
    // After schema reduction, the shape should only have clientId and clientName.
    // If name or projectType are still in the schema shape, this test fails.
    const shapeKeys = Object.keys(projectSchema.shape)
    expect(shapeKeys).not.toContain('name')
    expect(shapeKeys).not.toContain('projectType')
    expect(shapeKeys).not.toContain('customProjectType')
    expect(shapeKeys).not.toContain('targetBudget')
  })

  it('STEP_FIELDS only maps step 1 (no step 2 or step 3)', () => {
    expect(Object.keys(STEP_FIELDS).map(Number)).toEqual([1])
  })
})
