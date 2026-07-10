#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []

const ignoredDirs = new Set([
  '.git',
  '.mainspring',
  '.reference',
  'dist',
  'node_modules',
  'release',
  'tmp',
])

const scannedExtensions = new Set(['.md', '.mjs', '.js', '.json', '.ts', '.tsx', '.yml', '.yaml'])

const scannedRoots = [
  'README.md',
  'SECURITY.md',
  'RELEASE.md',
  'CONTRIBUTING.md',
  'GOVERNANCE.md',
  'ROADMAP.md',
  'docs',
  'examples',
  'package.json',
]

const claimRules = [
  {
    name: 'sandbox-or-isolation',
    pattern: /\b(sandbox(?:ed|es|ing)?|isolate[sd]?|isolation|containment|VM pool|microVM)\b/i,
    allowed: [
      /\bnot\b/i,
      /\bno\b/i,
      /\bmust not\b/i,
      /\bdo not\b/i,
      /not (?:a )?(?:sandbox|security boundary|containment|complete VM isolation|VM isolation)/i,
      /not equivalent to VM isolation/i,
      /not a complete VM isolation product/i,
      /without isolation tests/i,
      /unless .* tests prove/i,
      /optional .* route/i,
      /future .* isolation/i,
      /not implemented/i,
      /workspace containment/i,
      /isolated-capable/i,
      /Electron isolation settings/i,
      /unless .*implemented.*verified/i,
      /do not claim/i,
      /disallowed wording/i,
      /current limits/i,
      /roadmap/i,
    ],
  },
  {
    name: 'safe-shell-or-process',
    pattern: /\b(safe shell|safe host|secure shell|secure process|safe process|safe execution)\b/i,
    allowed: [
      /not/i,
      /\bno\b/i,
      /must not/i,
      /disallowed wording/i,
      /do not claim/i,
      /future work/i,
    ],
  },
  {
    name: 'secure-browser-automation',
    pattern: /\b(secure browser|browser isolation|browser sandbox|safe browser)\b/i,
    allowed: [
      /not/i,
      /\bno\b/i,
      /not implemented/i,
      /future/i,
      /production browser isolation/i,
      /disallowed wording/i,
      /do not claim/i,
    ],
  },
  {
    name: 'secret-vaulting',
    pattern: /\b(secure desktop secret|secure .*vault|cross-platform secure desktop credential|secret vault)\b/i,
    allowed: [
      /not implemented/i,
      /no cross-platform/i,
      /not a .*vault/i,
      /\bno\b/i,
      /future/i,
      /disallowed wording/i,
      /do not claim/i,
    ],
  },
  {
    name: 'marketplace-billing-roles',
    pattern: /\b(payment-backed|paid marketplace|secure marketplace|billing|tenant-scoped|enterprise SSO)\b/i,
    allowed: [
      /not implemented/i,
      /no /i,
      /not /i,
      /future/i,
      /before adding/i,
      /local gateway hosted-auth mode.*not enterprise SSO/i,
      /disallowed wording/i,
      /do not claim/i,
      /later/i,
    ],
  },
  {
    name: 'kubernetes-cloud-prod',
    pattern: /\b(Kubernetes production|production-ready Kubernetes|cloud production|hosted SaaS|multi-tenant isolation)\b/i,
    allowed: [
      /not/i,
      /\bno\b/i,
      /future/i,
      /optional/i,
      /not a hosted SaaS/i,
      /do not claim/i,
      /disallowed wording/i,
    ],
  },
  {
    name: 'approval-resume-overclaim',
    pattern: /\b(fully resumable|durable cryptographic approval|approval resume|resumes? after restart)\b/i,
    allowed: [
      /not implemented/i,
      /planned/i,
      /remaining/i,
      /legacy/i,
      /does not resume/i,
      /pending/i,
      /queued runs survive/i,
      /process-level object restart/i,
      /surviving process restarts/i,
      /approval\/denial decisions/i,
      /approval resume now has scoped signed receipts/i,
      /scoped approval resume exists for approved tool boundaries/i,
      /approved receipts can resume a paused tool after SQLite-backed restart/i,
      /post-tool assistant result without replaying side effects/i,
      /approved tool resume can feed a compact result into provider continuation/i,
      /disallowed wording/i,
      /do not claim/i,
    ],
  },
  {
    name: 'self-healing-memory-skills',
    pattern: /\b(self-healing|self-improving|safe self-writing|safe memory|safe skill|hosted skill marketplace)\b/i,
    allowed: [
      /not implemented/i,
      /planned/i,
      /avoid/i,
      /defer/i,
      /disallowed wording/i,
      /do not claim/i,
      /behavior mutation/i,
    ],
  },
]

for (const file of collectScannedFiles()) {
  const text = fs.readFileSync(path.join(root, file), 'utf8')
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const rule of claimRules) {
      if (!rule.pattern.test(line)) continue
      if (isAllowed(file, line, rule)) continue
      failures.push(`${rule.name}: ${file}:${index + 1}: ${line.trim()}`)
    }
  })
}

if (failures.length > 0) {
  console.error('Mainspring security truth check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MAINSPRING_SECURITY_TRUTH_CHECK_OK')

function collectScannedFiles() {
  const files = []
  for (const entry of scannedRoots) {
    const absolute = path.join(root, entry)
    if (!fs.existsSync(absolute)) continue
    const stat = fs.statSync(absolute)
    if (stat.isFile()) {
      files.push(entry)
      continue
    }
    for (const file of walk(absolute)) {
      files.push(path.relative(root, file).replace(/\\/g, '/'))
    }
  }
  return files
    .filter((file) => scannedExtensions.has(path.extname(file).toLowerCase()))
    .filter((file) => file !== 'docs/goal-digest.md')
    .sort()
}

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue
      yield* walk(path.join(directory, entry.name))
      continue
    }
    if (entry.isFile()) yield path.join(directory, entry.name)
  }
}

function isAllowed(file, line, rule) {
  if (file === 'docs/security-truth-matrix.md') return true
  if (file === 'scripts/check-security-truth.mjs') return true
  return rule.allowed.some((pattern) => pattern.test(line))
}
