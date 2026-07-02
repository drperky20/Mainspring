#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const steps = [
  ['desktop packaging config', ['run', 'desktop:packaging:check']],
  ['desktop typecheck', ['run', 'desktop:typecheck']],
  ['desktop build', ['run', 'desktop:build']],
]

for (const [label, args] of steps) {
  console.log(`Mainspring desktop systems check: running ${label}...`)
  const result = runPnpm(args)
  if (result.status === 0) {
    console.log(`Mainspring desktop systems check: ${label} passed.`)
    continue
  }

  process.stdout.write(result.output)
  console.error(`Mainspring desktop systems check failed: ${label}`)
  process.exit(result.status ?? 1)
}

if (process.platform === 'win32') {
  console.log('Mainspring desktop systems check: running desktop pack...')
  const result = runPnpm(['run', 'desktop:pack'])
  if (result.status !== 0) {
    process.stdout.write(result.output)
    console.error('Mainspring desktop systems check failed: desktop pack')
    process.exit(result.status ?? 1)
  }
  console.log('Mainspring desktop systems check: desktop pack passed.')
} else {
  console.log('Mainspring desktop systems check: desktop installer packaging skipped on this non-Windows host; Linux users run from source.')
}

console.log('MAINSPRING_DESKTOP_SYSTEMS_CHECK_OK')

function runPnpm(args) {
  const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'pnpm'
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', ['pnpm', ...args].map(quoteCmdArg).join(' ')]
    : args
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    windowsHide: true,
  })
  const errorOutput = result.error ? `${result.error.message}\n` : ''
  return {
    status: result.status ?? (result.error ? 1 : 0),
    output: `${result.stdout ?? ''}${result.stderr ?? ''}${errorOutput}`,
  }
}

function quoteCmdArg(value) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value
  return `"${value.replace(/"/g, '\\"')}"`
}
