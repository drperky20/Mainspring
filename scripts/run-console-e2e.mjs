import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const playwrightCli = require.resolve('@playwright/test/cli')
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-console-e2e-'))
const pnpmExecutable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const packageManagerEntryName = ['npm', 'execpath'].join('_')
const packageManagerEntry = process.env[packageManagerEntryName]
const packageManagerScript = packageManagerEntry && fs.existsSync(packageManagerEntry)
  ? packageManagerEntry
  : undefined
const children = []

for (const key of [
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'CODEX_ACCESS_TOKEN',
  'CODEX_HOME',
  'MAINSPRING_CREDENTIAL_REF',
  'MAINSPRING_PROVIDER',
]) {
  delete process.env[key]
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not reserve an IPv4 test port.')))
        return
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
}

function start(command, args, environment) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
  })
  children.push(child)
  return child
}

function startPnpm(args, environment) {
  // Node 24 rejects direct .cmd spawning on Windows with EINVAL. pnpm exposes
  // its current JavaScript entrypoint through the package-manager environment, which also
  // avoids shell command parsing for these fixed test-runner arguments.
  return packageManagerScript
    ? start(process.execPath, [packageManagerScript, ...args], environment)
    : start(pnpmExecutable, args, environment)
}

function seedConsoleMemory(workspaceRoot) {
  const memoryDirectory = path.join(workspaceRoot, '.mainspring')
  fs.mkdirSync(memoryDirectory, { recursive: true })
  fs.writeFileSync(
    path.join(memoryDirectory, 'memory.jsonl'),
    `${JSON.stringify({
      entryId: 'memory_console_e2e',
      workspaceRoot,
      scope: 'workspace',
      text: 'Review the weekly intake handoff before Monday.',
      tags: ['handoff', 'weekly'],
      createdAt: '2026-07-10T12:00:00.000Z',
    })}\n`,
  )
}

function waitFor(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const probe = () => {
      const request = http.get(url, (response) => {
        response.resume()
        if (response.statusCode && response.statusCode < 500) {
          resolve()
          return
        }
        retry(new Error(`Unexpected ${response.statusCode ?? 'unknown'} response from ${url}`))
      })
      request.once('error', retry)
      request.setTimeout(1_000, () => request.destroy(new Error(`Timed out reaching ${url}`)))
    }
    const retry = (error) => {
      if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for ${url}: ${error.message}`))
        return
      }
      setTimeout(probe, 100)
    }
    probe()
  })
}

async function stopChildren() {
  await Promise.all(children.splice(0).map((child) => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }
    child.once('exit', resolve)
    child.kill('SIGTERM')
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }, 5_000).unref()
  })))
}

async function main() {
  const [gatewayPort, consolePort] = await Promise.all([reservePort(), reservePort()])
  const gatewayUrl = `http://127.0.0.1:${gatewayPort}`
  const consoleUrl = `http://127.0.0.1:${consolePort}`
  const gatewayEnvironment = {
    ...process.env,
    MAINSPRING_GATEWAY_HOST: '127.0.0.1',
    MAINSPRING_GATEWAY_PORT: String(gatewayPort),
    MAINSPRING_SESSIONS_ROOT: path.join(temporaryRoot, 'sessions'),
    MAINSPRING_WORKSPACE_ROOT: path.join(temporaryRoot, 'workspaces'),
    MAINSPRING_GATEWAY_APP_DB: path.join(temporaryRoot, 'gateway.sqlite'),
    MAINSPRING_RUNLOG_ROOT: path.join(temporaryRoot, 'runlog'),
    MAINSPRING_RUNLOG_DB: path.join(temporaryRoot, 'runlog', 'runlog.sqlite'),
    MAINSPRING_RUNLOG_WORKSPACE_ROOT: path.join(temporaryRoot, 'runlog', 'workspaces'),
    MAINSPRING_GATEWAY_MANAGED_SECRET_KEY: path.join(temporaryRoot, 'managed-secret.key'),
    MAINSPRING_GATEWAY_MANAGED_SECRET_STORE: 'file',
    MAINSPRING_GATEWAY_CRON_ENABLED: '0',
  }

  start(process.execPath, ['dist/gateway/server/dev.js'], gatewayEnvironment)
  await waitFor(`${gatewayUrl}/health`)
  seedConsoleMemory(path.join(temporaryRoot, 'workspaces', 'northline'))
  startPnpm(
    ['--filter', '@mainspring/console', 'exec', 'vite', '--host', '127.0.0.1', '--port', String(consolePort)],
    process.env,
  )
  await waitFor(consoleUrl)

  const result = await new Promise((resolve, reject) => {
    const test = start(process.execPath, [playwrightCli, 'test', '--config', 'e2e/playwright.config.ts'], {
      ...process.env,
      MAINSPRING_E2E_CONSOLE_URL: consoleUrl,
      MAINSPRING_E2E_GATEWAY_URL: gatewayUrl,
      MAINSPRING_E2E_ARTIFACTS_DIR: path.join(temporaryRoot, 'playwright-artifacts'),
    })
    test.once('error', reject)
    test.once('exit', (code) => resolve(code ?? 1))
  })
  if (result !== 0) process.exitCode = result
}

try {
  await main()
} finally {
  await stopChildren()
  fs.rmSync(temporaryRoot, { recursive: true, force: true })
}
