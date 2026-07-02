import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  createLocalMainspringGateway,
  createLocalGatewayServer,
  createMainspring,
  createSqliteLocalGatewayAppStateStore,
} from '../dist/index.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(predicate, label) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const value = predicate()
    if (value) return value
    await sleep(50)
  }
  throw new Error(`Timed out waiting for ${label}.`)
}

async function requestJson(url, init) {
  const response = await fetch(url, init)
  const body = await response.json()
  assert(response.ok, `${init?.method ?? 'GET'} ${url} failed: ${JSON.stringify(body)}`)
  return body
}

function fileContains(root, needle) {
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    const stat = fs.statSync(current)
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) stack.push(path.join(current, entry))
      continue
    }
    if (!stat.isFile()) continue
    const bytes = fs.readFileSync(current)
    if (bytes.includes(Buffer.from(needle))) return current
  }
  return null
}

class ManagedSecretRecordingProvider {
  constructor() {
    this.resolvedSecrets = []
    this.credentialRefs = []
  }

  query(input) {
    this.credentialRefs.push(input.credentialRef)
    this.resolvedSecrets.push(
      input.credentialRef ? input.resolveCredential?.(input.credentialRef) : undefined,
    )
    return {
      push() {},
      end() {},
      abort() {},
      events: (async function* () {
        yield {
          type: 'init',
          provider: input.providerId,
          providerSessionId: 'provider_managed_secret_check',
          modelId: input.model,
          providerTransport: 'managed-secret-check',
        }
        yield { type: 'result', text: 'managed secret resolved' }
      })(),
    }
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-secrets-check-'))
const managedSecretValue = 'sk-managed-secret-check-value'
const credentialName = process.platform === 'win32'
  ? `MainspringSecretsCheck-${process.pid}-${Date.now()}`
  : undefined

let appState
let mainspring
let server
try {
  const sessionsRoot = path.join(root, 'sessions')
  const workspaceRoot = path.join(root, 'workspace')
  fs.mkdirSync(sessionsRoot, { recursive: true })
  fs.mkdirSync(workspaceRoot, { recursive: true })

  appState = createSqliteLocalGatewayAppStateStore({
    dbPath: path.join(root, 'gateway-app.sqlite'),
    managedSecretKeyStorageMode: process.platform === 'win32' ? 'credential-manager' : 'file',
    ...(credentialName ? { managedSecretCredentialName: credentialName } : {}),
  })
  if (process.platform === 'win32') {
    assert(
      appState.managedSecretKeyStorage?.kind === 'windows-credential-manager',
      'managed secret key did not use Windows Credential Manager storage',
    )
  } else {
    assert(
      appState.managedSecretKeyStorage?.kind === 'base64-file',
      'non-Windows managed secret key did not use explicit encrypted-file fallback storage',
    )
  }
  const provider = new ManagedSecretRecordingProvider()
  mainspring = createMainspring({
    sessionsRoot,
    workspaceRoot,
    provider,
    providers: { openrouter: provider },
    secretResolver: (ref) => appState.resolveSecretRef(`${ref.kind}:${ref.key}`) ?? undefined,
    pollIntervalMs: 10,
  })
  const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })
  server = createLocalGatewayServer({ gateway, host: '127.0.0.1', port: 0 })

  await mainspring.start()
  const started = await server.start()

