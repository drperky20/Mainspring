#!/usr/bin/env node
import fs from 'node:fs'

const failures = []
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const readme = fs.readFileSync('README.md', 'utf8')
const architecture = fs.readFileSync('docs/architecture.md', 'utf8')
const currentState = fs.readFileSync('docs/current-state.md', 'utf8')

requireScript('security:truth')
requireReleaseCommand('pnpm security:truth')
requireVerifyCommand('pnpm security:truth')

for (const [file, text] of [
  ['README.md', readme],
  ['docs/architecture.md', architecture],
  ['docs/current-state.md', currentState],
]) {
  requireText(file, text, 'RunLog')
  requireText(file, text, 'RuntimeKernel')
  requireText(file, text, 'compat')
}

if (!readme.includes('RunLog Fabric')) {
  failures.push('README.md must name RunLog Fabric as the canonical runtime path')
}
if (!readme.includes('legacy mailbox')) {
  failures.push('README.md must label the mailbox path as legacy compatibility or migration')
}

if (failures.length > 0) {
  console.error('Mainspring release claim check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MAINSPRING_RELEASE_CLAIMS_CHECK_OK')

function requireScript(name) {
  if (!packageJson.scripts?.[name]) failures.push(`package.json missing script "${name}"`)
}

function requireReleaseCommand(command) {
  if (!(packageJson.scripts?.['release:check'] ?? '').includes(command)) {
    failures.push(`release:check must include "${command}"`)
  }
}

function requireVerifyCommand(command) {
  if (!(packageJson.scripts?.verify ?? '').includes(command)) {
    failures.push(`verify must include "${command}"`)
  }
}

function requireText(file, text, expected) {
  if (!text.includes(expected)) failures.push(`${file} must include "${expected}"`)
}
