import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EchoProvider } from '../providers/EchoProvider.js'
import { createMainspring } from '../sdk/Mainspring.js'
import {
  createLocalMainspringGateway,
  createSqliteLocalGatewayAppStateStore,
} from './index.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
  tempRoots.length = 0
})

function makeTempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

function tableNames(dbPath: string): string[] {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    return (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC")
        .all() as Array<{ name: string }>
    ).map((row) => row.name)
  } finally {
    db.close()
  }
}

describe('SqliteLocalGatewayAppStateStore', () => {
  it('creates and reads gateway-owned app state without runtime mailbox tables', () => {
    const root = makeTempRoot('mainspring-gateway-app-state-')
    const store = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    try {
      const client = store.clients.create({
        clientId: 'client_acme',
        name: 'Acme',
        metadata: { tier: 'pilot' },
      })
      const workspace = store.workspaces.create({
        workspaceId: 'workspace_acme',
        clientId: client.clientId,
        name: 'Acme Workspace',
        root: path.join(root, 'workspaces', 'acme'),
      })
      const agent = store.agents.create({
        agentId: 'agent_research',
        workspaceId: workspace.workspaceId,
        name: 'Research Agent',
        version: 'v2',
        defaultModelId: 'openrouter/free',
      })
      const providerProfile = store.providerProfiles.create({
        profileId: 'provider_profile_openrouter',
        providerId: 'openrouter',
        label: 'OpenRouter Default',
        secretRef: 'env:OPENROUTER_API_KEY',
        defaultModelId: 'openrouter/free',
        metadata: { suffix: '1234' },
      })
      const runMetadata = store.runs.upsert({
        runId: 'run_1',
        sessionId: 'session_1',
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
        providerProfileId: providerProfile.profileId,
        providerId: providerProfile.providerId,
        modelId: providerProfile.defaultModelId,
      })

      expect(store.clients.get(client.clientId)).toMatchObject({
        clientId: 'client_acme',
        metadata: { tier: 'pilot' },
      })
      expect(store.workspaces.list({ clientId: client.clientId })).toEqual([
        expect.objectContaining({ workspaceId: 'workspace_acme' }),
      ])
      expect(store.agents.list({ workspaceId: workspace.workspaceId })).toEqual([
        expect.objectContaining({ agentId: agent.agentId, defaultModelId: 'openrouter/free' }),
      ])
      expect(store.providerProfiles.list({ providerId: 'openrouter' })).toEqual([
        expect.objectContaining({
          profileId: providerProfile.profileId,
          secretRef: 'env:OPENROUTER_API_KEY',
          defaultModelId: 'openrouter/free',
        }),
      ])
      expect(store.runs.get(runMetadata.runId)).toMatchObject({
        runId: 'run_1',
        sessionId: 'session_1',
        workspaceId: workspace.workspaceId,
        agentId: agent.agentId,
        providerProfileId: providerProfile.profileId,
        providerId: 'openrouter',
        modelId: 'openrouter/free',
      })
      expect(store.runs.list({ sessionId: 'session_1' })).toEqual([
        expect.objectContaining({ runId: 'run_1' }),
      ])

      expect(tableNames(store.dbPath)).toEqual([
        'gateway_agents',
        'gateway_clients',
        'gateway_provider_profiles',
        'gateway_runs',
        'gateway_workspaces',
      ])
      expect(tableNames(store.dbPath)).not.toContain('messages_in')
      expect(tableNames(store.dbPath)).not.toContain('events_out')
    } finally {
      store.close()
    }
  })

  it('rejects raw provider secrets in secret refs and provider profile metadata', () => {
    const root = makeTempRoot('mainspring-gateway-app-state-secrets-')
    const store = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    try {
      expect(() =>
        store.providerProfiles.create({
          providerId: 'openrouter',
          label: 'Raw Key',
          secretRef: 'sk-ant-raw-secret123456',
        }),
      ).toThrow('Runtime secret references must be opaque')

      expect(() =>
        store.providerProfiles.create({
          providerId: 'openrouter',
          label: 'Metadata Leak',
          secretRef: 'env:OPENROUTER_API_KEY',
          metadata: { apiKey: 'sk-ant-raw-secret123456' },
        }),
      ).toThrow('raw secret material')

      expect(store.providerProfiles.list()).toEqual([])
    } finally {
      store.close()
    }
  })

  it('can be attached to the local gateway without changing runtime session storage', () => {
    const root = makeTempRoot('mainspring-gateway-app-state-boundary-')
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const sessionsRoot = path.join(root, 'sessions')
    const workspaceRoot = path.join(root, 'workspace')
    fs.mkdirSync(sessionsRoot, { recursive: true })
    fs.mkdirSync(workspaceRoot, { recursive: true })
    const mainspring = createMainspring({
      sessionsRoot,
      workspaceRoot,
      provider: new EchoProvider(),
      pollIntervalMs: 10,
    })
    const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })
    try {
      const client = gateway.appState?.clients.create({ name: 'Client One' })
      const session = mainspring.sessions.create({
        sessionId: 'runtime-session',
        workspace: { root: workspaceRoot },
      })

      expect(client?.clientId).toMatch(/^client_/)
      expect(gateway.sessions.list()).toEqual([
        expect.objectContaining({ sessionId: session.record.sessionId }),
      ])
      expect(gateway.appState?.clients.list()).toHaveLength(1)
      expect(fs.existsSync(path.join(session.record.sessionPath, 'mainspring-session.json'))).toBe(
        true,
      )
      expect(tableNames(appState.dbPath)).not.toContain('messages_in')
    } finally {
      appState.close()
    }
  })
})
