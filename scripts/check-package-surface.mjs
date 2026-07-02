#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const expectedExports = {
  '.': {
    import: './dist/index.js',
    types: './dist/index.d.ts',
    symbols: [
      'MAINSPRING_RUNTIME_IDENTITY',
      'createMainspring',
      'EchoProvider',
      'MockProvider',
      'RuntimeKernel',
      'ToolRegistry',
      'RuntimePolicyGuard',
      'createLocalMainspringGateway',
    ],
  },
  './sdk': {
    import: './dist/sdk/index.js',
    types: './dist/sdk/index.d.ts',
    symbols: ['Mainspring', 'createMainspring'],
  },
  './contracts': {
    import: './dist/contracts/index.js',
    types: './dist/contracts/index.d.ts',
    symbols: [],
  },
  './core': {
    import: './dist/core/index.js',
    types: './dist/core/index.d.ts',
    symbols: ['RunLogKernel', 'RunLogExecutor', 'RunLogScheduler', 'SingleProviderRouter'],
  },
  './adapters': {
    import: './dist/adapters/index.js',
    types: './dist/adapters/index.d.ts',
    symbols: ['SqliteRunLogStore', 'LocalBlobStore'],
  },
  './adapters/sqlite': {
    import: './dist/adapters/sqlite/index.js',
    types: './dist/adapters/sqlite/index.d.ts',
    symbols: ['SqliteRunLogStore', 'createSqliteRunLogStore'],
  },
  './adapters/local-blob': {
    import: './dist/adapters/local-blob/index.js',
    types: './dist/adapters/local-blob/index.d.ts',
    symbols: ['LocalBlobStore'],
  },
  './capabilities': {
    import: './dist/capabilities/index.js',
    types: './dist/capabilities/index.d.ts',
    symbols: ['LocalWorkspaceAdapter'],
  },
  './hosts/runlog': {
    import: './dist/hosts/runlog/index.js',
    types: './dist/hosts/runlog/index.d.ts',
    symbols: ['projectRunLogRun'],
  },
  './compat': {
    import: './dist/compat/index.js',
    types: './dist/compat/index.d.ts',
    symbols: ['RunLogKernel', 'SingleProviderRouter'],
  },
  './gateway': {
    import: './dist/gateway/index.js',
    types: './dist/gateway/index.d.ts',
    symbols: [
      'LocalMainspringGateway',
      'createLocalMainspringGateway',
      'createSqliteLocalGatewayAppStateStore',
      'createLocalGatewayServer',
    ],
  },
  './gateway/browser-safety': {
    import: './dist/gateway/browserSafety.js',
    types: './dist/gateway/browserSafety.d.ts',
    symbols: [
      'browserUnsafeGatewayTextMarkers',
      'browserUnsafeBrowserAccessQueryKeys',
      'browserUnsafeProviderCredentialMarkerPattern',
      'browserUnsafeProviderCredentialMarkers',
      'containsBrowserUnsafeGatewayText',
      'isBrowserUnsafeBrowserAccessQueryKey',
      'redactBrowserUnsafeGatewayText',
      'redactBrowserUnsafeProviderCredentialMarkers',
    ],
  },
  './gateway/server': {
    import: './dist/gateway/server/index.js',
    types: './dist/gateway/server/index.d.ts',
    symbols: ['LocalGatewayHttpServer', 'createLocalGatewayServer'],
  },
  './protocol': {
    import: './dist/protocol/index.js',
    types: './dist/protocol/index.d.ts',
    symbols: ['MainspringEventSchema', 'createMainspringRuntimeId'],
  },
  './protocol/node': {
    import: './dist/protocol/node.js',
    types: './dist/protocol/node.d.ts',
    symbols: ['assertPathContained', 'resolveContainedSessionMailboxPaths'],
  },
  './control': {
    import: './dist/control/index.js',
    types: './dist/control/index.d.ts',
    symbols: ['TurnEventSchema', 'bridgeRuntimeEventToTurnEvents'],
  },
}

