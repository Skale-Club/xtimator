#!/usr/bin/env node
/**
 * Watches for git branch switches and auto-restarts the dev server.
 * Run via: npm run dev
 */
import { spawn, execSync } from 'child_process'
import { rmSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const getBranch = () => {
  try { return execSync('git branch --show-current', { cwd: ROOT, encoding: 'utf8' }).trim() }
  catch { return '' }
}

const pull = () => {
  try { execSync('git pull --rebase', { cwd: ROOT, stdio: 'pipe' }) }
  catch {}
}

const clearNext = () => {
  const dir = resolve(ROOT, '.next')
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

let proc = null

const startServer = (branch) => {
  if (proc) {
    try { proc.kill() } catch {}
    proc = null
  }

  pull()
  clearNext()

  console.log(`\n🚀  dev server — ${branch}\n`)

  proc = spawn(
    'node_modules/.bin/cross-env',
    ['NODE_OPTIONS=--max-http-header-size=32768', 'node_modules/.bin/next', 'dev', '--port', '9633'],
    { cwd: ROOT, stdio: 'inherit', shell: true }
  )
}

let currentBranch = getBranch()
startServer(currentBranch)

setInterval(() => {
  const b = getBranch()
  if (b && b !== currentBranch) {
    console.log(`\n⚡ branch switched: ${currentBranch} → ${b}`)
    currentBranch = b
    startServer(b)
  }
}, 1500)

const cleanup = () => { if (proc) try { proc.kill() } catch {}; process.exit() }
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
