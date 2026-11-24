import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { collectRuntimeInventory } from './runtime-inventory.mjs'

async function createSandbox(t) {
  const parent = resolve(tmpdir())
  const directory = await mkdtemp(join(parent, 'xtimator-runtime-inventory-'))
  t.after(async () => {
    assert.equal(dirname(directory), parent)
    assert.match(basename(directory), /^xtimator-runtime-inventory-/)
    await rm(directory, { recursive: true, force: true })
  })
  return directory
}

async function addPackage(root, directory, name, version) {
  const path = join(root, directory)
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'package.json'), JSON.stringify({ name, version }))
}

test('enumerates installed, scoped and bundled metadata anywhere under node_modules only', async t => {
  const root = await createSandbox(t)
  await addPackage(root, '.', 'root-manifest', '9.9.9')
  await addPackage(root, 'source', 'not-installed', '7.0.0')
  await addPackage(root, 'node_modules/alpha', 'alpha', '1.0.0')
  await addPackage(root, 'node_modules/alpha/examples', 'example', '7.0.0')
  await addPackage(root, 'node_modules/alpha/node_modules/@scope/beta', '@scope/beta', '2.1.0-alpha.2')
  await addPackage(root, 'node_modules/@scope/beta', '@scope/beta', '1.4.0+runtime')
  await addPackage(root, 'node_modules/next', 'next', '16.4.6')
  await addPackage(root, 'node_modules/next/dist/compiled/react', 'react', '19.3.0-canary-abc123')
  assert.deepEqual(await collectRuntimeInventory(root), {
    complete: true,
    packages: [
      { name: '@scope/beta', version: '1.4.0+runtime', path: 'node_modules/@scope/beta' },
      { name: 'alpha', version: '1.0.0', path: 'node_modules/alpha' },
      { name: 'example', version: '7.0.0', path: 'node_modules/alpha/examples' },
      { name: '@scope/beta', version: '2.1.0-alpha.2', path: 'node_modules/alpha/node_modules/@scope/beta' },
      { name: 'next', version: '16.4.6', path: 'node_modules/next' },
      { name: 'react', version: '19.3.0-canary-abc123', path: 'node_modules/next/dist/compiled/react' },
    ],
    gaps: [],
  })
})

test('rejects a missing artifact and does not mark an empty tree complete', async t => {
  const root = await createSandbox(t)
  await assert.rejects(collectRuntimeInventory(join(root, 'missing')), /node_modules directory is required/)
  await assert.rejects(collectRuntimeInventory(root), /node_modules directory is required/)
  await mkdir(join(root, 'node_modules'))
  assert.deepEqual(await collectRuntimeInventory(root), {
    complete: false, packages: [], gaps: [{ path: 'node_modules', reason: 'empty-inventory' }],
  })
})

test('records missing and invalid metadata and symlinks without following them outside the artifact', async t => {
  const temp = await createSandbox(t)
  const root = join(temp, 'standalone')
  const external = join(temp, 'unrelated')
  await addPackage(temp, 'unrelated', 'foreign', '1.0.0')
  await addPackage(root, 'node_modules/good', 'good', '2.3.4')
  await mkdir(join(root, 'node_modules/missing'))
  await mkdir(join(root, 'node_modules/bad'))
  await writeFile(join(root, 'node_modules/bad/package.json'), '{ invalid')
  await addPackage(root, 'node_modules/invalid-version', 'invalid-version', 'workspace:*')
  await mkdir(join(root, 'node_modules/good/dist/esm'), { recursive: true })
  await writeFile(join(root, 'node_modules/good/dist/esm/package.json'), '{"type":"module"}')
  await symlink(external, join(root, 'node_modules/@external'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.deepEqual(await collectRuntimeInventory(root), {
    complete: false,
    packages: [{ name: 'good', version: '2.3.4', path: 'node_modules/good' }],
    gaps: [
      { path: 'node_modules/@external', reason: 'symlink' },
      { path: 'node_modules/bad/package.json', reason: 'invalid-metadata' },
      { path: 'node_modules/good/dist/esm/package.json', reason: 'unversioned-metadata' },
      { path: 'node_modules/invalid-version/package.json', reason: 'invalid-metadata' },
      { path: 'node_modules/missing/package.json', reason: 'missing-metadata' },
    ],
  })
})

test('CLI emits GitHub development-build metadata and counts, and refuses missing output inputs', async t => {
  const cwd = await createSandbox(t)
  const script = fileURLToPath(new URL('./runtime-inventory.mjs', import.meta.url))
  const revision = 'a'.repeat(40)
  const output = join(cwd, 'qa-results/runtime-dependencies.json')
  const run = () => spawnSync(process.execPath, [script], { cwd, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, GITHUB_SHA: revision, GITHUB_ACTIONS: 'true' } })
  assert.equal(run().status, 1)
  await assert.rejects(access(output), { code: 'ENOENT' })
  await addPackage(cwd, '.next/standalone/node_modules/sample', 'sample', '1.0.0')
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'Runtime inventory counts: packages=1, completeness gaps=0.')
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), {
    testedGitSHA: revision, artifactNature: 'production-mode-development-resources', scope: 'node_modules/**/package.json', complete: true,
    packages: [{ name: 'sample', version: '1.0.0', path: 'node_modules/sample' }], gaps: [],
  })
})
