#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const failures = []

function filePath(file) {
  return path.join(root, file)
}

function read(file) {
  return fs.readFileSync(filePath(file), 'utf8')
}

function requireFile(file) {
  if (!fs.existsSync(filePath(file))) failures.push(`missing required file: ${file}`)
}

function walkFiles(dir, predicate, out = []) {
  for (const entry of fs.readdirSync(filePath(dir), { withFileTypes: true })) {
    const relativePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(relativePath, predicate, out)
    } else if (entry.isFile() && predicate(relativePath)) {
      out.push(filePath(relativePath))
    }
  }
  return out
}

for (const file of [
  'README.md',
  'LICENSE',
  'CONTRIBUTING.md',
  'SECURITY.md',
  '.env.example',
  'src/index.ts',
  'src/runner/RuntimeKernel.ts',
  'src/tools/ToolRegistry.ts',
  'src/tools/FileTools.ts',
  'src/tools/ShellTool.ts',
  'src/providers/HttpProviderClient.ts',
  'src/policy/PolicyGuard.ts',
  'src/mailbox/SqliteMailbox.ts',
  'src/protocol/index.ts',
  'src/protocol/node.ts',
  'src/control/channel.ts',
  'src/sdk/Mainspring.ts',
  'docker/runtime.Dockerfile',
  'docker/compose.local.yml',
]) {
  requireFile(file)
}

const packageJson = JSON.parse(read('package.json'))
if (packageJson.name !== 'mainspring') {
  failures.push('package must be published as mainspring')
}
for (const dependency of ['better-sqlite3', 'ws', 'zod']) {
  if (!packageJson.dependencies?.[dependency]) {
    failures.push(`missing runtime dependency: ${dependency}`)
  }
}
for (const forbidden of ['@mainspring/mainspring-contracts', '@mainspring/contracts']) {
  if (JSON.stringify(packageJson).includes(forbidden)) {
    failures.push(`package metadata still depends on Mainspring workspace package: ${forbidden}`)
  }
}

const dockerfile = read('docker/runtime.Dockerfile')
for (const [needle, message] of [
  ['USER 10001:10001', 'runtime image must run as non-root uid/gid 10001'],
  ['VOLUME ["/runtime", "/workspaces", "/sessions", "/artifacts"]', 'runtime image must declare runtime volumes'],
]) {
  if (!dockerfile.includes(needle)) failures.push(message)
}
for (const [needle, message] of [
  ['/var/run/docker.sock', 'runtime image must not mount Docker socket'],
  ['--privileged', 'runtime image must not use privileged mode'],
  ['USER root', 'runtime image must not run as root'],
  ['EXPOSE ', 'runtime image should not expose a public runtime port'],
]) {
  if (dockerfile.includes(needle)) failures.push(message)
}

for (const requiredEnv of [
  'MAINSPRING_RUNTIME_ROOT',
  'MAINSPRING_SESSIONS_ROOT',
  'MAINSPRING_WORKSPACE_ROOT',
  'MAINSPRING_POLL_INTERVAL_MS',
]) {
  if (!dockerfile.includes(requiredEnv)) failures.push(`runtime image missing env: ${requiredEnv}`)
}

function collectYamlBlockListItems(text, blockName) {
  const items = []
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(new RegExp(`^(\\s*)${blockName}:\\s*(?:#.*)?$`))
    if (!match) continue
    const baseIndent = match[1].length
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next]
      if (!line.trim() || line.trimStart().startsWith('#')) continue
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0
      if (indent <= baseIndent) break
      const item = line.match(/^\s*-\s*(.+?)\s*(?:#.*)?$/)
      if (item) items.push(item[1])
    }
  }
  return items
}

function collectYamlBlockMapKeys(text, blockName) {
  const keys = []
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(new RegExp(`^(\\s*)${blockName}:\\s*(?:#.*)?$`))
    if (!match) continue
    const baseIndent = match[1].length
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next]
      if (!line.trim() || line.trimStart().startsWith('#')) continue
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0
      if (indent <= baseIndent) break
      const key = line.match(/^\s*([A-Za-z0-9_.-]+):/)
      if (key) keys.push(key[1])
      if (/^\s*-\s*/.test(line)) {
        failures.push(`${blockName} must use explicit key/value entries, not list entries`)
      }
    }
  }
  return keys
}