const expectedFiles = [
  'dist',
  'docker',
  'docs/README.md',
  'docs/index.md',
  'docs/getting-started.md',
  'docs/architecture.md',
  'docs/runtime-loop.md',
  'docs/sdk.md',
  'docs/security.md',
  'docs/operations.md',
  'docs/deployment.md',
  'docs/examples.md',
  'docs/skills-security.md',
  'docs/roadmap.md',
  'docs/documentation-guide.md',
  'docs/current-state.md',
  'docs/features',
  'docs/adr',
  'examples',
  'assets/brand',
  'README.md',
  'LICENSE',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'CHANGELOG.md',
  'RELEASE.md',
]

const failures = []

if (packageJson.name !== 'mainspring') failures.push('package name must be mainspring')
if (packageJson.main !== expectedExports['.'].import.slice(2)) failures.push('package main must match root export import')
if (packageJson.types !== expectedExports['.'].types.slice(2)) failures.push('package types must match root export types')

assertExactKeys('exports', packageJson.exports, expectedExports)
assertExactArray('files', packageJson.files, expectedFiles)
assertNoPackageMetadataPlaceholders()

for (const [subpath, expected] of Object.entries(expectedExports)) {
  const actual = packageJson.exports?.[subpath]
  if (!actual) continue
  if (actual.import !== expected.import) failures.push(`${subpath} import expected ${expected.import}, got ${actual.import}`)
  if (actual.types !== expected.types) failures.push(`${subpath} types expected ${expected.types}, got ${actual.types}`)
  assertFile(`${subpath} import`, actual.import)
  assertFile(`${subpath} types`, actual.types)
}

assertPackageIgnore()
assertRuntimeBin()
assertPackagedMarkdownLinks()
assertPackagedMarkdownHasNoPlaceholderTokens()
await assertImportableExports()

if (failures.length > 0) {
  console.error('Mainspring package surface check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MAINSPRING_PACKAGE_SURFACE_CHECK_OK')

function assertExactKeys(label, actual, expected) {
  const actualKeys = Object.keys(actual ?? {}).sort()
  const expectedKeys = Object.keys(expected).sort()
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    failures.push(`${label} keys expected ${expectedKeys.join(', ')}, got ${actualKeys.join(', ')}`)
  }
}

