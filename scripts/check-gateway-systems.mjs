import { spawnSync } from 'node:child_process'

const checks = [
  ['pricing', 'scripts/check-pricing.mjs'],
  ['budget', 'scripts/check-budget-policy.mjs'],
  ['secrets', 'scripts/check-secrets.mjs'],
  ['auth', 'scripts/check-auth.mjs'],
  ['execution-backends', 'scripts/check-execution-backends.mjs'],
  ['cells', 'scripts/check-cells.mjs'],
  ['marketplace', 'scripts/check-marketplace.mjs'],
  ['cron', 'scripts/check-cron.mjs'],
  ['deployment', 'scripts/check-deploy.mjs'],
  ['gateway-response-surface', 'scripts/check-gateway-response-surface.mjs'],
]

for (const [label, script] of checks) {
  const result = spawnSync(process.execPath, [script], {
    stdio: 'inherit',
    shell: false,
  })
  if (result.status !== 0) {
    throw new Error(`Gateway system check failed: ${label}`)
  }
  if (result.error) throw result.error
}

console.log('MAINSPRING_GATEWAY_SYSTEMS_CHECK_OK')
