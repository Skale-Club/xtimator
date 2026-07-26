import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function source(path: string): string {
  return readFileSync(resolve(root, path), 'utf8')
}

function afterAnchor(path: string, anchor: string): string {
  const text = source(path)
  const index = text.indexOf(anchor)
  expect(index, `${path} must contain the expected worker anchor`).toBeGreaterThan(-1)
  return text.slice(index)
}

function expectGuardBefore(
  path: string,
  body: string,
  companyExpression: RegExp,
  firstEffect: RegExp,
): void {
  expect(source(path)).toMatch(
    /import\s*\{\s*assertCompanyWritable\s*\}\s*from\s*['"]@\/lib\/demo\/guard['"]/,
  )

  const guardIndex = body.search(companyExpression)
  const effectIndex = body.search(firstEffect)
  expect(guardIndex, `${path} must guard a trusted company`).toBeGreaterThan(-1)
  expect(effectIndex, `${path} must retain its protected effect`).toBeGreaterThan(-1)
  expect(guardIndex, `${path} must deny before its first product effect`).toBeLessThan(
    effectIndex,
  )
}

describe('SAFE-02: product-effect Inngest workers deny the demo company', () => {
  it.each([
    {
      name: 'estimate generation',
      path: 'lib/inngest/functions/generate-estimate.ts',
      anchor: 'const data = event.data as EstimateGeneratePayload',
      company: /assertCompanyWritable\s*\(\s*companyId\s*\)/,
      effect: /loadOwnerUserId\s*\(\s*companyId\s*\)/,
    },
    {
      name: 'photo analysis',
      path: 'lib/inngest/functions/analyze-photos.ts',
      anchor: 'const data = event.data as AnalyzePhotosPayload',
      company: /assertCompanyWritable\s*\(\s*companyId\s*\)/,
      effect: /loadOwnerUserId\s*\(\s*companyId\s*\)/,
    },
    {
      name: 'audio transcription',
      path: 'lib/inngest/functions/transcribe-audio.ts',
      anchor: 'const ident = await loadCompanyForRecording(recordingId)',
      company: /assertCompanyWritable\s*\(\s*ident\.companyId\s*\)/,
      effect: /recordPipelineEvent\s*\(/,
    },
    {
      name: 'WhatsApp estimate processing',
      path: 'lib/inngest/functions/whatsapp-process.ts',
      anchor: "const data = event.data as Omit<WhatsAppProcessPayload, 'messages'>",
      company: /assertCompanyWritable\s*\(\s*companyId\s*\)/,
      effect: /step\.run\s*\(\s*['"]refresh-typing['"]/,
    },
    {
      name: 'WhatsApp intent routing',
      path: 'lib/inngest/functions/whatsapp-process.ts',
      anchor: "const data = event.data as Omit<WhatsAppIntentPayload, 'message'>",
      company: /assertCompanyWritable\s*\(\s*companyId\s*\)/,
      effect: /step\.run\s*\(\s*['"]refresh-typing['"]/,
    },
    {
      name: 'notification channel delivery',
      path: 'lib/inngest/functions/notification-channel-send.ts',
      anchor: 'const data = event.data as NotificationChannelSendPayload',
      company: /assertCompanyWritable\s*\(\s*data\.companyId\s*\)/,
      effect: /step\.run\s*\(/,
    },
    {
      name: 'Xphere synchronization',
      path: 'lib/inngest/functions/xphere-sync.ts',
      anchor: 'const data = event.data as XphereSyncRequestedPayload',
      company: /assertCompanyWritable\s*\(\s*companyId\s*\)/,
      effect: /step\.run\s*\(\s*['"]load-company['"]/,
    },
  ])('$name uses trusted event or row company before effects', ({ path, anchor, company, effect }) => {
    expectGuardBefore(path, afterAnchor(path, anchor), company, effect)
  })

  it('email digest guards the trusted event company and every fetched company group', () => {
    const path = 'lib/inngest/functions/notification-email-digest.ts'
    const handler = afterAnchor(path, 'async ({ event, step }) => {')
    expectGuardBefore(
      path,
      handler,
      /assertCompanyWritable\s*\(\s*eventCompanyId\s*\)/,
      /requireServiceClient\s*\(/,
    )

    const group = handler.slice(handler.indexOf('for (const [key, items] of groups)'))
    expect(group).toMatch(
      /assertCompanyWritable\s*\(\s*items\[0\]\?\.company_id\s*\)/,
    )
    expect(group.search(/assertCompanyWritable\s*\(/)).toBeLessThan(
      group.search(/getUserById\s*\(/),
    )
  })

  it.each([
    {
      path: 'lib/inngest/functions/generate-estimate.ts',
      anchor: 'onFailure: async ({ event, error }) => {',
      company: /assertCompanyWritable\s*\(\s*payload\.companyId\s*\)/,
      effect: /loadOwnerUserId\s*\(/,
    },
    {
      path: 'lib/inngest/functions/analyze-photos.ts',
      anchor: 'onFailure: async ({ event, error }) => {',
      company: /assertCompanyWritable\s*\(\s*payload\.companyId\s*\)/,
      effect: /loadOwnerUserId\s*\(/,
    },
    {
      path: 'lib/inngest/functions/transcribe-audio.ts',
      anchor: 'const { companyId, userId, projectId } = await loadCompanyForRecording',
      company: /assertCompanyWritable\s*\(\s*companyId\s*\)/,
      effect: /recordPipelineEvent\s*\(/,
    },
    {
      path: 'lib/inngest/functions/whatsapp-process.ts',
      anchor: 'onFailure: async ({ event }) => {',
      company: /assertCompanyWritable\s*\(\s*payload\.companyId\s*\)/,
      effect: /sendFallbackReply\s*\(/,
    },
    {
      path: 'lib/inngest/functions/xphere-sync.ts',
      anchor: 'onFailure: async ({ event, error }) => {',
      company: /assertCompanyWritable\s*\(\s*payload\.companyId\s*\)/,
      effect: /requireServiceClient\s*\(/,
    },
  ])('$path failure callback denies before status, audit, or provider effects', ({
    path,
    anchor,
    company,
    effect,
  }) => {
    expectGuardBefore(path, afterAnchor(path, anchor), company, effect)
  })
})

describe('SAFE-02: platform maintenance authority is explicit and non-browser', () => {
  const maintenanceJobs = [
    {
      path: 'lib/inngest/functions/cleanup-audio.ts',
      disposition: 'operator cleanup intentionally includes eligible demo rows',
    },
    {
      path: 'lib/inngest/functions/notification-cleanup.ts',
      disposition: 'operator retention intentionally includes eligible demo rows',
    },
    {
      path: 'lib/inngest/functions/retention-cleanup.ts',
      disposition: 'operator retention intentionally includes eligible demo rows',
    },
    {
      path: 'lib/inngest/functions/storage-orphan-cleanup.ts',
      disposition: 'operator cleanup intentionally includes eligible demo rows',
    },
    {
      path: 'lib/inngest/functions/pipeline-watchdog.ts',
      disposition: 'operator watchdog intentionally observes eligible demo rows',
    },
    {
      path: 'lib/inngest/functions/monthly-credit-grant.ts',
      disposition: 'platform monthly grant intentionally includes configured demo rows',
    },
  ] as const

  it.each(maintenanceJobs)(
    '$path remains cron-authorized: $disposition',
    ({ path, disposition }) => {
      const text = source(path)
      expect(disposition).toMatch(/intentionally/)
      expect(text).toMatch(/triggers:\s*\[\{\s*cron:/)
      expect(text).not.toContain('@/lib/demo/guard')
    },
  )

  it('demo reset remains an offline service-role operator workflow', () => {
    const text = source('scripts/seed-demo-workspace.mjs')
    expect(text).toContain('--reset')
    expect(text).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(text).not.toContain('@/lib/demo/guard')
  })
})
