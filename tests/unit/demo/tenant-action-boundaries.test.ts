import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ACTIONS = {
  chat: {
    mutators: [
      'normalizeChatInput',
      'createChatConversation',
      'deleteChatConversation',
      'voteChatMessage',
      'editChatMessage',
      'truncateChatFrom',
    ],
    reads: ['listChatConversations', 'getChatThread', 'resolveCurrentEstimateId'],
  },
  company: {
    mutators: ['uploadOnboardingLogoAction', 'createOrUpdateCompany'],
    reads: [],
  },
  'invite-accept': {
    mutators: ['acceptInvite'],
    reads: [],
  },
  'active-company': {
    mutators: ['switchActiveCompany'],
    reads: [],
  },
  'price-book': {
    mutators: [
      'createFolder',
      'updateFolder',
      'deleteFolder',
      'deleteFolderWithItems',
      'resolveOrCreateFolders',
      'setItemOptions',
      'createPriceBookItem',
      'updatePriceBookItem',
      'deletePriceBookItem',
      'trashPriceBookItems',
      'restorePriceBookItems',
      'destroyPriceBookItems',
      'emptyPriceBookTrash',
      'importPriceBookItems',
      'bulkAdjustPriceBookFolder',
      'commitImportChunk',
      'undoLastImport',
    ],
    reads: ['fetchItemOptions', 'getRecentUndoableImport'],
  },
} as const

function moduleSource(module: keyof typeof ACTIONS) {
  return readFileSync(resolve(process.cwd(), `lib/actions/${module}.ts`), 'utf8')
}

function functionBody(source: string, name: string) {
  const start = source.indexOf(`export async function ${name}`)
  expect(start, `${name} must remain an exported Server Action`).toBeGreaterThan(-1)

  const openingBrace = source.indexOf('{', source.indexOf(')', start))
  expect(openingBrace, `${name} must have a function body`).toBeGreaterThan(-1)

  let depth = 0
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }

  throw new Error(`Could not isolate ${name}`)
}

const EFFECT = /(?:\.insert|\.update|\.delete|\.upsert|\.rpc)\s*\(|normalizeInput\s*\(|createConversation\s*\(|deleteConversation\s*\(|upsertMessageVote\s*\(|updateMessageParts\s*\(|deleteMessagesFrom\s*\(|storage\.upload\s*\(|sendWelcomeEmail\s*\(|dispatchXphereSync\s*\(|cookies\s*\(|revalidatePath\s*\(|updateTag\s*\(|redirect\s*\(/

describe('SAFE-01/SAFE-02: tenant-management Server Action boundaries', () => {
  for (const [module, classification] of Object.entries(ACTIONS) as Array<
    [keyof typeof ACTIONS, (typeof ACTIONS)[keyof typeof ACTIONS]]
  >) {
    const source = moduleSource(module)

    it(`classifies every exported action in lib/actions/${module}.ts`, () => {
      const exports = [...source.matchAll(/export async function (\w+)/g)].map((match) => match[1])
      expect([...classification.mutators, ...classification.reads].sort()).toEqual(exports.sort())
    })

    for (const actionName of classification.mutators) {
      it(`${module}.${actionName} denies demo access before its first write or side effect`, () => {
        const body = functionBody(source, actionName)
        const guardIndex = body.search(/assertWritable\s*\(/)
        const effectIndex = body.search(EFFECT)

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
