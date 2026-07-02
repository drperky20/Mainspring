#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const failures = []

checkOpenRouterMissingKeyDiagnostic()

if (failures.length > 0) {
  console.error('Mainspring optional verifier check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MAINSPRING_OPTIONAL_VERIFIERS_CHECK_OK')

function checkOpenRouterMissingKeyDiagnostic() {
  const result = spawnSync(process.execPath, ['scripts/openrouter-e2e.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      MAINSPRING_OPENROUTER_E2E_SKIP_ENV_FILE: '1',
      OPENROUTER_API_KEY: '',
    },
    shell: false,
    windowsHide: true,
  })

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.status === 0) {
    failures.push('openrouter:e2e missing-key diagnostic unexpectedly passed')
    return
  }
  if (!output.includes('MAINSPRING_OPENROUTER_E2E_PREREQUISITES_BLOCKED')) {
    failures.push('openrouter:e2e missing-key diagnostic did not emit prerequisite token')
  }

  const jsonStart = output.indexOf('{')
  const jsonEnd = output.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    failures.push('openrouter:e2e missing-key diagnostic did not emit JSON payload')
    return
  }

  let payload
  try {
    payload = JSON.parse(output.slice(jsonStart, jsonEnd + 1))
  } catch (error) {
    failures.push(`openrouter:e2e missing-key diagnostic emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  if (payload.status !== 'prerequisites_blocked') {
    failures.push(`openrouter:e2e missing-key status expected prerequisites_blocked, got ${String(payload.status)}`)
  }
  if (payload.keyPresent !== false) {
    failures.push('openrouter:e2e missing-key payload must report keyPresent false')
  }
  if (payload.keyEchoed !== false) {
    failures.push('openrouter:e2e missing-key payload must report keyEchoed false')
  }
  if (!Array.isArray(payload.requiredEnv) || !payload.requiredEnv.includes('OPENROUTER_API_KEY')) {
    failures.push('openrouter:e2e missing-key payload must include OPENROUTER_API_KEY in requiredEnv')
  }
  const keyLookingNeedles = [
    ['sk', 'or', ''].join('-'),
    ['sk', 'proj', ''].join('-'),
    `${['OPENROUTER', 'API', 'KEY'].join('_')}=`,
  ]
  if (keyLookingNeedles.some((needle) => output.includes(needle))) {
    failures.push('openrouter:e2e missing-key diagnostic leaked key-looking material')
  }
}
