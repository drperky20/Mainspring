import { createMainspringRuntimeId } from '#protocol'
import { hashApprovalInput } from '../policy/ApprovalReceipt.js'
import { createHostDecisionRecord, type DecisionRecord } from '../policy/DecisionRecord.js'
import type {
  LocalGatewayAgentRecord,
  LocalGatewayAppStateStore,
  LocalGatewayWorkspaceRecord,
} from './AppStateStore.js'
import type {
  CreateLocalGatewayAgentDraftInput,
  CreateLocalGatewayClientWorkspaceInput,
  CreateLocalGatewayClientWorkspaceResult,
  CreateLocalGatewayWorkspaceSessionInput,
  CreateLocalGatewayWorkspaceSessionResult,
  DeleteLocalGatewayClientResult,
  DeleteLocalGatewayWorkspaceResult,
  LocalGatewaySessionProjection,
  UpdateLocalGatewayAgentDraftInput,
  UpdateLocalGatewayClientWorkspaceInput,
  UpdateLocalGatewayClientWorkspaceResult,
} from './LocalGateway.js'

export interface GatewayTopologyControlOptions {
  appState: LocalGatewayAppStateStore
  resolveWorkspaceRoot: (value: string, label: string) => string
  createSession: (input: {
    sessionId: string
    workspaceRoot: string
    metadata: Record<string, unknown>
  }) => LocalGatewaySessionProjection
  listRuntimeSessions: () => ReadonlyArray<{ metadata?: Record<string, unknown> }>
}

type TopologyMutation = 'create' | 'update' | 'delete'

function normalizedText(value: string | undefined): string | undefined {
  const text = value?.trim()
  return text || undefined
}

function requiredText(value: string, label: string): string {
  const text = value.trim()
  if (!text) throw new Error(`${label} is required.`)
  return text
}

function actorFor(input: { actor?: string }): string {
  return normalizedText(input.actor) ?? 'local-gateway'
}

function metadataHash(metadata?: Record<string, unknown>): string {
  return hashApprovalInput(metadata ?? {})
}

function rootHash(root: string): string {
  return hashApprovalInput({ root })
}

