#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []

const viteConfig = readText('apps/console/vite.config.ts')
const consoleTsconfig = readJson('apps/console/tsconfig.json')
const packageJson = readJson('package.json')
const browserSafetySource = readText('src/gateway/browserSafety.ts')

requireText('apps/console/vite.config.ts', viteConfig, "'mainspring/gateway/browser-safety'")
requireText('apps/console/vite.config.ts', viteConfig, '../../src/gateway/browserSafety.ts')
assertBrowserSafetySourceIsPure()

const paths = consoleTsconfig.compilerOptions?.paths ?? {}
const browserSafetyPaths = paths['mainspring/gateway/browser-safety']
if (JSON.stringify(browserSafetyPaths) !== JSON.stringify(['../../src/gateway/browserSafety.ts'])) {
  failures.push(
    'apps/console/tsconfig.json must map mainspring/gateway/browser-safety to ../../src/gateway/browserSafety.ts',
  )
}

const browserSafetyExport = packageJson.exports?.['./gateway/browser-safety']
if (
  browserSafetyExport?.import !== './dist/gateway/browserSafety.js'
  || browserSafetyExport?.types !== './dist/gateway/browserSafety.d.ts'
) {
  failures.push('package.json must expose ./gateway/browser-safety as the narrow browserSafety build output')
}

const consoleSources = listFiles(path.join(root, 'apps/console/src'), '.ts', '.tsx')
const browserSafetyImporters = []
for (const file of consoleSources) {
  const relative = path.relative(root, file).replace(/\\/g, '/')
  const text = fs.readFileSync(file, 'utf8')
  if (text.includes('mainspring/gateway/browser-safety')) browserSafetyImporters.push(relative)
  if (text.includes('../gateway/browserSafety') || text.includes('../../src/gateway/browserSafety')) {
    failures.push(`${relative} must use the package subpath for browser-safety helpers`)
  }
  if (
    text.includes('browserUnsafeGatewayTextMarkers')
    || text.includes('isBrowserUnsafeBrowserAccessQueryKey')
    || text.includes('containsBrowserUnsafeGatewayText')
    || text.includes('redactBrowserUnsafeGatewayText')
  ) {
    requireText(relative, text, 'mainspring/gateway/browser-safety')
  }
}

for (const requiredImporter of [
  'apps/console/src/consoleDataSource.ts',
  'apps/console/src/localGatewayClient.ts',
  'apps/console/src/localGatewayTransport.ts',
]) {
  if (!browserSafetyImporters.includes(requiredImporter)) {
    failures.push(`${requiredImporter} must import shared browser-safety helpers through the package subpath`)
  }
}

if (failures.length > 0) {
  console.error('Mainspring console browser-safety check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MAINSPRING_CONSOLE_BROWSER_SAFETY_CHECK_OK')

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath))
}

function requireText(relativePath, text, expected) {
  if (!text.includes(expected)) failures.push(`${relativePath} must include ${expected}`)
}

function assertBrowserSafetySourceIsPure() {
  for (const expectedExport of [
    'browserUnsafeGatewayTextMarkers',
    'browserUnsafeBrowserAccessQueryKeys',
    'browserUnsafeProviderCredentialMarkerPattern',
    'browserUnsafeProviderCredentialMarkers',
    'containsBrowserUnsafeGatewayText',
    'isBrowserUnsafeBrowserAccessQueryKey',
    'redactBrowserUnsafeGatewayText',
    'redactBrowserUnsafeProviderCredentialMarkers',
  ]) {
    requireText('src/gateway/browserSafety.ts', browserSafetySource, `export function ${expectedExport}`)
  }

  for (const forbiddenPattern of [
    /^import\s/m,
    /from\s+['"]node:/,
    /from\s+['"]#/,
    /from\s+['"]\.\.\/(?!browserSafety)/,
    /\b(?:fs|path|process|Buffer|Database|better-sqlite3)\b/,
  ]) {
    if (forbiddenPattern.test(browserSafetySource)) {
      failures.push(
        `src/gateway/browserSafety.ts must stay a pure browser-safe helper without Node/runtime imports: ${forbiddenPattern}`,
      )
    }
  }
}

function listFiles(directory, ...extensions) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(absolute, ...extensions))
    else if (entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(absolute)
    }
  }
  return files
}
