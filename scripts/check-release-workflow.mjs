#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const workflowPath = '.github/workflows/release-check.yml'
const ciWorkflowPath = '.github/workflows/ci.yml'
const gatewaySystemsPath = 'scripts/check-gateway-systems.mjs'
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const workflow = readFileSync(workflowPath, 'utf8')
const ciWorkflow = readFileSync(ciWorkflowPath, 'utf8')
const gatewaySystems = readFileSync(gatewaySystemsPath, 'utf8')

const failures = []

requirePackageScript('verify')
requirePackageScript('gateway:systems:check')
requirePackageScript('execution-backends:check')
requirePackageScript('gateway:dev:help')
requirePackageScript('console:browser-safety:check')
requirePackageScript('docs:check')
requirePackageScript('doctor')
requirePackageScript('security:truth')
requirePackageScript('examples:smoke')
requirePackageScript('agentic:check')
requirePackageScript('desktop:systems:check')
requirePackageScript('desktop:pack')
requirePackageScript('desktop:packaging:check')
requirePackageScript('optional-verifiers:check')
requirePackageScript('release:workflow:check')
requirePackageScript('package:check')
requirePackageScript('package:pack:check')
requirePackageScriptCommand('repo:doctor', 'pnpm run doctor')
requirePackageScriptCommand('package:pack:check', 'node scripts/check-pnpm-pack.mjs')

requireReleaseCheckCommand('pnpm verify')
requireReleaseCheckCommand('pnpm security:truth')
requireReleaseCheckCommand('pnpm gateway:systems:check')
requireReleaseCheckCommand('pnpm gateway:dev:help')
requireReleaseCheckCommand('pnpm examples:smoke')
requireReleaseCheckCommand('pnpm agentic:check')
requireReleaseCheckCommand('pnpm desktop:systems:check')
requireReleaseCheckCommand('pnpm release:workflow:check')
requireReleaseCheckCommand('pnpm optional-verifiers:check')
requireReleaseCheckCommand('pnpm package:check')
requireReleaseCheckCommand('pnpm package:pack:check')
requireReleaseCheckCommand('npm pack --dry-run')
requireReleaseCheckCommand('node scripts/check-docker-compose-config.mjs')
requireVerifyCommand('pnpm run doctor')
requireVerifyCommand('pnpm docs:check')
requireVerifyCommand('pnpm security:truth')
requireVerifyCommand('pnpm console:browser-safety:check')

const jobs = {
  'release-check': requireJob('release-check'),
  'desktop-windows': requireJob('desktop-windows'),
  'desktop-macos': requireJob('desktop-macos'),
}

requireWorkflowTrigger('pull_request:')
requireWorkflowTrigger('push:')
requireWorkflowTrigger('branches:')
requireWorkflowTrigger('- main')
requireWorkflowTrigger('workflow_dispatch:')
requireWorkflowText(workflowPath, workflow, 'permissions:')
requireWorkflowText(workflowPath, workflow, 'contents: read')
requireWorkflowText(workflowPath, workflow, 'concurrency:')
requireWorkflowText(workflowPath, workflow, 'group: release-check-${{ github.workflow }}-${{ github.ref }}')
requireWorkflowText(workflowPath, workflow, 'cancel-in-progress: true')

for (const [jobName, job] of Object.entries(jobs)) {
  if (!job) continue
  requireJobCommand(jobName, job, 'uses: actions/checkout@v7')
  requireJobCommand(jobName, job, 'uses: actions/setup-node@v6')
  requireJobCommand(jobName, job, 'node-version: 22.12.0')
  requireJobCommand(jobName, job, 'run: corepack enable')
  requireJobCommand(jobName, job, 'run: corepack prepare pnpm@9.15.4 --activate')
  requireJobCommand(jobName, job, 'run: pnpm install --frozen-lockfile')
}

requireJobCommand('release-check', jobs['release-check'], 'runs-on: ubuntu-latest')
requireJobCommand('release-check', jobs['release-check'], 'timeout-minutes: 35')
requireJobCommand('release-check', jobs['release-check'], 'run: pnpm release:check')

requireGatewaySystemsCheck('scripts/check-execution-backends.mjs')

requireJobCommand('desktop-windows', jobs['desktop-windows'], 'runs-on: windows-latest')
requireJobCommand('desktop-windows', jobs['desktop-windows'], 'timeout-minutes: 35')
requireJobCommand('desktop-windows', jobs['desktop-windows'], 'run: pnpm run desktop:typecheck')
requireJobCommand('desktop-windows', jobs['desktop-windows'], 'run: pnpm run desktop:build')
requireJobCommand('desktop-windows', jobs['desktop-windows'], 'run: pnpm run desktop:pack')
requireJobCommand('desktop-windows', jobs['desktop-windows'], 'name: mainspring-desktop-windows')
requireJobCommand('desktop-windows', jobs['desktop-windows'], 'apps/desktop/release/Mainspring Setup 0.1.0.exe')