function decisionMetadata(decision: DecisionRecord): Record<string, unknown> {
  return { decisionRecord: decision }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Owns client, workspace, agent, and runtime-session topology mutations. The
 * facade delegates here so browser-safe IDs are resolved to host state before
 * mutation, trusted hosted identity is preserved, and hash-only authority is
 * durably recorded before topology changes are written.
 */
export class GatewayTopologyControl {
  constructor(private readonly options: GatewayTopologyControlOptions) {}

  createClientWorkspace(
    input: CreateLocalGatewayClientWorkspaceInput,
  ): CreateLocalGatewayClientWorkspaceResult {
    const name = requiredText(input.name, 'client name')
    const clientId = createMainspringRuntimeId('client')
    const clientMetadata = {
      ...(input.contact ? { contact: input.contact } : {}),
      ...(input.billingLabel ? { billingLabel: input.billingLabel } : {}),
      ...(input.metadata ?? {}),
    }
    const workspaceRoot = normalizedText(input.workspaceRoot)
      ? this.options.resolveWorkspaceRoot(input.workspaceRoot!, 'Gateway workspace root')
      : undefined
    const workspaceId = workspaceRoot ? createMainspringRuntimeId('workspace') : undefined
    const workspaceName = workspaceRoot
      ? normalizedText(input.workspaceName) ?? `${name} Workspace`
      : undefined
    const sessionId = workspaceRoot ? createMainspringRuntimeId('session') : undefined
    const clientHash = hashApprovalInput({
      clientId,
      name,
      status: 'active',
      metadataHash: metadataHash(clientMetadata),
      ...(workspaceId ? { workspaceId } : {}),
    })
    const workspaceHash = workspaceRoot && workspaceId && workspaceName
      ? this.workspaceHash({
          workspaceId,
          clientId,
          name: workspaceName,
          root: workspaceRoot,
          status: 'active',
        })
      : undefined
    const sessionHash = workspaceRoot && workspaceId && sessionId
      ? this.sessionHash({ sessionId, clientId, workspaceId, root: workspaceRoot })
      : undefined
    const actor = actorFor(input)
    const clientDecision = this.topologyDecision({
      targetType: 'client',
      targetId: clientId,
      mutation: 'create',
      topologyHash: clientHash,
      reason: 'Trusted gateway operator requested client topology creation.',
      metadata: { workspaceId, workspaceHash, sessionId, sessionHash },
    })
    const workspaceDecision = workspaceId && workspaceHash
      ? this.topologyDecision({
          targetType: 'workspace',
          targetId: workspaceId,
          mutation: 'create',
          topologyHash: workspaceHash,
          reason: 'Trusted gateway operator requested workspace topology creation.',
          metadata: { clientId, rootHash: rootHash(workspaceRoot!) },
        })
      : undefined
    const sessionDecision = sessionId && sessionHash && workspaceId
      ? this.topologyDecision({
          targetType: 'session',
          targetId: sessionId,
          mutation: 'create',
          topologyHash: sessionHash,
          reason: 'Trusted gateway operator requested a workspace runtime session.',
          metadata: { clientId, workspaceId, rootHash: rootHash(workspaceRoot!) },
        })
      : undefined

    this.authorize('client.created', actor, 'client', clientId, clientDecision)
    if (workspaceId && workspaceDecision) {
      this.authorize('workspace.created', actor, 'workspace', workspaceId, workspaceDecision)
    }
    if (sessionId && sessionDecision) {
      this.authorize('session.created', actor, 'session', sessionId, sessionDecision)
    }

    try {
      const client = this.options.appState.clients.create({
        clientId,
        name,
        ...(Object.keys(clientMetadata).length > 0 ? { metadata: clientMetadata } : {}),
      })
      let workspace: LocalGatewayWorkspaceRecord | undefined
      let session: LocalGatewaySessionProjection | undefined
      if (workspaceRoot && workspaceId && workspaceName) {
        workspace = this.options.appState.workspaces.create({
          workspaceId,
          clientId,
          name: workspaceName,
          root: workspaceRoot,
        })
        if (sessionId) {
          session = this.options.createSession({
            sessionId,
            workspaceRoot: workspace.root,
            metadata: { clientId, workspaceId },
          })
        }
      }
      this.recordOutcome({
        action: 'client.created',
        actor,
        targetType: 'client',
        targetId: client.clientId,
        metadata: workspace ? { workspaceId: workspace.workspaceId } : undefined,
      })
      if (workspace) {
        this.recordOutcome({
          action: 'workspace.created',
          actor,
          targetType: 'workspace',
          targetId: workspace.workspaceId,
          metadata: { clientId },
        })
      }
      if (session) {
        this.recordOutcome({
          action: 'session.created',
          actor,
          targetType: 'session',
          targetId: session.sessionId,
          sessionId: session.sessionId,
          metadata: { clientId, workspaceId: workspace!.workspaceId },
        })
      }
      return {
        client,
        ...(workspace ? { workspace } : {}),
        ...(session ? { session } : {}),
      }
    } catch (error) {
      this.recordFailure({
        action: 'client.created',
        actor,
        targetType: 'client',
        targetId: clientId,
        topologyHash: clientHash,
      })
      if (workspaceId && workspaceHash) {
        this.recordFailure({
          action: 'workspace.created',
          actor,
          targetType: 'workspace',
          targetId: workspaceId,
          topologyHash: workspaceHash,
        })
      }
      if (sessionId && sessionHash) {
        this.recordFailure({
          action: 'session.created',
          actor,
          targetType: 'session',
          targetId: sessionId,
          topologyHash: sessionHash,
        })
      }
      throw error
    }
  }

  createWorkspaceSession(
    input: CreateLocalGatewayWorkspaceSessionInput,
  ): CreateLocalGatewayWorkspaceSessionResult {
    const clientId = requiredText(input.clientId, 'client id')
    const client = this.options.appState.clients.get(clientId)
    if (!client) throw new Error(`Unknown gateway client: ${clientId}`)
    const name = requiredText(input.name, 'workspace name')
    const workspaceRoot = this.options.resolveWorkspaceRoot(input.workspaceRoot, 'Gateway workspace root')
    const workspaceId = createMainspringRuntimeId('workspace')
    const sessionId = createMainspringRuntimeId('session')
    const workspaceHash = this.workspaceHash({
      workspaceId,
      clientId: client.clientId,
      name,
      root: workspaceRoot,
      status: 'active',
    })
    const sessionHash = this.sessionHash({
      sessionId,
      clientId: client.clientId,
      workspaceId,
      root: workspaceRoot,
    })
    const actor = actorFor(input)
    const workspaceDecision = this.topologyDecision({
      targetType: 'workspace',
      targetId: workspaceId,
      mutation: 'create',
      topologyHash: workspaceHash,
      reason: 'Trusted gateway operator requested workspace topology creation.',
      metadata: { clientId, rootHash: rootHash(workspaceRoot) },
    })
    const sessionDecision = this.topologyDecision({
      targetType: 'session',
      targetId: sessionId,
      mutation: 'create',
      topologyHash: sessionHash,
      reason: 'Trusted gateway operator requested a workspace runtime session.',
      metadata: { clientId, workspaceId, rootHash: rootHash(workspaceRoot) },
    })
    this.authorize('workspace.created', actor, 'workspace', workspaceId, workspaceDecision)
    this.authorize('session.created', actor, 'session', sessionId, sessionDecision)
    try {
      const workspace = this.options.appState.workspaces.create({
        workspaceId,
        clientId: client.clientId,
        name,
        root: workspaceRoot,
      })
      const session = this.options.createSession({
        sessionId,
        workspaceRoot: workspace.root,
        metadata: { clientId: client.clientId, workspaceId: workspace.workspaceId },
      })
      this.recordOutcome({
        action: 'workspace.created',
        actor,
        targetType: 'workspace',
        targetId: workspace.workspaceId,
        metadata: { clientId: client.clientId },
      })
      this.recordOutcome({
        action: 'session.created',
        actor,
        targetType: 'session',
        targetId: session.sessionId,
        sessionId: session.sessionId,
        metadata: { clientId: client.clientId, workspaceId: workspace.workspaceId },
      })
      return { workspace, session }
    } catch (error) {
      this.recordFailure({
        action: 'workspace.created',
        actor,
        targetType: 'workspace',
        targetId: workspaceId,
        topologyHash: workspaceHash,
      })
      this.recordFailure({
        action: 'session.created',
        actor,
        targetType: 'session',
        targetId: sessionId,
        topologyHash: sessionHash,
      })
      throw error
    }
  }

  updateClientWorkspace(
    input: UpdateLocalGatewayClientWorkspaceInput,
  ): UpdateLocalGatewayClientWorkspaceResult {
    const clientId = requiredText(input.clientId, 'client id')
    const existingClient = this.options.appState.clients.get(clientId)
    if (!existingClient) throw new Error(`Unknown gateway client: ${clientId}`)
    const existingClientMetadata = recordValue(existingClient.metadata) ?? {}
    const clientMetadata = {
      ...existingClientMetadata,
      ...(input.contact !== undefined ? { contact: input.contact } : {}),
      ...(input.billingLabel !== undefined ? { billingLabel: input.billingLabel } : {}),
      ...(input.metadata ?? {}),
    }
    const nextClient = {
      name: normalizedText(input.name) ?? existingClient.name,
      status: input.status ?? existingClient.status,
      metadata: clientMetadata,
    }
    const requestedWorkspaceId = normalizedText(input.workspaceId)
    const workspaceFieldsRequested =
      input.workspaceName !== undefined
      || input.workspaceRoot !== undefined
      || input.workspaceStatus !== undefined
    const resolvedWorkspaceId =
      requestedWorkspaceId
      ?? this.options.appState.workspaces.list({ clientId: existingClient.clientId })[0]?.workspaceId
    const existingWorkspace = resolvedWorkspaceId
      ? this.options.appState.workspaces.get(resolvedWorkspaceId)
      : null
    if (workspaceFieldsRequested && !existingWorkspace) {
      throw new Error(`Gateway client ${clientId} has no workspace to update.`)
    }
    if (existingWorkspace && existingWorkspace.clientId !== existingClient.clientId) {
      throw new Error(`Gateway workspace ${existingWorkspace.workspaceId} is not attached to client ${clientId}.`)
    }
    const resolvedWorkspaceRoot = input.workspaceRoot !== undefined
      ? this.options.resolveWorkspaceRoot(input.workspaceRoot, 'Gateway workspace root')
      : undefined
    const workspace = existingWorkspace && workspaceFieldsRequested
      ? {
          workspaceId: existingWorkspace.workspaceId,
          clientId: existingClient.clientId,
          name: normalizedText(input.workspaceName) ?? existingWorkspace.name,
          root: resolvedWorkspaceRoot ?? existingWorkspace.root,
          status: input.workspaceStatus ?? input.status ?? existingWorkspace.status,
          metadata: existingWorkspace.metadata,
        }
      : existingWorkspace ?? undefined
    const clientHash = hashApprovalInput({
      clientId: existingClient.clientId,
      name: nextClient.name,
      status: nextClient.status,
      metadataHash: metadataHash(nextClient.metadata),
      ...(workspace ? { workspaceId: workspace.workspaceId } : {}),
    })
    const previousClientHash = hashApprovalInput({
      clientId: existingClient.clientId,
      name: existingClient.name,
      status: existingClient.status,
      metadataHash: metadataHash(existingClient.metadata),
      ...(existingWorkspace ? { workspaceId: existingWorkspace.workspaceId } : {}),
    })
    const workspaceHash = workspace && workspaceFieldsRequested
      ? this.workspaceHash(workspace)
      : undefined
    const previousWorkspaceHash = existingWorkspace && workspaceFieldsRequested
      ? this.workspaceHash(existingWorkspace)
      : undefined
    const actor = actorFor(input)
    const clientDecision = this.topologyDecision({
      targetType: 'client',
      targetId: existingClient.clientId,
      mutation: 'update',
      topologyHash: clientHash,
      previousTopologyHash: previousClientHash,
      reason: 'Trusted gateway operator requested client topology mutation.',
      metadata: workspace ? { workspaceId: workspace.workspaceId } : undefined,
    })
    const workspaceDecision = workspace && workspaceFieldsRequested && workspaceHash
      ? this.topologyDecision({
          targetType: 'workspace',
          targetId: workspace.workspaceId,
          mutation: 'update',
          topologyHash: workspaceHash,
          previousTopologyHash: previousWorkspaceHash,
          reason: 'Trusted gateway operator requested workspace topology mutation.',
          metadata: { clientId: existingClient.clientId, rootHash: rootHash(workspace.root) },
        })
      : undefined
    this.authorize('client.updated', actor, 'client', existingClient.clientId, clientDecision)
    if (workspaceDecision && workspace) {
      this.authorize('workspace.updated', actor, 'workspace', workspace.workspaceId, workspaceDecision)
    }
    try {
      const client = this.options.appState.clients.update({
        clientId: existingClient.clientId,
        name: nextClient.name,
        status: nextClient.status,
        metadata: clientMetadata,
      })
      const updatedWorkspace = existingWorkspace && workspaceFieldsRequested && workspace
        ? this.options.appState.workspaces.update({
            workspaceId: workspace.workspaceId,
            name: workspace.name,
            root: workspace.root,
            status: workspace.status,
          })
        : existingWorkspace ?? undefined
      this.recordOutcome({
        action: 'client.updated',
        actor,
        targetType: 'client',
        targetId: client.clientId,
        metadata: updatedWorkspace ? { workspaceId: updatedWorkspace.workspaceId } : undefined,
      })
      if (updatedWorkspace && workspaceFieldsRequested) {
        this.recordOutcome({
          action: 'workspace.updated',
          actor,
          targetType: 'workspace',
          targetId: updatedWorkspace.workspaceId,
          metadata: { clientId: client.clientId },
        })
      }
      return {
        client,
        ...(updatedWorkspace ? { workspace: updatedWorkspace } : {}),
      }
    } catch (error) {
      this.recordFailure({
        action: 'client.updated',
        actor,
        targetType: 'client',
        targetId: existingClient.clientId,
        topologyHash: clientHash,
      })
      if (workspace && workspaceFieldsRequested && workspaceHash) {
        this.recordFailure({
          action: 'workspace.updated',
          actor,
          targetType: 'workspace',
          targetId: workspace.workspaceId,
          topologyHash: workspaceHash,
        })
      }
      throw error
    }
  }

  deleteWorkspace(workspaceIdInput: string, actorInput?: string): DeleteLocalGatewayWorkspaceResult {
    const workspaceId = requiredText(workspaceIdInput, 'workspace id')
    const workspace = this.options.appState.workspaces.get(workspaceId)
    if (!workspace) throw new Error(`Unknown gateway workspace: ${workspaceId}`)
    this.assertWorkspaceDeletable(workspaceId)
    const actor = actorFor({ actor: actorInput })
    const topologyHash = this.workspaceHash(workspace)
    const decision = this.topologyDecision({
      targetType: 'workspace',
      targetId: workspaceId,
      mutation: 'delete',
      topologyHash,
      reason: 'Trusted gateway operator requested workspace topology deletion.',
      metadata: workspace.clientId ? { clientId: workspace.clientId, rootHash: rootHash(workspace.root) } : {
        rootHash: rootHash(workspace.root),
      },
    })
    this.authorize('workspace.deleted', actor, 'workspace', workspaceId, decision)
    try {
      this.options.appState.workspaces.delete(workspaceId)
      this.recordOutcome({
        action: 'workspace.deleted',
        actor,
        targetType: 'workspace',
        targetId: workspaceId,
        metadata: workspace.clientId ? { clientId: workspace.clientId } : undefined,
      })
      return { workspaceId, deleted: true }
    } catch (error) {
      this.recordFailure({
        action: 'workspace.deleted',
        actor,
        targetType: 'workspace',
        targetId: workspaceId,
        topologyHash,
      })
      throw error
    }
  }

  deleteClient(clientIdInput: string, actorInput?: string): DeleteLocalGatewayClientResult {
    const clientId = requiredText(clientIdInput, 'client id')
    const client = this.options.appState.clients.get(clientId)
    if (!client) throw new Error(`Unknown gateway client: ${clientId}`)
    if (this.options.appState.workspaces.list({ clientId }).length > 0) {
      throw new Error(`Gateway client ${clientId} cannot be deleted while workspaces are attached.`)
    }
    if (this.hasLinkedRuntimeSession({ clientId })) {
      throw new Error(`Gateway client ${clientId} cannot be deleted while runtime sessions are linked.`)
    }
    if (this.options.appState.budgets.list({ scopeType: 'client', scopeId: clientId }).length > 0) {
      throw new Error(`Gateway client ${clientId} cannot be deleted while budget records exist.`)
    }
    const actor = actorFor({ actor: actorInput })
    const topologyHash = hashApprovalInput({
      clientId: client.clientId,
      name: client.name,
      status: client.status,
      metadataHash: metadataHash(client.metadata),
    })
    const decision = this.topologyDecision({
      targetType: 'client',
      targetId: clientId,
      mutation: 'delete',
      topologyHash,
      reason: 'Trusted gateway operator requested client topology deletion.',
    })
    this.authorize('client.deleted', actor, 'client', clientId, decision)
    try {
      this.options.appState.clients.delete(clientId)
      this.recordOutcome({
        action: 'client.deleted',
        actor,
        targetType: 'client',
        targetId: clientId,
      })
      return { clientId, deleted: true }
    } catch (error) {
      this.recordFailure({
        action: 'client.deleted',
        actor,
        targetType: 'client',
        targetId: clientId,
        topologyHash,
      })
      throw error
    }
  }

  createAgentDraft(input: CreateLocalGatewayAgentDraftInput): LocalGatewayAgentRecord {
    const workspaceId = requiredText(input.workspaceId, 'workspace id')
    const workspace = this.options.appState.workspaces.get(workspaceId)
    if (!workspace) throw new Error(`Unknown gateway workspace: ${workspaceId}`)
    const name = requiredText(input.name, 'agent name')
    const agentId = createMainspringRuntimeId('agent')
    const version = normalizedText(input.version) ?? 'v1'
    const defaultModelId = normalizedText(input.defaultModelId)
    const metadata = this.agentMetadata(input)
    const topologyHash = this.agentHash({
      agentId,
      workspaceId: workspace.workspaceId,
      name,
      version,
      defaultModelId,
      status: 'active',
      metadata,
    })
    const actor = actorFor(input)
    const decision = this.topologyDecision({
      targetType: 'agent',
      targetId: agentId,
      mutation: 'create',
      topologyHash,
      reason: 'Trusted gateway operator requested agent topology creation.',
      metadata: { workspaceId: workspace.workspaceId, metadataHash: metadataHash(metadata) },
    })
    this.authorize('agent.created', actor, 'agent', agentId, decision)
    try {
      const agent = this.options.appState.agents.create({
        agentId,
        workspaceId: workspace.workspaceId,
        name,
        version,
        ...(defaultModelId ? { defaultModelId } : {}),
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      })
      this.recordOutcome({
        action: 'agent.created',
        actor,
        targetType: 'agent',
        targetId: agent.agentId,
        metadata: { workspaceId: workspace.workspaceId },
      })
      return agent
    } catch (error) {
      this.recordFailure({
        action: 'agent.created',
        actor,
        targetType: 'agent',
        targetId: agentId,
        topologyHash,
      })
      throw error
    }
  }

  updateAgentDraft(input: UpdateLocalGatewayAgentDraftInput): LocalGatewayAgentRecord {
    const agentId = requiredText(input.agentId, 'agent id')
    const existing = this.options.appState.agents.get(agentId)
    if (!existing) throw new Error(`Unknown gateway agent: ${agentId}`)
    const metadata = {
      ...(recordValue(existing.metadata) ?? {}),
      ...this.agentMetadata(input),
    }
    const next = {
      agentId: existing.agentId,
      workspaceId: existing.workspaceId,
      name: normalizedText(input.name) ?? existing.name,
      version: normalizedText(input.version) ?? existing.version,
      defaultModelId: normalizedText(input.defaultModelId) ?? existing.defaultModelId,
      status: existing.status,
      metadata,
    }
    const topologyHash = this.agentHash(next)
    const previousTopologyHash = this.agentHash({
      agentId: existing.agentId,
      workspaceId: existing.workspaceId,
      name: existing.name,
      version: existing.version,
      defaultModelId: existing.defaultModelId,
      status: existing.status,
      metadata: recordValue(existing.metadata) ?? undefined,
    })
    const actor = actorFor(input)
    const decision = this.topologyDecision({
      targetType: 'agent',
      targetId: existing.agentId,
      mutation: 'update',
      topologyHash,
      previousTopologyHash,
      reason: 'Trusted gateway operator requested agent topology mutation.',
      metadata: existing.workspaceId ? { workspaceId: existing.workspaceId, metadataHash: metadataHash(metadata) } : {
        metadataHash: metadataHash(metadata),
      },
    })
    this.authorize('agent.updated', actor, 'agent', existing.agentId, decision)
    try {
      const updated = this.options.appState.agents.update({
        agentId: existing.agentId,
        ...(normalizedText(input.name) ? { name: normalizedText(input.name) } : {}),
        ...(normalizedText(input.version) ? { version: normalizedText(input.version) } : {}),
        ...(normalizedText(input.defaultModelId) ? { defaultModelId: normalizedText(input.defaultModelId) } : {}),
        metadata,
      })
      this.recordOutcome({
        action: 'agent.updated',
        actor,
        targetType: 'agent',
        targetId: updated.agentId,
        metadata: updated.workspaceId ? { workspaceId: updated.workspaceId } : undefined,
      })
      return updated
    } catch (error) {
      this.recordFailure({
        action: 'agent.updated',
        actor,
        targetType: 'agent',
        targetId: existing.agentId,
        topologyHash,
      })
      throw error
    }
  }

  private agentMetadata(
    input: CreateLocalGatewayAgentDraftInput | UpdateLocalGatewayAgentDraftInput,
  ): Record<string, unknown> {
    return {
      ...(input.instructions ? { instructions: input.instructions } : {}),
      ...(input.outcome ? { outcome: input.outcome } : {}),
      ...(input.voice ? { voice: input.voice } : {}),
      ...(input.approvalMode ? { approvalMode: input.approvalMode } : {}),
      ...(input.modelLabel ? { modelLabel: input.modelLabel } : {}),
      ...(input.skills ? { skills: input.skills } : {}),
      ...(input.metadata ?? {}),
    }
  }

  private assertWorkspaceDeletable(workspaceId: string): void {
    if (this.options.appState.agents.list({ workspaceId }).length > 0) {
      throw new Error(`Workspace ${workspaceId} cannot be deleted while agents are attached.`)
    }
    if (this.options.appState.runs.list().some((run) => run.workspaceId === workspaceId)) {
      throw new Error(`Workspace ${workspaceId} cannot be deleted while run metadata exists.`)
    }
    if (this.options.appState.approvals.list().some((approval) => approval.workspaceId === workspaceId)) {
      throw new Error(`Workspace ${workspaceId} cannot be deleted while approval metadata exists.`)
    }
    if (this.options.appState.artifacts.list().some((artifact) => artifact.workspaceId === workspaceId)) {
      throw new Error(`Workspace ${workspaceId} cannot be deleted while artifacts exist.`)
    }
    if (this.options.appState.usageLedger.list().some((entry) => entry.workspaceId === workspaceId)) {
      throw new Error(`Workspace ${workspaceId} cannot be deleted while usage entries exist.`)
    }
    if (this.options.appState.budgets.list({ scopeType: 'workspace', scopeId: workspaceId }).length > 0) {
      throw new Error(`Workspace ${workspaceId} cannot be deleted while budget records exist.`)
    }
    if (this.hasLinkedRuntimeSession({ workspaceId })) {
      throw new Error(`Workspace ${workspaceId} cannot be deleted while runtime sessions are linked.`)
    }
  }

  private hasLinkedRuntimeSession(input: { clientId?: string; workspaceId?: string }): boolean {
    return this.options.listRuntimeSessions().some((session) => {
      const metadata = recordValue(session.metadata)
      return Boolean(
        (input.workspaceId && metadata?.workspaceId === input.workspaceId)
        || (input.clientId && metadata?.clientId === input.clientId),
      )
    })
  }

  private workspaceHash(input: {
    workspaceId: string
    clientId?: string
    name: string
    root: string
    status: LocalGatewayWorkspaceRecord['status']
    metadata?: Record<string, unknown>
  }): string {
    return hashApprovalInput({
      workspaceId: input.workspaceId,
      ...(input.clientId ? { clientId: input.clientId } : {}),
      name: input.name,
      rootHash: rootHash(input.root),
      status: input.status,
      metadataHash: metadataHash(input.metadata),
    })
  }

  private sessionHash(input: {
    sessionId: string
    clientId: string
    workspaceId: string
    root: string
  }): string {
    return hashApprovalInput({
      sessionId: input.sessionId,
      clientId: input.clientId,
      workspaceId: input.workspaceId,
      rootHash: rootHash(input.root),
    })
  }

  private agentHash(input: {
    agentId: string
    workspaceId?: string
    name: string
    version: string
    defaultModelId?: string
    status: LocalGatewayAgentRecord['status']
    metadata?: Record<string, unknown>
  }): string {
    return hashApprovalInput({
      agentId: input.agentId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      name: input.name,
      version: input.version,
      ...(input.defaultModelId ? { defaultModelId: input.defaultModelId } : {}),
      status: input.status,
      metadataHash: metadataHash(input.metadata),
    })
  }

  private topologyDecision(input: {
    targetType: 'client' | 'workspace' | 'agent' | 'session'
    targetId: string
    mutation: TopologyMutation
    topologyHash: string
    previousTopologyHash?: string
    reason: string
    metadata?: Record<string, unknown>
  }): DecisionRecord {
    return createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'topology',
      operation: 'topology.write',
      targetKey: input.targetId,
      state: 'allow',
      reasons: [input.reason],
      permissionCategories: ['topology', 'operator-control-plane'],
      input: {
        targetType: input.targetType,
        targetId: input.targetId,
        mutation: input.mutation,
        topologyHash: input.topologyHash,
        ...(input.previousTopologyHash
          ? { previousTopologyHash: input.previousTopologyHash }
          : {}),
      },
      metadata: {
        targetType: input.targetType,
        mutation: input.mutation,
        topologyHash: input.topologyHash,
        ...(input.previousTopologyHash
          ? { previousTopologyHash: input.previousTopologyHash }
          : {}),
        ...(input.metadata ?? {}),
      },
    })
  }

  private authorize(
    action: string,
    actor: string,
    targetType: string,
    targetId: string,
    decision: DecisionRecord,
  ): void {
    this.options.appState.auditEvents.create({
      category: 'gateway',
      action: `${action}.authorized`,
      actor,
      targetType,
      targetId,
      ...(targetType === 'session' ? { sessionId: targetId } : {}),
      metadata: decisionMetadata(decision),
    })
  }

  private recordOutcome(input: {
    action: string
    actor: string
    targetType: string
    targetId: string
    sessionId?: string
    metadata?: Record<string, unknown>
  }): void {
    this.options.appState.auditEvents.create({
      category: 'gateway',
      action: input.action,
      actor: input.actor,
      targetType: input.targetType,
      targetId: input.targetId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    })
  }

  private recordFailure(input: {
    action: string
    actor: string
    targetType: string
    targetId: string
    topologyHash: string
  }): void {
    this.options.appState.auditEvents.create({
      category: 'gateway',
      action: `${input.action}.failed`,
      actor: input.actor,
      targetType: input.targetType,
      targetId: input.targetId,
      ...(input.targetType === 'session' ? { sessionId: input.targetId } : {}),
      metadata: { topologyHash: input.topologyHash },
    })
  }
}
