#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const failures = []

const docsIndexPath = 'docs/index.md'
const docsReadmePath = 'docs/README.md'
const docsGuidePath = 'docs/documentation-guide.md'
const goalDigestPath = 'docs/goal-digest.md'

const indexText = readText(docsIndexPath)
const readmeText = readText(docsReadmePath)
const guideText = readText(docsGuidePath)

assertDocsIndexShape()
assertDocsReadme()
assertDocumentationGuide()
assertPublicDocsAreIndexed()
assertFeatureDocsFollowGuide()
assertGoalDigestIsRepoLocal()
assertRemovedDocsStayRemoved()

if (failures.length > 0) {
  console.error('Mainspring docs surface check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MAINSPRING_DOCS_SURFACE_CHECK_OK')

function readText(relativePath) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath} is missing`)
    return ''
  }
  return fs.readFileSync(absolutePath, 'utf8')
}

function assertDocsIndexShape() {
  for (const required of [
    '# Documentation Index',
    '## Start',
    '## Features',
    '## Project',
    '## Historical Ledger',
  ]) {
    if (!indexText.includes(required)) failures.push(`${docsIndexPath} must include ${required}`)
  }
}

function assertDocsReadme() {
  if (!readmeText.includes('[index.md](index.md)')) {
    failures.push(`${docsReadmePath} must point readers to docs/index.md`)
  }
  assertNamesGoalDigestAsRepoLocal(docsReadmePath, readmeText)
}

function assertDocumentationGuide() {
  for (const required of [
    '`README.md`: project front door.',
    '`docs/index.md`: map.',
    '`docs/features/*`: feature behavior and limits.',
    '`docs/current-state.md`: short repo truth.',
    '`docs/goal-digest.md`: repo-local long milestone ledger, excluded from npm package artifacts.',
    'Package-visible Markdown must only link to files that exist in the npm package.',
  ]) {
    if (!guideText.includes(required)) failures.push(`${docsGuidePath} must include guidance: ${required}`)
  }
}

function assertPublicDocsAreIndexed() {
  const indexedTargets = new Set(collectMarkdownLinks(indexText).map(normalizeMarkdownLinkTarget).filter(Boolean))
  const publicDocs = listPublicDocs()

  for (const publicDoc of publicDocs) {
    const target = path.relative('docs', publicDoc).replace(/\\/g, '/')
    if (target === 'README.md' || target === 'index.md') continue
    if (!indexedTargets.has(target)) failures.push(`${docsIndexPath} must link to package-visible doc ${publicDoc}`)
  }

  for (const target of indexedTargets) {
    if (isExternalLink(target) || target.startsWith('#')) continue
    const targetPath = path.normalize(path.join('docs', target)).replace(/\\/g, '/')
    if (!publicDocs.includes(targetPath)) failures.push(`${docsIndexPath} links to non-public docs target ${target}`)
  }
}

function assertFeatureDocsFollowGuide() {
  for (const source of listPublicDocs().filter((doc) => doc.startsWith('docs/features/'))) {
    const text = readText(source)
    for (const required of ['## What It Does', '## What It Does Not Do', '## How To Verify']) {
      if (!text.includes(required)) failures.push(`${source} must include ${required}`)
    }
    if (!/```bash[\s\S]*?pnpm [^`]+```/m.test(text)) {
      failures.push(`${source} must include a bash verification block with a pnpm command`)
    }
  }
}

function assertGoalDigestIsRepoLocal() {
  if ((packageJson.files ?? []).includes(goalDigestPath)) {
    failures.push(`${goalDigestPath} must not be listed directly in package.json files`)
  }
  if (listPublicDocs().includes(goalDigestPath)) {
    failures.push(`${goalDigestPath} must not be part of the package-visible docs set`)
  }
  for (const source of listPublicDocs()) {
    const text = readText(source)
    for (const link of collectMarkdownLinks(text)) {
      const target = normalizeMarkdownLinkTarget(link)
      if (!target) continue
      const targetPath = path.normalize(path.join(path.dirname(source), target)).replace(/\\/g, '/')
      if (targetPath === goalDigestPath) {
        failures.push(`${source} must not Markdown-link to repo-local ${goalDigestPath}`)
      }
    }
    if (text.includes('docs/goal-digest.md')) assertNamesGoalDigestAsRepoLocal(source, text)
  }
}

function assertRemovedDocsStayRemoved() {
  for (const removedPath of [
    'docs/brand.md',
    'docs/cost-model.md',
    'docs/database.md',
    'docs/frontend.md',
    'docs/hermes-agent-port-goal.md',
    'docs/hermes-agent-port-inventory.md',
    'docs/hermes-agent-replacement-architecture.md',
    'docs/hermes-source-coverage.md',
    'docs/marketing',
    'docs/marketing.md',
    'docs/monetization.md',
    'docs/open-source.md',
    'docs/positioning.md',
    'docs/product-direction.md',
  ]) {
    if (fs.existsSync(path.join(root, removedPath))) failures.push(`${removedPath} should remain removed from the public docs surface`)
    if ((packageJson.files ?? []).some((entry) => entry === removedPath || entry.startsWith(`${removedPath}/`))) {
      failures.push(`${removedPath} must not be included by package.json files`)
    }
  }
}

function assertNamesGoalDigestAsRepoLocal(source, text) {
  const lower = text.toLowerCase()
  if (!lower.includes('repo-local') || !lower.includes('goal-digest.md')) {
    failures.push(`${source} may mention goal-digest.md only as a repo-local ledger`)
  }
}

function listPublicDocs() {
  const docs = []
  for (const entry of packageJson.files ?? []) {
    if (!entry.startsWith('docs')) continue
    const absoluteEntry = path.join(root, entry)
    if (!fs.existsSync(absoluteEntry)) continue
    const stat = fs.statSync(absoluteEntry)
    if (stat.isFile() && entry.endsWith('.md')) {
      docs.push(entry)
      continue
    }
    if (stat.isDirectory()) {
      for (const file of walkFiles(absoluteEntry)) {
        const relativeFile = path.relative(root, file).replace(/\\/g, '/')
        if (relativeFile.endsWith('.md')) docs.push(relativeFile)
      }
    }
  }
  return docs.sort()
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
