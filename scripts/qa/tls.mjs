import { spawnSync } from 'node:child_process'
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, rmdirSync } from 'node:fs'
import { createHash, X509Certificate } from 'node:crypto'
import { basename, dirname, join, resolve } from 'node:path'

const TLS_ROOT = resolve('.bg-shell/qa/tls')
const DIRECTORY_ENV = 'XTIMATOR_QA_TLS_DIRECTORY'

function tlsPaths(directory) {
  const path = resolve(directory)
  if (dirname(path) !== TLS_ROOT || !/^run-[a-z0-9]{6}$/i.test(basename(path)) || realpathSync(path) !== path) {
    throw new Error('QA TLS requires a generated, non-symlinked run directory')
  }
  return {
    directory: path,
    keyPath: join(path, 'localhost-key.pem'),
    certificatePath: join(path, 'localhost-cert.pem'),
  }
}

export function readQaTls(env = process.env) {
  if (!env[DIRECTORY_ENV]) throw new Error('Launch the HTTPS QA server through the QA campaign runner')
  const tls = tlsPaths(env[DIRECTORY_ENV])
  if (![tls.keyPath, tls.certificatePath].every(path => lstatSync(path).isFile())) {
    throw new Error('QA TLS requires locally generated certificate and key files')
  }
  return tls
}

export function removeQaTls(directory) {
  const tls = tlsPaths(directory)
  rmSync(tls.keyPath, { force: true })
  rmSync(tls.certificatePath, { force: true })
  rmdirSync(tls.directory)
}

export function createQaTls() {
  mkdirSync(TLS_ROOT, { recursive: true, mode: 0o700 })
  if (realpathSync(TLS_ROOT) !== TLS_ROOT) throw new Error('QA TLS root must not be a symlink')

  const tls = tlsPaths(mkdtempSync(join(TLS_ROOT, 'run-')))
  try {
    const systemKeys = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE']
    const env = Object.fromEntries(systemKeys.filter(key => process.env[key]).map(key => [key, process.env[key]]))
    const generated = spawnSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1',
      '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
      '-keyout', tls.keyPath, '-out', tls.certificatePath,
    ], { env, stdio: 'ignore', timeout: 30_000 })
    if (generated.error?.code === 'ENOENT') throw new Error('The HTTPS QA runner requires OpenSSL on PATH')
    if (generated.error || generated.status !== 0) throw new Error('Could not generate the local QA TLS certificate')
    chmodSync(tls.keyPath, 0o600)
    return tls
  } catch (error) {
    removeQaTls(tls.directory)
    throw error
  }
}

export function qaTlsEnvironment(tls) {
  const validated = readQaTls({ [DIRECTORY_ENV]: tls.directory })
  const certificate = new X509Certificate(readFileSync(validated.certificatePath))
  const spki = createHash('sha256').update(certificate.publicKey.export({ type: 'spki', format: 'der' })).digest('base64')
  return { [DIRECTORY_ENV]: tls.directory, NODE_EXTRA_CA_CERTS: validated.certificatePath, XTIMATOR_QA_TLS_SPKI: spki }
}
