import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { QA_APP_ORIGIN, requireQaDevelopment } from '../../tests/qa/fixtures/development.ts'
import { qaManagedPosts } from '../../tests/qa/fixtures/managed-content.ts'

class SeedError extends Error {}

function readMode(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--plan')) return 'plan'
  if (args.length === 1 && args[0] === '--apply') return 'apply'
  throw new SeedError('Use --plan or --apply, with no other arguments.')
}

function samePayload(actual, expected) {
  return Object.entries(expected).every(([column, value]) => {
    if (column === 'published_at') {
      return typeof actual[column] === 'string' && Date.parse(actual[column]) === Date.parse(value)
    }
    return actual[column] === value
  })
}

function confirmManagedRows(read, expected, lookupKey, category) {
  for (const actual of read) {
    const wanted = expected.find(row => row.id === actual.id && row[lookupKey] === actual[lookupKey])
    if (!wanted || !samePayload(actual, wanted)) {
      throw new SeedError(`Managed ${category} has a key collision or payload mismatch.`)
    }
  }
}

async function plan(store) {
  const [postsById, postsBySlug, automation] = await Promise.all([
    store.readPosts('id', qaManagedPosts.map(row => row.id)),
    store.readPosts('slug', qaManagedPosts.map(row => row.slug)),
    store.readAutomation(),
  ])
  if (automation?.enabled || automation?.rss_enabled) throw new SeedError('Managed DEV posts require disabled blog automation.')
  const posts = [...postsById, ...postsBySlug]
  confirmManagedRows(posts, qaManagedPosts, 'slug', 'blog content')
  return {
    posts: qaManagedPosts.filter(row => !posts.some(existing => existing.id === row.id)),
  }
}

async function makeStore({ supabaseOrigin, serviceKey }) {
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(supabaseOrigin, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        const request = new Request(input, { ...init, redirect: 'error' })
        if (new URL(request.url).origin !== supabaseOrigin) throw new SeedError('Unexpected seed destination.')
        return fetch(request, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]) })
      },
    },
  })

  async function read(table, expected, key, values) {
    const { data, error } = await db.from(table).select(Object.keys(expected).join(',')).in(key, values)
    if (error || !data) throw new SeedError('Managed content preflight read failed.')
    return data
  }

  async function insert(table, rows) {
    const { error } = await db.from(table).insert(rows)
    if (error) throw new SeedError('Managed content insert failed. Recheck the plan before applying again.')
  }

  return {
    readPosts: (key, values) => read('blog_posts', qaManagedPosts[0], key, values),
    insertPosts: rows => insert('blog_posts', rows),
    readAutomation: async () => {
      const { data, error } = await db.from('blog_settings').select('enabled,rss_enabled').eq('id', 1).maybeSingle()
      if (error) throw new SeedError('Could not verify disabled DEV blog automation.')
      return data
    },
  }
}

/** Authorize before constructing the transport. The injectable store supports offline guard tests. */
export async function seedManagedContent({ args = [], env = process.env, createStore = makeStore } = {}) {
  const mode = readMode(args)
  let connection
  try {
    connection = requireQaDevelopment(QA_APP_ORIGIN, env)
  } catch {
    throw new SeedError('Managed content requires the configured, exact Xtimator DEV database.')
  }

  const store = await createStore(connection)
  const missing = await plan(store)
  const planned = { blogPosts: missing.posts.length }
  const inserted = { blogPosts: 0 }
  if (mode === 'apply') {
    if (missing.posts.length) {
      await store.insertPosts(missing.posts)
      inserted.blogPosts = missing.posts.length
    }
    const remaining = await plan(store)
    if (remaining.posts.length) throw new SeedError('Managed content readback incomplete.')
  }
  return { mode, planned, inserted }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await seedManagedContent({ args: process.argv.slice(2) })))
  } catch (error) {
    console.error(error instanceof SeedError ? error.message : 'Managed DEV content operation failed.')
    process.exitCode = 1
  }
}
