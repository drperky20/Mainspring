#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

const scans = [
  {
    name: 'secret-like-material',
    pattern:
      /sk-or-|OPENROUTER_API_KEY=sk|api_key|secretRef.*sk-|BEGIN PRIVATE KEY|ghp_|npm_/,
  },
  {
    name: 'credential-storage-or-hash',
    pattern: /localStorage.*(?:key|provider|secret)|passwordHash/,
  },
  {
    name: 'unsafe-renderer-or-shell-ipc',
    pattern:
      /shell\.exec|ipcRenderer\.invoke\(['"]shell|nodeIntegration:\s*true|contextIsolation:\s*false/,
  },
]

const ignoredDirectoryNames = new Set([
  '.git',
  '.pnpm-store',
  '.reference',
  '.tmp-managed-secret-crypto',
  'cache',
  'dist',
  'node_modules',
  'release',
  'tmp',
])

const scannedExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.yml',
  '.yaml',
])

const failures = []
const allowed = []

for (const filePath of walk(root)) {
  const relativePath = slash(path.relative(root, filePath))
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const scan of scans) {
      if (!scan.pattern.test(line)) continue
      const hit = {
        scan: scan.name,
        path: relativePath,
        line: index + 1,
        text: line.trim(),
      }
      if (isAllowedHit(hit)) {
        allowed.push(hit)
      } else {
        failures.push(hit)
      }
    }
  })
}

if (failures.length > 0) {
  console.error('Mainspring sensitive-pattern scan failed.')
  for (const hit of failures) {
    console.error(`- ${hit.scan}: ${hit.path}:${hit.line}: ${hit.text}`)
  }
  process.exit(1)
}

console.log(
  `Mainspring sensitive-pattern scan passed (${allowed.length} intentional hits allowlisted).`,
)

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (ignoredDirectoryNames.has(entry.name)) continue
      yield* walk(entryPath)
      continue
    }
    if (!entry.isFile()) continue
    if (!scannedExtensions.has(path.extname(entry.name).toLowerCase())) continue
    yield entryPath
  }
}

function isAllowedHit(hit) {
  if (hit.path === 'scripts/check-sensitive-patterns.mjs') return true
  if (hit.path.endsWith('.test.ts') || hit.path.endsWith('.test.tsx')) return true
  if (hit.path.endsWith('/CLAUDE.md')) return true
  if (hit.path.startsWith('docs/') || hit.path === 'README.md' || hit.path === 'SECURITY.md') {
    return true
  }
  if (hit.path.startsWith('examples/')) return true
  if (
    (hit.path === 'src/gateway/server/HostedAuth.ts' || hit.path === 'src/gateway/AppStateStore.ts')
    && hit.scan === 'credential-storage-or-hash'
  ) {
    return true
  }
  if (
    hit.path === 'apps/console/src/App.tsx'
    && hit.scan === 'credential-storage-or-hash'
  ) {
    return true
  }
  if (
    hit.path === 'apps/console/src/appDashboardBootstrap.ts'
    && hit.scan === 'credential-storage-or-hash'
    && hit.text.includes('localStorage')
  ) {
    return true
  }
  if (
    hit.path === 'apps/console/src/consoleDataSource.ts'
    && hit.scan === 'credential-storage-or-hash'
    && hit.text.includes('localStorage')
  ) {
    return true
  }
  if (
    (
      hit.path === 'src/tools/ShellTool.ts'
      || hit.path === 'src/runner/RuntimeKernel.ts'
      || hit.path === 'src/providers/HttpProviderClient.ts'
      || hit.path === 'src/gateway/TemplateMarketplace.ts'
      || hit.path === 'apps/console/src/developmentGatewaySnapshotFixture.ts'
      || hit.path.startsWith('scripts/')
    )
    && hit.scan === 'unsafe-renderer-or-shell-ipc'
    && hit.text.includes('shell.exec')
  ) {
    return true
  }
  if (
    hit.path === 'src/tools/ToolRegistry.test.ts'
    && hit.scan === 'unsafe-renderer-or-shell-ipc'
  ) {
    return true
  }
  return false
}

function slash(value) {
  return value.replace(/\\/g, '/')
}
