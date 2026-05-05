// Wave 0 scaffold — RED until Phase 18 plan 03 implements tool schema extension + project name patch.
// This test turns GREEN in Phase 18 plan 03 task 1 (tool schema extension + name patch).

import { describe, it, expect } from 'vitest'

// The generate-estimate route is not yet extended — mock it so the file compiles.
vi.mock('@/app/api/generate-estimate/route', () => ({
  POST: vi.fn(),
  CREATE_ESTIMATE_TOOL: {
    name: 'create_estimate',
    input_schema: {
      type: 'object',
      required: ['summary', 'sections', 'suggested_project_name'],
      properties: {
        suggested_project_name: { type: 'string' },
        summary: { type: 'string' },
        sections: { type: 'array' },
      },
    },
  },
}))

// Mock PLACEHOLDER_PREFIX from project actions
vi.mock('@/lib/actions/project', () => ({
  PLACEHOLDER_PREFIX: 'Untitled project — ',
  createProjectAction: vi.fn(),
}))

describe('generate-estimate tool schema (D-05)', () => {
  it('input_schema requires suggested_project_name', () => {
    // Implementation pending — Phase 18 plan 03 task 1.
    // Expected: CREATE_ESTIMATE_TOOL.input_schema.required includes 'suggested_project_name'.
    expect.fail('Implementation pending — Phase 18 plan 03 task 1')
  })

  it('suggested_project_name is a string type in properties', () => {
    // Implementation pending — Phase 18 plan 03 task 1.
    // Expected: properties.suggested_project_name.type === 'string'.
    expect.fail('Implementation pending — Phase 18 plan 03 task 1')
  })
})

describe('project name patch logic (D-05)', () => {
  it('updates project name only when current name starts with the placeholder prefix "Untitled project — "', () => {
    // Implementation pending — Phase 18 plan 03 task 1.
    // Expected: name patch only fires when project.name.startsWith('Untitled project — ').
    // Projects with user-edited names (not starting with prefix) are NOT patched.
    expect.fail('Implementation pending — Phase 18 plan 03 task 1')
  })

  it('does NOT update project name when project already has a user-set name', () => {
    // Implementation pending — Phase 18 plan 03 task 1.
    // Expected: if name = 'Smith Bathroom Remodel', the patch is skipped.
    expect.fail('Implementation pending — Phase 18 plan 03 task 1')
  })
})
