import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createSqliteLocalGatewayAppStateStore,
  type LocalGatewayAppStateStore,
} from './AppStateStore.js'
import { GatewayMarketplaceControl } from './GatewayMarketplaceControl.js'
import type { GatewayTopologyControl } from './GatewayTopologyControl.js'
import type { RemoteMarketplaceRegistry } from './RemoteMarketplace.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true })
  tempRoots.length = 0
})

describe('GatewayMarketplaceControl', () => {
  it('authorizes verified template installation before file and topology writes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-marketplace-control-'))
    tempRoots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const actor = 'hosted:marketplace-control:admin'
    let installerSawAuthorization = false
    let topologyActor: string | undefined
    const topology = {
      createClientWorkspace: (input: { actor?: string; workspaceRoot?: string }) => {
        topologyActor = input.actor
        return {
          client: {
            clientId: 'client_marketplace',
            name: 'Coding Client',
            status: 'active' as const,
            createdAt: '2026-07-11T00:00:00.000Z',
            updatedAt: '2026-07-11T00:00:00.000Z',
          },
          workspace: {
            workspaceId: 'workspace_marketplace',
            clientId: 'client_marketplace',
            name: 'Coding Workspace',
            root: input.workspaceRoot ?? root,
            status: 'active' as const,
            createdAt: '2026-07-11T00:00:00.000Z',
            updatedAt: '2026-07-11T00:00:00.000Z',
          },
          session: {
            sessionId: 'session_marketplace',
            status: 'open' as const,
            workspaceRoot: input.workspaceRoot ?? root,
            sessionPath: path.join(root, 'session.sqlite'),
            createdAt: '2026-07-11T00:00:00.000Z',
            updatedAt: '2026-07-11T00:00:00.000Z',
          },
        }
      },
      createAgentDraft: (input: { actor?: string }) => {
        expect(input.actor).toBe(actor)
        return {
          agentId: 'agent_marketplace',
          workspaceId: 'workspace_marketplace',
          name: 'Coding Agent',
          version: 'v1',
          defaultModelId: 'gpt-4.1-mini',
          status: 'active' as const,
          createdAt: '2026-07-11T00:00:00.000Z',
          updatedAt: '2026-07-11T00:00:00.000Z',
        }
      },
    } as unknown as GatewayTopologyControl
    const control = new GatewayMarketplaceControl({
      appState,
      repoRoot: process.cwd(),
      workspaceBaseRoot: root,
      remoteMarketplace: null,
      topology,
      resolveWorkspaceRoot: (value) => path.resolve(root, value),
      resolveRuntimeProfile: (profileId) => profileId,
      installLocalTemplate: ({ workspaceRoot }) => {
        installerSawAuthorization = appState.auditEvents.list({ category: 'marketplace' }).some((event) => (
          event.action === 'template.install.authorized'
          && event.actor === actor
        ))
        expect(workspaceRoot).toBe(path.resolve(root, 'installed'))
        return ['agent.config.json', 'README.md']
      },
    })

    try {
      const installed = control.install({
        templateId: 'coding-agent',
        workspaceRoot: 'installed',
        actor,
      })
      expect(installerSawAuthorization).toBe(true)
      expect(topologyActor).toBe(actor)
      expect(installed.installedFiles).toEqual(['agent.config.json', 'README.md'])
      const events = appState.auditEvents.list({ category: 'marketplace' })
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: 'template.install.authorized',
          actor,
          metadata: {
            decisionRecord: expect.objectContaining({
              surface: 'marketplace',
              operation: 'marketplace.install',
              metadata: expect.objectContaining({
                templateHash: expect.any(String),
                workspaceRootHash: expect.any(String),
              }),
            }),
          },
        }),
        expect.objectContaining({
          action: 'template.installed',
          actor,
          metadata: expect.objectContaining({
            decisionId: expect.any(String),
            templateHash: expect.any(String),
          }),
        }),
      ]))
      expect(JSON.stringify(events)).not.toContain(path.resolve(root, 'installed'))
      expect(JSON.stringify(events)).not.toContain('Keep your coding workspace')
    } finally {
      appState.close()
    }
  })

  it('authorizes pinned remote catalog synchronization before registry replacement', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-marketplace-sync-'))
    tempRoots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const actor = 'hosted:marketplace-sync:admin'
    let sawAuthorization = false
    const remoteMarketplace = {
      sourceBindingHash: () => 'source-binding-hash',
      sync: async () => {
        sawAuthorization = appState.auditEvents.list({ category: 'marketplace' }).some((event) => (
          event.action === 'remote-catalogs.sync.authorized'
          && event.actor === actor
        ))
        return []
      },
    } as unknown as RemoteMarketplaceRegistry
    const control = new GatewayMarketplaceControl({
      appState,
      repoRoot: process.cwd(),
      workspaceBaseRoot: root,
      remoteMarketplace,
      topology: {} as GatewayTopologyControl,
      resolveWorkspaceRoot: (value) => path.resolve(root, value),
      resolveRuntimeProfile: (profileId) => profileId,
    })

    try {
      const templates = await control.syncRemoteCatalogs(actor)
      expect(sawAuthorization).toBe(true)
      expect(templates).toEqual(expect.arrayContaining([
        expect.objectContaining({ templateId: 'coding-agent', provenance: 'repo-examples' }),
      ]))
      expect(appState.auditEvents.list({ category: 'marketplace' })).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: 'remote-catalogs.sync.authorized',
          actor,
          metadata: {
            decisionRecord: expect.objectContaining({
              operation: 'marketplace.catalog.sync',
              metadata: expect.objectContaining({
                sourceBindingHash: 'source-binding-hash',
              }),
            }),
          },
        }),
        expect.objectContaining({
          action: 'remote-catalogs.synced',
          actor,
          metadata: expect.objectContaining({
            decisionId: expect.any(String),
          }),
        }),
      ]))
    } finally {
      appState.close()
    }
  })
})
