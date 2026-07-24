#!/usr/bin/env node
import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { spawn } from 'node:child_process'

const [logPath, command, ...args] = process.argv.slice(2)

if (!logPath || !command) {
  console.error('Usage: node scripts/run-command-with-log.mjs <log-path> <command> [...args]')
  process.exitCode = 2
} else {
  mkdirSync(dirname(logPath), { recursive: true })
  const log = createWriteStream(logPath, { flags: 'w' })
  let finished = false

  const finish = (exitCode, detail) => {
    if (finished) return
    finished = true
    log.end(detail, () => {
      process.exitCode = exitCode
    })
  }

  log.write(
    `[mainspring-ci] started ${new Date().toISOString()}\n`
      + `[mainspring-ci] command ${command} (${args.length} arguments)\n\n`,
  )

  const child = spawn(command, args, {
    env: process.env,
    shell: process.platform === 'win32',
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
  })

  const mirror = (stream, destination) => {
    stream.on('data', (chunk) => {
      destination.write(chunk)
      log.write(chunk)
    })
  }

  mirror(child.stdout, process.stdout)
  mirror(child.stderr, process.stderr)

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal)
  }

  process.once('SIGINT', () => forwardSignal('SIGINT'))
  process.once('SIGTERM', () => forwardSignal('SIGTERM'))

  child.once('error', (error) => {
    const detail = `\n[mainspring-ci] failed to start command: ${error.message}\n`
    process.stderr.write(detail)
    finish(1, detail)
  })

  child.once('close', (code, signal) => {
    const exitCode = code ?? 1
    const detail = `\n[mainspring-ci] finished ${new Date().toISOString()} exit=${exitCode}${signal ? ` signal=${signal}` : ''}\n`
    finish(exitCode, detail)
  })
}
