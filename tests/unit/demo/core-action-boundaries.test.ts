import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTIONS = {
  project: {
    mutators: [
      'createProjectAction',
      'resumeOrCreateDraftProjectAction',
      'deleteProjectAction',
      'duplicateProjectAction',
      'createProjectWithClientAction',
      'linkProjectToClient',
      'unlinkProjectFromClient',
      'renameProjectAction',
      'archiveProjectAction',
      'unarchiveProjectAction',
      'softDeleteProjectAction',
      'restoreProjectAction',
      'hardDeleteProjectAction',
    ],
    reads: ['getProjectMinimalAction', 'getMoreProjects'],
  },
  estimate: {
    mutators: [
      'saveEstimate',
      'savePresentationSettings',
      'createBlankEstimate',
      'deleteEstimateSection',
      'deleteEstimateItem',
      'markAsSentAction',
      'logDeliveryAction',
      'setEstimateSharePassword',
    ],
    reads: ['getEstimateByIdAction'],
  },
  team: {
    mutators: ['inviteMember', 'revokeInvite', 'removeMember', 'changeMemberRole'],
    reads: [],
  },
  theme: {
    mutators: ['saveThemePreference'],
    reads: [],
  },
} as const

function moduleSource(module: keyof typeof ACTIONS) {
  return readFileSync(
    resolve(process.cwd(), `lib/actions/${module}.ts`),
    'utf8',
  )
}

function functionBody(source: string, name: string) {
  const start = source.indexOf(`export async function ${name}`)
  expect(start, `${name} must remain an exported Server Action`).toBeGreaterThan(-1)

  const paramsOpen = source.indexOf('(', start)
  let paramsDepth = 0
  let paramsClose = -1
  for (let index = paramsOpen; index < source.length; index += 1) {
    if (source[index] === '(') paramsDepth += 1
    if (source[index] === ')') paramsDepth -= 1
    if (paramsDepth === 0) {
      paramsClose = index
      break
    }
  }
  const signature = source.slice(paramsClose).match(/^\)\s*(?::.*)?\s*\{/)
  const openingBrace =
    signature === null ? -1 : paramsClose + signature[0].lastIndexOf('{')
  expect(openingBrace, `${name} must have a function body`).toBeGreaterThan(-1)
  let depth = 0
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }

  throw new Error(`Could not isolate ${name}`)
}

describe('SAFE-01/SAFE-02: core Server Action boundaries', () => {
  for (const [module, classification] of Object.entries(ACTIONS) as Array<
    [keyof typeof ACTIONS, (typeof ACTIONS)[keyof typeof ACTIONS]]
  >) {
    const source = moduleSource(module)

    it(`classifies every exported action in lib/actions/${module}.ts`, () => {
      const exports = [...source.matchAll(/export async function (\w+)/g)].map((match) => match[1])
      expect([...classification.mutators, ...classification.reads].sort()).toEqual(exports.sort())
    })

    for (const actionName of classification.mutators) {
      it(`${module}.${actionName} guards before its first write or external effect`, () => {
        const body = functionBody(source, actionName)
        const guardIndex = body.search(/assert(?:Company)?Writable\s*\(/)
        const effectIndex = body.search(
          /\.(?:insert|update|delete|upsert|rpc)\s*\(|sendInviteEmail\s*\(|syncSeatBilling\s*\(|dispatchXphereSync\s*\(|writeThemeCookie\s*\(/,
        )

        expect(guardIndex, `${actionName} must call the canonical write guard`).toBeGreaterThan(-1)
        expect(effectIndex, `${actionName} must have a classified write/effect`).toBeGreaterThan(-1)
        expect(
          guardIndex,
          `${actionName} must deny demo access before its first write/effect`,
        ).toBeLessThan(effectIndex)
      })
    }
  }
})

const assertWritable = vi.fn()
const update = vi.fn()
const eq = vi.fn<
  (...args: unknown[]) => { update: typeof update } | Promise<{ error: null }>
>(() => ({ update }))
const from = vi.fn(() => ({ update: (...args: unknown[]) => update(...args), eq }))
const getClaims = vi.fn()
const writeThemeCookie = vi.fn()

vi.mock('@/lib/demo/guard', () => ({
  assertWritable: (...args: unknown[]) => assertWritable(...args),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getClaims }, from })),
}))
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(async () => 'normal-company'),
}))
vi.mock('@/lib/theme/cookie', () => ({
  isValidTheme: vi.fn(() => true),
  writeThemeCookie: (...args: unknown[]) => writeThemeCookie(...args),
}))

describe('SAFE-01: demo denial reaches the theme boundary before storage or database work', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getClaims.mockResolvedValue({ data: { claims: { sub: 'normal-user' } } })
  })

  it('returns the standard denial without writing the theme', async () => {
    assertWritable.mockResolvedValue({
      error: 'This is a read-only demo. Create a free account to make changes.',
    })
    getClaims.mockResolvedValue({ data: { claims: { sub: 'demo-user' } } })

    const { saveThemePreference } = await import('@/lib/actions/theme')
    await expect(saveThemePreference('dark')).resolves.toEqual({
      ok: false,
      message: 'This is a read-only demo. Create a free account to make changes.',
    })
    expect(update).not.toHaveBeenCalled()
    expect(writeThemeCookie).not.toHaveBeenCalled()
  })

  it('preserves the normal-tenant theme write path', async () => {
    assertWritable.mockResolvedValue(null)
    update.mockReturnValue({ eq })
    eq.mockResolvedValue({ error: null })

    const { saveThemePreference } = await import('@/lib/actions/theme')
    await expect(saveThemePreference('dark')).resolves.toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ theme_preference: 'dark' })
    expect(writeThemeCookie).toHaveBeenCalledWith('dark')
  })
})
