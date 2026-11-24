import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

const packageName = /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i
const packageVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[a-z0-9-]+(?:\.[a-z0-9-]+)*)?(?:\+[a-z0-9-]+(?:\.[a-z0-9-]+)*)?$/i
const comparePaths = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0

/** Inventory package metadata files present anywhere under standalone/node_modules. */
export async function collectRuntimeInventory(root) {
  const artifact = resolve(root)
  const modules = join(artifact, 'node_modules')
  const artifactEntry = await lstat(artifact).catch(() => null)
  const moduleEntry = artifactEntry?.isDirectory() ? await lstat(modules).catch(() => null) : null
  if (!moduleEntry?.isDirectory()) {
    throw new Error('A readable standalone artifact with a real node_modules directory is required')
  }

  const packages = []
  const gaps = []
  const portablePath = path => relative(artifact, path).split(sep).join('/')
  const gap = (path, reason) => gaps.push({ path: portablePath(path), reason })

  async function entries(directory) {
    try {
      return await readdir(directory, { withFileTypes: true })
    } catch {
      gap(directory, 'unreadable-directory')
      return null
    }
  }

  async function readMetadata(directory) {
    const filename = join(directory, 'package.json')
    let contents
    try {
      const entry = await lstat(filename)
      if (entry.isSymbolicLink()) return gap(filename, 'symlink')
      if (!entry.isFile()) return gap(filename, 'invalid-metadata')
      const file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      try {
        contents = await file.readFile('utf8')
      } finally {
        await file.close()
      }
    } catch (error) {
      return gap(filename, error.code === 'ENOENT' ? 'missing-metadata'
        : error.code === 'ELOOP' ? 'symlink' : 'unreadable-metadata')
    }

    let metadata
    try {
      metadata = JSON.parse(contents)
    } catch {
      return gap(filename, 'invalid-metadata')
    }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return gap(filename, 'invalid-metadata')
    const { name, version } = metadata
    if (name === undefined || version === undefined) return gap(filename, 'unversioned-metadata')
    if (typeof name !== 'string' || !packageName.test(name) || typeof version !== 'string' || !packageVersion.test(version)) {
      return gap(filename, 'invalid-metadata')
    }
    packages.push({ name, version, path: portablePath(directory) })
  }

  async function visit(directory, kind) {
    const children = await entries(directory)
    if (!children) return
    if (kind === 'package' || children.some(entry => entry.name === 'package.json')) await readMetadata(directory)
    for (const entry of children) {
      if (entry.name === 'package.json') continue
      const child = join(directory, entry.name)
      if (entry.isSymbolicLink()) gap(child, 'symlink')
      else if (entry.isDirectory()) {
        const childKind = entry.name === 'node_modules' ? 'modules'
          : kind === 'modules' && entry.name.startsWith('@') ? 'scope'
          : (kind === 'modules' || kind === 'scope') && !entry.name.startsWith('.') ? 'package' : 'directory'
        await visit(child, childKind)
      }
    }
  }

  await visit(modules, 'modules')
  if (!packages.length) gap(modules, 'empty-inventory')
  packages.sort(comparePaths)
  gaps.sort(comparePaths)
  return { complete: gaps.length === 0, packages, gaps }
}

if (import.meta.main) {
  try {
    const [root = '.next/standalone', extra] = process.argv.slice(2)
    if (extra !== undefined) throw new Error('Expected at most one standalone artifact path')
    const inventory = await collectRuntimeInventory(root)
    const revision = process.env.GITHUB_SHA
    const evidence = {
      testedGitSHA: /^[0-9a-f]{40}$/i.test(revision ?? '') ? revision : null,
      artifactNature: process.env.GITHUB_ACTIONS === 'true' ? 'production-mode-development-resources' : 'local-standalone',
      scope: 'node_modules/**/package.json',
      ...inventory,
    }
    const output = 'qa-results/runtime-dependencies.json'
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, JSON.stringify(evidence, null, 2) + '\n')
    console.log(`Runtime inventory counts: packages=${inventory.packages.length}, completeness gaps=${inventory.gaps.length}.`)
  } catch (error) {
    console.error('Could not inventory the standalone runtime.', error instanceof Error ? error.message : '')
    process.exitCode = 1
  }
}