const compose = read('docker/compose.local.yml')
if (/^\s*ports\s*:/m.test(compose)) {
  failures.push('docker compose must not publish runtime ports')
}
for (const [needle, message] of [
  ['/var/run/docker.sock', 'docker compose must not mount Docker socket'],
  ['--privileged', 'docker compose must not use privileged flags'],
]) {
  if (compose.includes(needle)) failures.push(message)
}
if (/^\s*privileged\s*:\s*true\b/im.test(compose)) {
  failures.push('docker compose must not enable privileged mode')
}

const expectedComposeEnv = new Set([
  'MAINSPRING_RUNTIME_ROOT',
  'MAINSPRING_SESSIONS_ROOT',
  'MAINSPRING_WORKSPACE_ROOT',
  'MAINSPRING_POLL_INTERVAL_MS',
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
])
for (const envKey of collectYamlBlockMapKeys(compose, 'environment')) {
  if (!expectedComposeEnv.has(envKey)) {
    failures.push(`docker compose contains unexpected environment variable: ${envKey}`)
  }
}
for (const envKey of expectedComposeEnv) {
  if (!compose.includes(`${envKey}:`)) {
    failures.push(`docker compose missing expected environment variable: ${envKey}`)
  }
}

const expectedComposeVolumes = new Set([
  'mainspring-runtime:/runtime',
  'mainspring-sessions:/sessions',
  'mainspring-workspaces:/workspaces',
  'mainspring-artifacts:/artifacts',
])
const composeVolumeItems = collectYamlBlockListItems(compose, 'volumes').filter((item) =>
  item.includes(':'),
)
for (const item of composeVolumeItems) {
  if (!expectedComposeVolumes.has(item)) {
    failures.push(`docker compose contains unexpected mount: ${item}`)
  }
  if (/^(?:[A-Za-z]:\\|\/|\.{1,2}\/|~)/.test(item)) {
    failures.push(`docker compose must not bind mount host paths: ${item}`)
  }
}
for (const item of expectedComposeVolumes) {
  if (!composeVolumeItems.includes(item)) {
    failures.push(`docker compose missing expected mount: ${item}`)
  }
}

const sourceFiles = walkFiles('src', (file) => file.endsWith('.ts'))

for (const sourceFile of sourceFiles) {
  const text = fs.readFileSync(sourceFile, 'utf8')
  for (const needle of ['@mainspring/mainspring-contracts', '@mainspring/contracts']) {
    if (text.includes(needle)) {
      failures.push(`${path.relative(root, sourceFile)} still imports ${needle}`)
    }
  }
}

const forbiddenProjectNames = [
  ['c', 'lawrunner'].join(''),
  ['c', 'law-runner'].join(''),
  ['C', 'lawRunner'].join(''),
  ['C', 'law Runner'].join(''),
  ['c', 'law', '-', 'h', 'arness'].join(''),
  ['C', 'law', '-', 'H', 'arness'].join(''),
  ['C', 'lawHarness'].join(''),
  ['C', 'LAW_HARNESS'].join(''),
  ['C', 'LAWRUNNER'].join(''),
  ['c', 'law', ' ', 'h', 'arness'].join(''),
  ['C', 'law', ' ', 'H', 'arness'].join(''),
  ['c', 'law', '_', 'h', 'arness'].join(''),
  ['C', 'lawComputer'].join(''),
  ['C', 'LAW_COMPUTER'].join(''),
]

const publicTextFiles = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  '.env.example',
  'package.json',
  ...walkFiles('docs', (file) => file.endsWith('.md')).map((file) => path.relative(root, file)),
  ...walkFiles('examples', (file) => /\.(md|ts|js|json)$/i.test(file)).map((file) =>
    path.relative(root, file),
  ),
  ...walkFiles('scripts', (file) => file.endsWith('.mjs')).map((file) => path.relative(root, file)),
  ...sourceFiles.map((file) => path.relative(root, file)),
]

for (const file of publicTextFiles) {
  const text = read(file)
  const lower = text.toLowerCase()
  for (const forbidden of forbiddenProjectNames) {
    if (lower.includes(forbidden.toLowerCase())) {
      failures.push(`${file} contains a former project name`)
    }
  }
}

const runtimeText = [
  read('src/runner/RuntimeKernel.ts'),
  read('src/tools/ToolRegistry.ts'),
  read('src/policy/PolicyGuard.ts'),
  read('src/tools/FileTools.ts'),
  read('src/tools/ShellTool.ts'),
].join('\n')
for (const needle of ['approval_required', 'workspaceRoot', 'sanitizeRuntimeResponse']) {
  if (!runtimeText.includes(needle)) failures.push(`runtime kernel missing expected safety concept: ${needle}`)
}

if (failures.length > 0) {
  console.error('Mainspring security guard failed.')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Mainspring security guard passed.')