function assertExactArray(label, actual, expected) {
  if (!Array.isArray(actual)) {
    failures.push(`${label} must be an array`)
    return
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${label} expected ${expected.join(', ')}, got ${actual.join(', ')}`)
  }
  for (const forbidden of ['src', 'apps', '.reference', '.mainspring', 'node_modules']) {
    if (actual.some((entry) => entry === forbidden || entry.startsWith(`${forbidden}/`))) {
      failures.push(`${label} must not include ${forbidden}`)
    }
  }
}

function assertNoPackageMetadataPlaceholders() {
  const packageText = JSON.stringify(packageJson)
  for (const placeholder of ['YOUR_ORG', 'TODO', 'TBD', 'example.com']) {
    if (packageText.includes(placeholder)) {
      failures.push(`package metadata must not contain placeholder token ${placeholder}`)
    }
  }
}

function assertFile(label, relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    failures.push(`${label} path is missing`)
    return
  }
  const absolutePath = path.resolve(root, relativePath)
  if (!fs.existsSync(absolutePath)) failures.push(`${label} file is missing: ${relativePath}`)
}

function assertPackageIgnore() {
  const npmIgnorePath = path.join(root, '.npmignore')
  if (!fs.existsSync(npmIgnorePath)) {
    failures.push('.npmignore is missing')
    return
  }
  const text = fs.readFileSync(npmIgnorePath, 'utf8')
  for (const required of [
    '.reference/',
    'docs/goal-digest.md',
    '*.tgz',
    'apps/desktop/release/',
    '.mainspring/',
    '.tmp-managed-secret-crypto/',
  ]) {
    if (!text.includes(required)) failures.push(`.npmignore must include ${required}`)
  }
}

function assertRuntimeBin() {
  const runtimeBin = packageJson.bin?.['mainspring-runtime']
  if (runtimeBin !== 'dist/runner/main.js') {
    failures.push('mainspring-runtime bin must point at dist/runner/main.js')
    return
  }
  const binPath = path.join(root, runtimeBin)
  assertFile('mainspring-runtime bin', runtimeBin)
  if (fs.existsSync(binPath)) {
    const firstLine = fs.readFileSync(binPath, 'utf8').split(/\r?\n/, 1)[0]
    if (firstLine !== '#!/usr/bin/env node') failures.push('mainspring-runtime bin must preserve node shebang')
  }
}

function assertPackagedMarkdownLinks() {
  const markdownSources = listPackagedMarkdownSources()
  for (const source of markdownSources) {
    const text = fs.readFileSync(path.join(root, source), 'utf8')
    for (const link of collectMarkdownLinks(text)) {
      const target = normalizeMarkdownLinkTarget(link)
      if (!target || isExternalLink(target) || target.startsWith('#')) continue

      const targetPath = path.normalize(path.join(path.dirname(source), target)).replace(/\\/g, '/')
      if (targetPath.startsWith('../') || path.isAbsolute(targetPath)) {
        failures.push(`${source} links outside the package tree: ${link}`)
        continue
      }
      if (!fs.existsSync(path.join(root, targetPath))) {
        failures.push(`${source} links to missing local file: ${link}`)
        continue
      }
      if (!isPackagedPath(targetPath)) {
        failures.push(`${source} links to local file excluded from the npm package: ${link}`)
      }
    }
  }
}

function assertPackagedMarkdownHasNoPlaceholderTokens() {
  for (const source of listPackagedMarkdownSources()) {
    const text = fs.readFileSync(path.join(root, source), 'utf8')
    for (const placeholder of ['YOUR_ORG', 'https://github.com/YOUR_ORG', 'TODO', 'TBD', 'example.com']) {
      if (text.includes(placeholder)) {
        failures.push(`${source} must not contain placeholder token ${placeholder}`)
      }
    }
  }
}

function listPackagedMarkdownSources() {
  const sources = []
  for (const entry of packageJson.files ?? []) {
    const absoluteEntry = path.join(root, entry)
    if (!fs.existsSync(absoluteEntry)) continue
    const stat = fs.statSync(absoluteEntry)
    if (stat.isFile() && entry.endsWith('.md')) {
      sources.push(entry)
      continue
    }
    if (stat.isDirectory()) {
      for (const file of walkFiles(absoluteEntry)) {
        const relativeFile = path.relative(root, file).replace(/\\/g, '/')
        if (relativeFile.endsWith('.md')) sources.push(relativeFile)
      }
    }
  }
  return sources.sort()
}

function walkFiles(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absoluteEntry = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(absoluteEntry))
    } else if (entry.isFile()) {
      files.push(absoluteEntry)
    }
  }
  return files
}

function collectMarkdownLinks(text) {
  const links = []
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g
  let match
  while ((match = linkPattern.exec(text))) links.push(match[1].trim())
  return links
}

function normalizeMarkdownLinkTarget(link) {
  const withoutTitle = link.startsWith('<') ? link.slice(1, link.indexOf('>')) : link.split(/\s+/, 1)[0]
  const withoutFragment = withoutTitle.split('#', 1)[0]
  const withoutQuery = withoutFragment.split('?', 1)[0]
  if (!withoutQuery) return ''
  try {
    return decodeURIComponent(withoutQuery)
  } catch {
    return withoutQuery
  }
}

function isExternalLink(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')
}

function isPackagedPath(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/')
  for (const entry of packageJson.files ?? []) {
    const entryPath = entry.replace(/\\/g, '/')
    if (normalized === entryPath) return true
    const absoluteEntry = path.join(root, entryPath)
    if (fs.existsSync(absoluteEntry) && fs.statSync(absoluteEntry).isDirectory() && normalized.startsWith(`${entryPath}/`)) {
      return true
    }
  }
  return false
}

async function assertImportableExports() {
  for (const [subpath, expected] of Object.entries(expectedExports)) {
    const specifier = subpath === '.' ? 'mainspring' : `mainspring/${subpath.slice(2)}`
    let imported
    try {
      imported = await import(specifier)
    } catch (error) {
      failures.push(`${specifier} import failed: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    for (const symbol of expected.symbols) {
      if (!(symbol in imported)) failures.push(`${specifier} is missing export ${symbol}`)
    }
  }
}
