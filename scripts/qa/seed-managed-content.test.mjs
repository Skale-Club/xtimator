import assert from 'node:assert/strict'
import { test } from 'node:test'
import { qaBlogPrimary, qaManagedPosts } from '../../tests/qa/fixtures/managed-content.ts'
import { seedManagedContent } from './seed-managed-content.mjs'

const env = {
  XTIMATOR_QA_DEV: '1', DATA_API_MODE: 'supabase', NEXT_PUBLIC_AUTH_MODE: 'owned',
  NEXT_PUBLIC_SUPABASE_URL: 'https://prmqgcrnpuvpzruyzvuv.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-local-test-value',
}

function fakeStore(posts = [], automation = null) {
  const writes = []
  return {
    writes,
    readPosts: async (key, values) => posts.filter(row => values.includes(row[key])),
    readAutomation: async () => automation,
    insertPosts: async rows => { writes.push({ table: 'posts', rows }); posts.push(...rows) },
  }
}

const run = (store, args) => seedManagedContent({ env, args, createStore: async () => store })

test('wrong public origin or upstream stops before a database client is constructed', async () => {
  for (const invalid of [
    { NEXT_PUBLIC_SUPABASE_URL: 'https://unapproved.example.invalid' },
    { DATA_API_UPSTREAM_URL: 'https://unapproved.example.invalid' },
    { SUPABASE_SERVICE_ROLE_KEY: '' },
  ]) {
    let opened = false
    await assert.rejects(seedManagedContent({
      args: ['--apply'], env: { ...env, ...invalid }, createStore: async () => { opened = true; return fakeStore() },
    }), /exact Xtimator DEV database/)
    assert.equal(opened, false)
  }
})

test('default and explicit plans report only counts and never insert', async () => {
  const store = fakeStore()
  const expected = { mode: 'plan', planned: { blogPosts: 4 }, inserted: { blogPosts: 0 } }
  assert.deepEqual(await run(store), expected)
  assert.deepEqual(await run(store, ['--plan']), expected)
  assert.deepEqual(store.writes, [])
})

test('preflights all rows and aborts before insertion on foreign keys or drift', async () => {
  const rejected = [
    fakeStore([{ ...qaBlogPrimary, slug: 'foreign-slug' }]),
    fakeStore([{ ...qaBlogPrimary, id: '11111111-1111-4111-8111-111111111111' }]),
    fakeStore([{ ...qaBlogPrimary, content: 'unmanaged body' }]),
  ]
  for (const store of rejected) {
    await assert.rejects(run(store, ['--apply']), /key collision or payload mismatch/)
    assert.deepEqual(store.writes, [])
  }
})

test('equivalent database timestamp serialization is an exact managed match', async () => {
  const alternateDate = { ...qaBlogPrimary, published_at: '2026-10-13T12:00:00+00:00' }
  const store = fakeStore([alternateDate, ...qaManagedPosts.slice(1)])
  assert.deepEqual((await run(store, ['--apply'])).inserted, { blogPosts: 0 })
  assert.deepEqual(store.writes, [])
})

test('apply inserts only missing records, checks readback, and is idempotent', async () => {
  const store = fakeStore([{ ...qaBlogPrimary }])
  assert.deepEqual((await run(store, ['--apply'])).inserted, { blogPosts: 3 })
  assert.deepEqual(store.writes, [
    { table: 'posts', rows: qaManagedPosts.slice(1) },
  ])
  assert.deepEqual((await run(store, ['--apply'])).inserted, { blogPosts: 0 })
  assert.equal(store.writes.length, 1)
})

test('active blog generation or RSS blocks even an explicit apply before insertion', async () => {
  for (const settings of [{ enabled: true, rss_enabled: false }, { enabled: false, rss_enabled: true }]) {
    const store = fakeStore([], settings)
    await assert.rejects(run(store, ['--apply']), /disabled blog automation/)
    assert.deepEqual(store.writes, [])
  }
})
