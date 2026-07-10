#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const composeFile = 'docker/compose.local.yml'
const candidates = [
  { command: 'docker', args: ['compose', '-f', composeFile, 'config'] },
  { command: 'docker-compose', args: ['-f', composeFile, 'config'] },
]

const failures = []
for (const candidate of candidates) {
  const result = spawnSync(candidate.command, candidate.args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1' },
  })
  if (result.status === 0) {
    console.log('MAINSPRING_DOCKER_COMPOSE_CONFIG_OK')
    process.exit(0)
  }
  failures.push(
    `${candidate.command} ${candidate.args.join(' ')}: ${
      result.error?.message || result.stderr.trim() || `exit ${result.status ?? 'unknown'}`
    }`,
  )
}

console.error('Mainspring Docker Compose config check failed:')
for (const failure of failures) console.error(`- ${failure}`)
process.exit(1)
