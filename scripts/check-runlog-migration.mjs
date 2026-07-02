#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const docPath = path.join(root, 'docs', 'migration-runlog.md')
const packagePath = path.join(root, 'package.json')
const failures = []

const requiredFiles = [
  'docs/migration-runlog.md',
  'src/core/RunLogKernel.ts',
  'src/core/RunLogScheduler.ts',
  'src/core/RunLogExecutor.ts',
  'src/core/ProviderRouter.ts',
  'src/adapters/sqlite/SqliteRunLogStore.ts',
  'src/hosts/runlog/RunLogProjection.ts',
  'src/runtime/RuntimeEngine.ts',
  'src/runner/RuntimeKernel.ts',
  'src/runner/SessionRuntimeSupervisor.ts',
  'src/mailbox/SqliteMailbox.ts',
  'src/storage/sqlite/SqliteMainspringStorage.ts',
  'src/events/normalizeRuntimeEvent.ts',
  'src/sdk/Mainspring.ts',
  'src/gateway/LocalGateway.ts',
  'src/compat/runlog.ts',
]

for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    failures.push(`missing migration-mapped file: ${relativePath}`)
  }
}

const doc = fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8') : ''
for (const phrase of [
  'RunLogKernel',
  'RunLogScheduler',
  'RunLogExecutor',
  'ProviderRouter',
  'ToolRegistry / RuntimePolicyGuard',
  'SQLite WAL events + checkpoints',
  'RuntimeEngine',
  'SessionRuntimeSupervisor',
  'RuntimeKernel',
  'MainspringMailbox',
  'Compatibility runtime loop',
  'Compatibility executor',
  'RunLogProjection',
]) {
  if (!doc.includes(phrase)) failures.push(`migration doc missing phrase: ${phrase}`)
}

const tableRows = doc
  .split(/\r?\n/)
  .filter((line) => line.startsWith('| `'))

if (tableRows.length < 10) {
  failures.push(`migration table expected at least 10 legacy rows, found ${tableRows.length}`)
}

for (const legacy of [
  'src/runtime/RuntimeEngine.ts',
  'src/runner/SessionRuntimeSupervisor.ts',
  'src/runner/RuntimeKernel.ts',
  'src/mailbox/SqliteMailbox.ts',
  'src/storage/sqlite/SqliteMainspringStorage.ts',
  'src/events/normalizeRuntimeEvent.ts',
  'src/sdk/Mainspring.ts',
  'src/gateway/LocalGateway.ts',
  'src/compat/runlog.ts',
]) {
  if (!doc.includes(`\`${legacy}\``)) failures.push(`migration table missing legacy module: ${legacy}`)
}

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
for (const subpath of ['./core', './adapters/sqlite', './hosts/runlog', './compat']) {
  if (!packageJson.exports?.[subpath]) failures.push(`package export missing ${subpath}`)
}

if (!packageJson.scripts?.['runlog:migration:check']?.includes('check-runlog-migration.mjs')) {
  failures.push('package script runlog:migration:check is missing or does not call checker')
}
if (!packageJson.scripts?.verify?.includes('runlog:migration:check')) {
  failures.push('pnpm verify must include runlog:migration:check')
}
if (!packageJson.scripts?.['release:check']?.includes('runlog:migration:check')) {
  failures.push('pnpm release:check must include runlog:migration:check')
}

if (failures.length > 0) {
  console.error('Mainspring RunLog migration check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MAINSPRING_RUNLOG_MIGRATION_CHECK_OK')
