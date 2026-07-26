import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260726000001_demo_readonly_foundation.sql',
)

const source = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, 'utf8') : ''

function executableSql(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const sql = executableSql(source)

function functionDefinition(name: string): string {
  const match = sql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${name}\\([^)]*\\)[\\s\\S]*?\\$\\$\\s*;`,
      'i',
    ),
  )
  return match?.[0] ?? ''
}

function expectRestrictivePolicy(
  policyName: string,
  target: string,
  command: 'INSERT' | 'UPDATE' | 'DELETE',
) {
  expect(sql).toMatch(
    new RegExp(
      `CREATE POLICY ["']?${policyName}["']? ON ${target} AS RESTRICTIVE FOR ${command} TO authenticated`,
      'i',
    ),
  )
}

describe('demo read-only foundation migration contract', () => {
  it('exists as one atomic transaction', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true)
    expect(sql).toMatch(/^BEGIN\s*;/i)
    expect(sql).toMatch(/COMMIT\s*;$/i)
    expect((sql.match(/\bBEGIN\s*;/gi) ?? [])).toHaveLength(1)
    expect((sql.match(/\bCOMMIT\s*;/gi) ?? [])).toHaveLength(1)
  })

  it('fails closed before hardening unless one complete, unambiguous mapping exists', () => {
    const hardeningAt = sql.search(
      /ALTER TABLE public\.demo_config ALTER COLUMN company_id SET NOT NULL/i,
    )
    expect(hardeningAt).toBeGreaterThan(0)

    const preflight = sql.slice(0, hardeningAt)
    expect(preflight).toMatch(/FROM public\.demo_config/i)
    expect(preflight).toMatch(/JOIN auth\.users/i)
    expect(preflight).toMatch(/JOIN public\.companies/i)
    expect(preflight).toMatch(/JOIN public\.company_members/i)
    expect(preflight).toMatch(/COUNT\s*\(\s*\*\s*\)/i)
    expect(preflight).toMatch(/COUNT\s*\(\s*DISTINCT\s+[^)]*company_id/i)
    expect(preflight).toMatch(/company_id\s+IS\s+NULL/i)
    expect(preflight).toMatch(/RAISE EXCEPTION/i)

    expect(sql).toMatch(
      /ALTER TABLE public\.demo_config ALTER COLUMN company_id SET NOT NULL/i,
    )
    expect(sql).toMatch(/FOREIGN KEY\s*\(\s*company_id\s*\)\s+REFERENCES public\.companies/i)
    expect(sql).toMatch(/UNIQUE[\s\S]*company_id|company_id[\s\S]*UNIQUE/i)
  })

  it('pins both stable security-definer helpers and grants only authenticated execution', () => {
    for (const name of ['is_demo_user', 'is_demo_company']) {
      const definition = functionDefinition(name)
      expect(definition).not.toBe('')
      expect(definition).toMatch(/\bSTABLE\b/i)
      expect(definition).toMatch(/\bSECURITY DEFINER\b/i)
      expect(definition).toMatch(/SET search_path\s*=\s*public\s*,\s*pg_temp/i)
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC`, 'i'),
      )
      expect(sql).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO authenticated`,
          'i',
        ),
      )
    }

    expect(functionDefinition('is_demo_user')).toMatch(/auth\.uid\s*\(\s*\)/i)
    expect(functionDefinition('is_demo_company')).toMatch(/demo_config[\s\S]*company_id/i)
    expect(sql).not.toMatch(/\bplatform_admins?\b|\bis_super_admin\b|\bprovider\b/i)
  })

  it('recreates restrictive user write triplets on every current public RLS base table', () => {
    expect(sql).toMatch(/pg_class/i)
    expect(sql).toMatch(/pg_namespace/i)
    expect(sql).toMatch(/nspname\s*=\s*'public'/i)
    expect(sql).toMatch(/relkind\s*=\s*'r'/i)
    expect(sql).toMatch(/relrowsecurity\s*=\s*true/i)
    expect(sql).toMatch(/relname\s*<>\s*'demo_config'/i)

    expectRestrictivePolicy('demo_block_insert', 'public\\.%I', 'INSERT')
    expectRestrictivePolicy('demo_block_update', 'public\\.%I', 'UPDATE')
    expectRestrictivePolicy('demo_block_delete', 'public\\.%I', 'DELETE')
    expect(sql).toMatch(
      /demo_block_insert[\s\S]*WITH CHECK\s*\(\s*NOT public\.is_demo_user\s*\(\s*\)\s*\)/i,
    )
    expect(sql).toMatch(
      /demo_block_update[\s\S]*USING\s*\(\s*NOT public\.is_demo_user\s*\(\s*\)\s*\)[\s\S]*WITH CHECK\s*\(\s*NOT public\.is_demo_user\s*\(\s*\)\s*\)/i,
    )
    expect(sql).toMatch(
      /demo_block_delete[\s\S]*USING\s*\(\s*NOT public\.is_demo_user\s*\(\s*\)\s*\)/i,
    )
  })

  it('adds company-row triplets only to compatible UUID company identifiers', () => {
    expect(sql).toMatch(/attname\s*=\s*'company_id'/i)
    expect(sql).toMatch(/atttypid\s*=\s*'uuid'::regtype/i)

    expectRestrictivePolicy('demo_company_block_insert', 'public\\.%I', 'INSERT')
    expectRestrictivePolicy('demo_company_block_update', 'public\\.%I', 'UPDATE')
    expectRestrictivePolicy('demo_company_block_delete', 'public\\.%I', 'DELETE')
    expect(sql).toMatch(
      /demo_company_block_insert[\s\S]*WITH CHECK\s*\(\s*NOT public\.is_demo_company\s*\(\s*company_id\s*\)\s*\)/i,
    )
    expect(sql).toMatch(
      /demo_company_block_update[\s\S]*USING\s*\(\s*NOT public\.is_demo_company\s*\(\s*company_id\s*\)\s*\)[\s\S]*WITH CHECK\s*\(\s*NOT public\.is_demo_company\s*\(\s*company_id\s*\)\s*\)/i,
    )
    expect(sql).toMatch(
      /demo_company_block_delete[\s\S]*USING\s*\(\s*NOT public\.is_demo_company\s*\(\s*company_id\s*\)\s*\)/i,
    )

    expectRestrictivePolicy('demo_company_block_insert', 'public\\.companies', 'INSERT')
    expectRestrictivePolicy('demo_company_block_update', 'public\\.companies', 'UPDATE')
    expectRestrictivePolicy('demo_company_block_delete', 'public\\.companies', 'DELETE')
    expect(sql).toMatch(/NOT public\.is_demo_company\s*\(\s*id\s*\)/i)
  })

  it('covers storage writes with user and safely parsed company-path triplets', () => {
    for (const command of ['INSERT', 'UPDATE', 'DELETE'] as const) {
      expectRestrictivePolicy(`demo_block_${command.toLowerCase()}`, 'storage\\.objects', command)
      expectRestrictivePolicy(
        `demo_company_block_${command.toLowerCase()}`,
        'storage\\.objects',
        command,
      )
    }

    expect(sql).toMatch(/storage\.foldername\s*\(\s*name\s*\)/i)
    expect(sql).toMatch(/CASE\s+WHEN[\s\S]*~\*?\s*'[^']+'[\s\S]*::uuid[\s\S]*ELSE NULL/i)
    expect(sql).toMatch(
      /demo_company_block_insert[\s\S]*NOT public\.is_demo_company[\s\S]*storage\.foldername/i,
    )

    const uuidPattern = source.match(/~\*\s*'([^']+)'/)?.[1]
    expect(uuidPattern).toBeDefined()
    const uuidRegex = new RegExp(uuidPattern!, 'i')
    expect('0000de00-0000-0000-0000-000000000001').toMatch(uuidRegex)
    expect('not-a-uuid').not.toMatch(uuidRegex)
  })

  it('ends with catalog assertions for public, companies, and storage coverage', () => {
    const catalogAt = sql.lastIndexOf('pg_policies')
    const commitAt = sql.lastIndexOf('COMMIT')
    expect(catalogAt).toBeGreaterThan(0)
    expect(catalogAt).toBeLessThan(commitAt)

    const assertions = sql.slice(Math.max(0, catalogAt - 8_000), commitAt)
    expect(assertions).toMatch(/pg_policies/i)
    expect(assertions).toMatch(/permissive\s*=\s*'RESTRICTIVE'/i)
    expect(assertions).toMatch(/demo_block_insert/i)
    expect(assertions).toMatch(/demo_block_update/i)
    expect(assertions).toMatch(/demo_block_delete/i)
    expect(assertions).toMatch(/demo_company_block_insert/i)
    expect(assertions).toMatch(/demo_company_block_update/i)
    expect(assertions).toMatch(/demo_company_block_delete/i)
    expect(assertions).toMatch(/schemaname\s*=\s*'storage'/i)
    expect(assertions).toMatch(/tablename\s*=\s*'objects'/i)
    expect(assertions).toMatch(/tablename\s*=\s*'companies'/i)
    expect(assertions).toMatch(/RAISE EXCEPTION/i)
  })
})