  const createdClient = await requestJson(`${started.url}/clients`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Secret Check Client',
      workspaceName: 'Secret Check Workspace',
      workspaceRoot,
    }),
  })
  assert(!JSON.stringify(createdClient).includes(managedSecretValue), 'client response leaked managed secret')
  const workspaceId = createdClient.workspace?.workspaceId
  const sessionId = createdClient.session?.sessionId
  assert(typeof workspaceId === 'string' && workspaceId, 'HTTP client creation did not return workspace id')
  assert(typeof sessionId === 'string' && sessionId, 'HTTP client creation did not return session id')

  const createdProfile = await requestJson(`${started.url}/provider-profiles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      providerId: 'default',
      label: 'Managed Secret Check',
      defaultModelId: 'managed-secret-check-model',
      secretValue: managedSecretValue,
    }),
  })
  const serializedProfileResponse = JSON.stringify(createdProfile)
  assert(!serializedProfileResponse.includes(managedSecretValue), 'provider profile response leaked managed secret')
  assert(!serializedProfileResponse.includes('secretRef'), 'provider profile response leaked secret ref')
  const providerProfileId = createdProfile.providerProfile?.profileId
  assert(typeof providerProfileId === 'string' && providerProfileId, 'HTTP provider profile creation did not return profile id')

  const providerProfile = appState.providerProfiles.get(providerProfileId)
  assert(providerProfile, 'app-state did not persist HTTP-created provider profile')
  assert(providerProfile.secretRef === `managed:${providerProfileId}`, 'provider profile did not use a managed ref')
  assert(providerProfile.managedSecretStored === true, 'provider profile did not report managed secret storage')
  assert(appState.resolveSecretRef(providerProfile.secretRef) === managedSecretValue, 'app-state did not resolve managed secret')

  const startedRun = await requestJson(`${started.url}/runs/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      workspaceId,
      providerProfileId,
      input: 'Resolve the managed provider credential.',
      mode: 'chat',
      allowedTools: [],
    }),
  })
  assert(!JSON.stringify(startedRun).includes(managedSecretValue), 'run-start response leaked managed secret')
  const runId = startedRun.run?.runId
  assert(typeof runId === 'string' && runId, 'HTTP run start did not return run id')

  await waitFor(async () => {
    const runs = await requestJson(`${started.url}/runs?sessionId=${encodeURIComponent(sessionId)}`)
    return runs.runs?.find((candidate) => candidate.runId === runId && candidate.status === 'completed')
  }, 'managed secret runtime completion through HTTP')

  const eventResponse = await requestJson(
    `${started.url}/runs/${encodeURIComponent(runId)}/events?sessionId=${encodeURIComponent(sessionId)}&limit=100`,
  )
  assert(eventResponse.events?.some((event) => event.type === 'run.completed'), 'runtime did not record completion')

  const snapshot = await requestJson(`${started.url}/snapshot`)
  const serializedHttpResponses = JSON.stringify({
    createdClient,
    createdProfile,
    startedRun,
    eventResponse,
    snapshot,
  })
  assert(!serializedHttpResponses.includes(managedSecretValue), 'HTTP responses leaked the raw managed secret')
  assert(!serializedHttpResponses.includes('secretRef'), 'HTTP responses leaked provider secret refs')

  const mailboxDispatches = appState.runs.list().filter((candidate) => candidate.runId === runId)
  assert(mailboxDispatches.length === 1, 'app-state did not record HTTP-started run metadata')

  assert(provider.resolvedSecrets[0] === managedSecretValue, 'provider did not receive the resolved managed secret')
  assert(provider.credentialRefs[0]?.kind === 'managed', 'provider did not receive an opaque managed credential ref')
  assert(provider.credentialRefs[0]?.key === providerProfileId, 'provider received the wrong managed credential key')

  const serializedEvents = JSON.stringify(eventResponse.events)
  assert(!serializedEvents.includes(managedSecretValue), 'runtime events leaked the raw managed secret')

  const leakPath = fileContains(root, managedSecretValue)
  assert(!leakPath, `raw managed secret leaked into local runtime files: ${leakPath}`)

  console.log('MAINSPRING_SECRETS_CHECK_OK')
} finally {
  if (server) await server.stop()
  if (mainspring) await mainspring.stop()
  appState?.close()
  if (credentialName) {
    try {
      execFileSync('cmdkey', [`/delete:${credentialName}`], {
        stdio: ['ignore', 'ignore', 'ignore'],
      })
    } catch {
      // Best-effort cleanup for the temporary Windows Credential Manager target.
    }
  }
  fs.rmSync(root, { recursive: true, force: true })
}
