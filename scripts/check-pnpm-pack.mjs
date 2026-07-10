#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let temporaryDirectory
let packedArtifact
let failure

try {
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'mainspring-pnpm-pack-'))
  const result = runPnpm([
    'pack',
    '--pack-destination',
    temporaryDirectory,
    '--json',
  ])

  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    throw new Error(`pnpm pack failed with exit ${result.status ?? 'unknown'}${detail ? `:\n${detail}` : ''}`)
  }

  const tarballs = readdirSync(temporaryDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tgz'))
    .map((entry) => path.join(temporaryDirectory, entry.name))

  if (tarballs.length !== 1) {
    throw new Error(`pnpm pack expected one tarball, found ${tarballs.length}`)
  }

  const tarballPath = tarballs[0]
  const sizeBytes = statSync(tarballPath).size
  if (sizeBytes <= 0) throw new Error('pnpm pack produced an empty tarball')

  packedArtifact = {
    filename: path.basename(tarballPath),
    sizeBytes,
  }
} catch (error) {
  failure = error
} finally {
  if (temporaryDirectory) {
    try {
      rmSync(temporaryDirectory, { recursive: true, force: true })
    } catch (error) {
      failure = failure
        ? new AggregateError([failure, error], 'pnpm pack check and temporary-directory cleanup failed')
        : error
    }
  }
}

if (failure) {
  console.error('Mainspring pnpm pack check failed:')
  console.error(failure instanceof Error ? failure.message : String(failure))
  process.exit(1)
}

console.log(JSON.stringify(packedArtifact))
console.log('MAINSPRING_PNPM_PACK_CHECK_OK')

function runPnpm(args) {
  if (process.platform !== 'win32') {
    return spawnSync('pnpm', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: false,
    })
  }

  const command = process.env.ComSpec || 'cmd.exe'
  const commandLine = ['pnpm', ...args].map(quoteWindowsCommandArgument).join(' ')
  return spawnSync(command, ['/d', '/s', '/c', commandLine], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
}

function quoteWindowsCommandArgument(value) {
  if (/^[A-Za-z0-9_./:\\-]+$/.test(value)) return value
  return `"${value.replace(/"/g, '\\"')}"`
}
