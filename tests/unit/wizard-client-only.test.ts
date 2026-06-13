// Asserts the reduced projectSchema shipped in Phase 18: a minimal client-first schema
// (clientId optional, clientName required, inputMode optional) with a 2-step field map.

import { describe, it, expect } from 'vitest'

import { projectSchema, STEP_FIELDS } from '@/lib/schemas/project'

describe('projectSchema (reduced)', () => {
  it('treats clientId as optional (empty or absent is allowed)', () => {
    // Phase 18 ships clientId as optional — a project can be started before a client is
    // linked. clientName remains required (z.string()).
    expect(projectSchema.safeParse({ clientId: '', clientName: '' }).success).toBe(true)
    expect(projectSchema.safeParse({ clientName: '' }).success).toBe(true)
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

  it('STEP_FIELDS maps step 1 (client) and step 2 (input mode), no step 3', () => {
    expect(Object.keys(STEP_FIELDS).map(Number)).toEqual([1, 2])
  })
})