requireJobCommand('desktop-macos', jobs['desktop-macos'], 'runs-on: macos-latest')
requireJobCommand('desktop-macos', jobs['desktop-macos'], 'timeout-minutes: 35')
requireJobCommand('desktop-macos', jobs['desktop-macos'], 'run: pnpm verify')
requireJobCommand('desktop-macos', jobs['desktop-macos'], 'run: pnpm run desktop:typecheck')
requireJobCommand('desktop-macos', jobs['desktop-macos'], 'run: pnpm run desktop:build')

requireCiWorkflow()
requireNoLinuxDesktopPackaging()
requireUnsupportedPnpmPackCommandIsAbsent()

for (const line of workflow.split(/\r?\n/)) {
  if (line.includes('run: pnpm install') && !line.includes('--frozen-lockfile')) {
    failures.push(`pnpm install without --frozen-lockfile: ${line.trim()}`)
  }
}

for (const line of ciWorkflow.split(/\r?\n/)) {
  if (line.includes('run: pnpm install') && !line.includes('--frozen-lockfile')) {
    failures.push(`pnpm install without --frozen-lockfile in ${ciWorkflowPath}: ${line.trim()}`)
  }
}

if (failures.length > 0) {
  console.error('Mainspring release workflow check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MAINSPRING_RELEASE_WORKFLOW_CHECK_OK')

function requirePackageScript(name) {
  if (!packageJson.scripts?.[name]) failures.push(`package.json is missing script "${name}"`)
}

function requirePackageScriptCommand(name, command) {
  const script = packageJson.scripts?.[name]
  if (script !== command) {
    failures.push(`package.json script "${name}" must be "${command}", got "${script ?? ''}"`)
  }
}

function requireReleaseCheckCommand(command) {
  const releaseCheck = packageJson.scripts?.['release:check'] ?? ''
  if (!releaseCheck.includes(command)) {
    failures.push(`package.json release:check does not include "${command}"`)
  }
}

function requireVerifyCommand(command) {
  const verify = packageJson.scripts?.verify ?? ''
  if (!verify.includes(command)) {
    failures.push(`package.json verify does not include "${command}"`)
  }
}

function requireJob(name) {
  const lines = workflow.split(/\r?\n/)
  const start = lines.findIndex((line) => line === `  ${name}:`)
  if (start === -1) {
    failures.push(`${workflowPath} is missing job "${name}"`)
    return ''
  }

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
      end = index
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

function requireWorkflowTrigger(trigger) {
  requireWorkflowText(workflowPath, workflow, trigger)
}

function requireWorkflowText(path, text, expected) {
  if (!text.includes(expected)) failures.push(`${path} does not include "${expected}"`)
}

function requireJobCommand(jobName, job, command) {
  if (!job) return
  if (!job.includes(command)) failures.push(`${workflowPath} job "${jobName}" does not include "${command}"`)
}

function requireGatewaySystemsCheck(scriptPath) {
  if (!gatewaySystems.includes(scriptPath)) {
    failures.push(`${gatewaySystemsPath} does not include "${scriptPath}"`)
  }
}

function requireCiWorkflow() {
  requireWorkflowText(ciWorkflowPath, ciWorkflow, 'push:')
  requireWorkflowText(ciWorkflowPath, ciWorkflow, 'pull_request:')
  requireWorkflowText(ciWorkflowPath, ciWorkflow, 'permissions:')
  requireWorkflowText(ciWorkflowPath, ciWorkflow, 'contents: read')
  requireWorkflowText(ciWorkflowPath, ciWorkflow, 'concurrency:')
  requireWorkflowText(ciWorkflowPath, ciWorkflow, 'group: ci-${{ github.workflow }}-${{ github.ref }}')
  requireWorkflowText(ciWorkflowPath, ciWorkflow, 'cancel-in-progress: true')

  const ciJob = requireWorkflowJob(ciWorkflowPath, ciWorkflow, 'verify')
  requireWorkflowJobCommand(ciWorkflowPath, 'verify', ciJob, 'runs-on: ${{ matrix.os }}')
  requireWorkflowJobCommand(ciWorkflowPath, 'verify', ciJob, 'timeout-minutes: 30')
  requireWorkflowJobCommand(ciWorkflowPath, 'verify', ciJob, 'fail-fast: false')
  requireWorkflowJobCommand(ciWorkflowPath, 'verify', ciJob, 'os: [ubuntu-latest, macos-latest, windows-latest]')
  requireWorkflowJobCommand(ciWorkflowPath, 'verify', ciJob, 'uses: actions/checkout@v7')
  requireWorkflowJobCommand(ciWorkflowPath, 'verify', ciJob, 'uses: actions/setup-node@v6')
  requireWorkflowJobCommand(ciWorkflowPath, 'verify', ciJob, 'node-version: 22.12.0')
  requireWorkflowJobCommand(ciWorkflowPath, 'verify', ciJob, 'run: corepack enable')
  requireWorkflowJobCommand(ciWorkflowPath, 'verify', ciJob, 'run: corepack prepare pnpm@9.15.4 --activate')
  requireWorkflowJobCommand(ciWorkflowPath, 'verify', ciJob, 'run: pnpm install --frozen-lockfile')
  requireWorkflowJobCommand(ciWorkflowPath, 'verify', ciJob, 'name: Prepare Windows managed-secret verification')
  requireWorkflowJobCommand(ciWorkflowPath, 'verify', ciJob, "Import-Module Microsoft.PowerShell.Security -ErrorAction Stop")
  requireWorkflowJobCommand(ciWorkflowPath, 'verify', ciJob, 'MAINSPRING_POWERSHELL_EXECUTABLE=pwsh')
  requireWorkflowJobCommand(ciWorkflowPath, 'verify', ciJob, 'run: pnpm verify')

  if (ciWorkflow.includes('  source-matrix:')) {
    failures.push(`${ciWorkflowPath} must not duplicate the full source checks beside the verify matrix`)
  }

  const browserJob = requireWorkflowJob(ciWorkflowPath, ciWorkflow, 'browser-e2e')
  requireWorkflowJobCommand(ciWorkflowPath, 'browser-e2e', browserJob, 'runs-on: ubuntu-latest')
  requireWorkflowJobCommand(ciWorkflowPath, 'browser-e2e', browserJob, 'timeout-minutes: 25')
  requireWorkflowJobCommand(ciWorkflowPath, 'browser-e2e', browserJob, 'uses: actions/checkout@v7')
  requireWorkflowJobCommand(ciWorkflowPath, 'browser-e2e', browserJob, 'uses: actions/setup-node@v6')
  requireWorkflowJobCommand(ciWorkflowPath, 'browser-e2e', browserJob, 'node-version: 22.12.0')
  requireWorkflowJobCommand(ciWorkflowPath, 'browser-e2e', browserJob, 'run: corepack enable')
  requireWorkflowJobCommand(ciWorkflowPath, 'browser-e2e', browserJob, 'run: corepack prepare pnpm@9.15.4 --activate')
  requireWorkflowJobCommand(ciWorkflowPath, 'browser-e2e', browserJob, 'run: pnpm install --frozen-lockfile')
  requireWorkflowJobCommand(ciWorkflowPath, 'browser-e2e', browserJob, 'run: pnpm exec playwright install --with-deps chromium')
  requireWorkflowJobCommand(ciWorkflowPath, 'browser-e2e', browserJob, 'run: pnpm console:e2e')
  requireWorkflowJobCommand(ciWorkflowPath, 'browser-e2e', browserJob, 'MAINSPRING_E2E_ARTIFACTS_DIR: output/playwright/ci')
  requireWorkflowJobCommand(ciWorkflowPath, 'browser-e2e', browserJob, 'if: failure()')
  requireWorkflowJobCommand(ciWorkflowPath, 'browser-e2e', browserJob, 'uses: actions/upload-artifact@v7')
}

function requireNoLinuxDesktopPackaging() {
  const workflowLines = workflow.split(/\r?\n/)
  let currentJob = ''
  for (const line of workflowLines) {
    const jobMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*$/)
    if (jobMatch) currentJob = jobMatch[1]
    if (line.includes('pnpm run desktop:pack') && currentJob !== 'desktop-windows') {
      failures.push(`${workflowPath} runs desktop packaging outside the desktop-windows job`)
    }
    if (/(AppImage|appimage|\.deb\b|rpm\b|snap\b|flatpak\b)/.test(line)) {
      failures.push(`${workflowPath} must not reference Linux desktop package artifacts: ${line.trim()}`)
    }
  }
}

function requireUnsupportedPnpmPackCommandIsAbsent() {
  const unsupportedCommand = ['pnpm', 'pack', '--dry-run'].join(' ')
  const releaseCheck = packageJson.scripts?.['release:check'] ?? ''
  if (releaseCheck.includes(unsupportedCommand)) {
    failures.push(`package.json release:check must not include unsupported command "${unsupportedCommand}"`)
  }
  if (workflow.includes(unsupportedCommand)) {
    failures.push(`${workflowPath} must not include unsupported command "${unsupportedCommand}"`)
  }
}

function requireWorkflowJob(path, text, name) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => line === `  ${name}:`)
  if (start === -1) {
    failures.push(`${path} is missing job "${name}"`)
    return ''
  }

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
      end = index
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

function requireWorkflowJobCommand(path, jobName, job, command) {
  if (!job) return
  if (!job.includes(command)) failures.push(`${path} job "${jobName}" does not include "${command}"`)
}
