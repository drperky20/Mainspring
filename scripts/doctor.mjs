#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const requiredFiles = [
  'README.md',
  'LICENSE',
  '.env.example',
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'src/index.ts',
  'src/runner/RuntimeKernel.ts',
  'src/tools/ToolRegistry.ts',
  'src/providers/HttpProviderClient.ts',
  'src/policy/PolicyGuard.ts',
  'src/mailbox/SqliteMailbox.ts',
  'src/protocol/index.ts',
  'src/protocol/node.ts',
  'src/control/channel.ts',
  'src/sdk/Mainspring.ts',
  'apps/console/package.json',
  'apps/console/src/App.tsx',
  'docker/runtime.Dockerfile',
  'docker/compose.local.yml',
]

const failures = []

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10)
if (nodeMajor < 20) {
  failures.push(`Node.js >=20 is required; found ${process.versions.node}`)
}

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    failures.push(`Missing required file: ${file}`)
  }
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (packageJson.name !== 'mainspring') {
  failures.push(`Package name must be "mainspring"; found ${packageJson.name}`)
}

for (const scriptName of [
  'typecheck',
  'test',
  'build',
  'security:mainspring',
  'console:typecheck',
  'console:build',
]) {
  if (!packageJson.scripts?.[scriptName]) {
    failures.push(`Missing package script: ${scriptName}`)
  }
}

for (const dependency of ['better-sqlite3', 'ws', 'zod']) {
  if (!packageJson.dependencies?.[dependency]) {
    failures.push(`Missing runtime dependency: ${dependency}`)
  }
}

if (failures.length > 0) {
  console.error('Mainspring doctor found problems:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Mainspring doctor passed.')
