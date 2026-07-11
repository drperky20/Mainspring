import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createSqliteLocalGatewayAppStateStore,
  type CreateLocalGatewayAgentInput,
  type CreateLocalGatewayClientInput,
  type CreateLocalGatewayWorkspaceInput,
  type LocalGatewayAppStateStore,
  type UpdateLocalGatewayAgentInput,
  type UpdateLocalGatewayClientInput,
  type UpdateLocalGatewayWorkspaceInput,
} from './AppStateStore.js'
import { GatewayTopologyControl } from './GatewayTopologyControl.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true })
  tempRoots.length = 0
})

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

describe('GatewayTopologyControl', () => {
  it('records hash-only authorization before client, workspace, session, and agent writes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-topology-control-'))
    tempRoots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const actor = 'hosted:topology-control:admin'
    const persisted = {
      clients: appState.clients,
      workspaces: appState.workspaces,
      agents: appState.agents,
    }
    const writeOrder: string[] = []
    const controlState = {
      ...appState,
      clients: {
        ...persisted.clients,
        create: (input: CreateLocalGatewayClientInput) => {
          writeOrder.push('client')
          expect(appState.auditEvents.list({ category: 'gateway' }).some((event) => (
            event.action === 'client.created.authorized'
          ))).toBe(true)
          return persisted.clients.create(input)
        },
        update: (input: UpdateLocalGatewayClientInput) => {
          writeOrder.push('client.update')
          expect(appState.auditEvents.list({ category: 'gateway' }).some((event) => (
            event.action === 'client.updated.authorized'
          ))).toBe(true)
          return persisted.clients.update(input)
        },
      },
      workspaces: {
        ...persisted.workspaces,
        create: (input: CreateLocalGatewayWorkspaceInput) => {
          writeOrder.push('workspace')
          expect(appState.auditEvents.list({ category: 'gateway' }).some((event) => (
            event.action === 'workspace.created.authorized'
          ))).toBe(true)
          return persisted.workspaces.create(input)
        },
        update: (input: UpdateLocalGatewayWorkspaceInput) => {
          writeOrder.push('workspace.update')
          expect(appState.auditEvents.list({ category: 'gateway' }).some((event) => (
            event.action === 'workspace.updated.authorized'
          ))).toBe(true)
          return persisted.workspaces.update(input)
        },
      },
      agents: {
        ...persisted.agents,
        create: (input: CreateLocalGatewayAgentInput) => {
          writeOrder.push('agent')
          expect(appState.auditEvents.list({ category: 'gateway' }).some((event) => (
            event.action === 'agent.created.authorized'
          ))).toBe(true)
          return persisted.agents.create(input)
        },
        update: (input: UpdateLocalGatewayAgentInput) => {
          writeOrder.push('agent.update')
          expect(appState.auditEvents.list({ category: 'gateway' }).some((event) => (
            event.action === 'agent.updated.authorized'
          ))).toBe(true)
          return persisted.agents.update(input)
        },
      },
    } as unknown as LocalGatewayAppStateStore
    let sessionAuthorized = false
    const control = new GatewayTopologyControl({
      appState: controlState,
      resolveWorkspaceRoot: (value) => path.resolve(root, value),
      createSession: ({ sessionId, workspaceRoot, metadata }) => {
        sessionAuthorized = appState.auditEvents.list({ category: 'gateway' }).some((event) => (
          event.action === 'session.created.authorized'
          && event.targetId === sessionId
          && event.actor === actor
        ))
        return {
          sessionId,
          status: 'open',
          workspaceRoot,
          sessionPath: path.join(root, `${sessionId}.sqlite`),
          createdAt: '2026-07-11T00:00:00.000Z',
          updatedAt: '2026-07-11T00:00:00.000Z',
          metadata,
        }
      },
      listRuntimeSessions: () => [],
    })

    try {
      const created = control.createClientWorkspace({
        name: 'Topology Client',
        workspaceRoot: 'workspace-a',
        workspaceName: 'Topology Workspace',
        contact: 'ops@example.test',
        actor,
      })
      expect(sessionAuthorized).toBe(true)
      expect(writeOrder).toEqual(['client', 'workspace'])

      const updated = control.updateClientWorkspace({
        clientId: created.client.clientId,
        workspaceId: created.workspace!.workspaceId,
        workspaceName: 'Topology Workspace v2',
        workspaceRoot: 'workspace-b',
        actor,
      })
      expect(updated.workspace?.name).toBe('Topology Workspace v2')

      const agent = control.createAgentDraft({
        workspaceId: updated.workspace!.workspaceId,
        name: 'Topology Agent',
        instructions: 'Keep private paths private.',
        actor,
      })
      control.updateAgentDraft({
        agentId: agent.agentId,
        name: 'Topology Agent v2',
        instructions: 'Stay concise.',
        actor,
      })

      const events = appState.auditEvents.list({ category: 'gateway' })
      const authorized = events.filter((event) => event.action.endsWith('.authorized'))
      expect(authorized.length).toBeGreaterThanOrEqual(7)
      expect(authorized.every((event) => event.actor === actor)).toBe(true)
      expect(JSON.stringify(events)).not.toContain(path.resolve(root, 'workspace-a'))
      expect(JSON.stringify(events)).not.toContain(path.resolve(root, 'workspace-b'))
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: 'client.created.authorized',
          targetId: created.client.clientId,
          metadata: {
            decisionRecord: expect.objectContaining({
              surface: 'topology',
              operation: 'topology.write',
              inputHash: expect.any(String),
              metadata: expect.objectContaining({ topologyHash: expect.any(String) }),
            }),
          },
        }),
        expect.objectContaining({
          action: 'agent.updated.authorized',
          targetId: agent.agentId,
          metadata: {
            decisionRecord: expect.objectContaining({
              metadata: expect.objectContaining({
                previousTopologyHash: expect.any(String),
              }),
            }),
          },
        }),
      ]))
      const clientAuthorizationIndex = events.findIndex((event) => event.action === 'client.created.authorized')
      const clientOutcomeIndex = events.findIndex((event) => event.action === 'client.created')
      expect(clientAuthorizationIndex).toBeGreaterThanOrEqual(0)
      expect(clientOutcomeIndex).toBeGreaterThan(clientAuthorizationIndex)
      const decision = recordValue(recordValue(events[clientAuthorizationIndex].metadata)?.decisionRecord)
      expect(decision?.input).toBeUndefined()
    } finally {
      appState.close()
    }
  })

  it('rejects cross-client workspace mutation before writing client state', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-gateway-topology-boundary-'))
    tempRoots.push(root)
    const appState = createSqliteLocalGatewayAppStateStore({
      dbPath: path.join(root, 'gateway-app.sqlite'),
    })
    const clientA = appState.clients.create({ name: 'Client A' })
    const clientB = appState.clients.create({ name: 'Client B' })
    const workspaceB = appState.workspaces.create({
      clientId: clientB.clientId,
      name: 'Client B Workspace',
      root: path.join(root, 'workspace-b'),
    })
    const control = new GatewayTopologyControl({
      appState,
      resolveWorkspaceRoot: (value) => path.resolve(root, value),
      createSession: () => {
        throw new Error('not expected')
      },
      listRuntimeSessions: () => [],
    })

    try {
      expect(() => control.updateClientWorkspace({
        clientId: clientA.clientId,
        workspaceId: workspaceB.workspaceId,
        workspaceName: 'Hijacked Workspace',
        actor: 'hosted:attacker:admin',
      })).toThrow('is not attached to client')
      expect(appState.clients.get(clientA.clientId)).toMatchObject({ name: 'Client A' })
      expect(appState.workspaces.get(workspaceB.workspaceId)).toMatchObject({ name: 'Client B Workspace' })
      expect(appState.auditEvents.list({ category: 'gateway' })).toHaveLength(0)
    } finally {
      appState.close()
    }
  })
})
