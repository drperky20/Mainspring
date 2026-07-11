import { createMainspringRuntimeId } from '#protocol'
import { hashApprovalInput } from '../policy/ApprovalReceipt.js'
import { createHostDecisionRecord, type DecisionRecord } from '../policy/DecisionRecord.js'
import {
  installLocalMarketplaceTemplateRecord,
  listLocalMarketplaceTemplates,
  type LocalMarketplaceTemplateRecord,
  type MarketplaceTemplateRecord,
  consoleApprovalMode,
  skillFlagsFromAllowedTools,
} from './TemplateMarketplace.js'
import {
  installVerifiedRemoteMarketplaceTemplate,
  type RemoteMarketplaceRegistry,
  type VerifiedRemoteMarketplaceTemplate,
} from './RemoteMarketplace.js'
import type { LocalGatewayAppStateStore } from './AppStateStore.js'
import { GatewayTopologyControl } from './GatewayTopologyControl.js'
import type {
  InstallLocalMarketplaceTemplateInput,
  InstallLocalMarketplaceTemplateResult,
} from './LocalGateway.js'

export interface GatewayMarketplaceControlOptions {
  appState: LocalGatewayAppStateStore
  repoRoot: string
  workspaceBaseRoot: string
  remoteMarketplace: RemoteMarketplaceRegistry | null
  topology: GatewayTopologyControl
  resolveWorkspaceRoot: (value: string, label: string) => string
  resolveRuntimeProfile: (profileId: string | undefined) => string | undefined
  installLocalTemplate?: (input: {
    template: LocalMarketplaceTemplateRecord
    workspaceRoot: string
    workspaceBaseRoot: string
  }) => string[]
  installRemoteTemplate?: (input: {
    template: VerifiedRemoteMarketplaceTemplate
    workspaceRoot: string
    workspaceBaseRoot: string
  }) => string[]
}

function normalizedText(value: string | undefined): string | undefined {
  const text = value?.trim()
  return text || undefined
}

function actorFor(input: { actor?: string }): string {
  return normalizedText(input.actor) ?? 'local-gateway'
}

function decisionMetadata(decision: DecisionRecord): Record<string, unknown> {
  return { decisionRecord: decision }
}

function templatePublisherMetadata(template: MarketplaceTemplateRecord): Record<string, unknown> {
  return 'publisherId' in template
    ? {
        templatePublisherId: template.publisherId,
        templateKeyId: template.keyId,
        templateCatalogHash: template.catalogHash,
      }
    : {}
}

/**
 * Owns verified marketplace installation authority. Template verification and
 * path containment stay in the marketplace modules, while this seam binds the
 * file write and the client/workspace/agent provisioning chain to one durable,
 * hash-only host decision and one trusted operator identity.
 */
export class GatewayMarketplaceControl {
  constructor(private readonly options: GatewayMarketplaceControlOptions) {}

  async syncRemoteCatalogs(actorInput?: string): Promise<MarketplaceTemplateRecord[]> {
    const localTemplates = listLocalMarketplaceTemplates(this.options.repoRoot)
    if (!this.options.remoteMarketplace) return localTemplates
    const syncId = createMainspringRuntimeId('marketplace_sync')
    const sourceBindingHash = this.options.remoteMarketplace.sourceBindingHash()
    const reservedTemplateIdHash = hashApprovalInput(
      localTemplates.map((template) => template.templateId),
    )
    const actor = actorFor({ actor: actorInput })
    const decision = createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'marketplace',
      operation: 'marketplace.catalog.sync',
      targetKey: syncId,
      state: 'allow',
      reasons: ['Trusted gateway operator requested synchronization of pinned remote marketplace catalogs.'],
      permissionCategories: ['marketplace', 'network', 'operator-control-plane'],
      input: {
        syncId,
        sourceBindingHash,
        reservedTemplateIdHash,
      },
      metadata: {
        syncId,
        sourceBindingHash,
        reservedTemplateIdHash,
      },
    })
    this.options.appState.auditEvents.create({
      category: 'marketplace',
      action: 'remote-catalogs.sync.authorized',
      actor,
      targetType: 'remote-marketplace',
      targetId: 'configured-catalogs',
      metadata: decisionMetadata(decision),
    })
    try {
      const remoteTemplates = await this.options.remoteMarketplace.sync(
        new Set(localTemplates.map((template) => template.templateId)),
      )
      this.options.appState.auditEvents.create({
        category: 'marketplace',
        action: 'remote-catalogs.synced',
        actor,
        targetType: 'remote-marketplace',
        targetId: 'configured-catalogs',
        metadata: {
          templateCount: remoteTemplates.length,
          decisionId: decision.decisionId,
          sourceBindingHash,
        },
      })
      return [...localTemplates, ...remoteTemplates]
    } catch (error) {
      this.options.appState.auditEvents.create({
        category: 'marketplace',
        action: 'remote-catalogs.sync.failed',
        actor,
        targetType: 'remote-marketplace',
        targetId: 'configured-catalogs',
        metadata: {
          decisionId: decision.decisionId,
          sourceBindingHash,
        },
      })
      throw error
    }
  }

  install(input: InstallLocalMarketplaceTemplateInput): InstallLocalMarketplaceTemplateResult {
    const workspaceRoot = this.options.resolveWorkspaceRoot(
      input.workspaceRoot,
      'Marketplace workspace root',
    )
    const remoteTemplate = this.options.remoteMarketplace?.get(input.templateId)
    const template = remoteTemplate ?? this.localTemplate(input.templateId)
    const runtimeProfile = this.options.resolveRuntimeProfile(template.runtimeProfile)
    const clientName = normalizedText(input.clientName) ?? template.defaults.clientName
    const workspaceName = normalizedText(input.workspaceName) ?? template.defaults.workspaceName
    const agentName = normalizedText(input.agentName) ?? template.defaults.agentName
    const installId = createMainspringRuntimeId('marketplace_install')
    const templateHash = hashApprovalInput(template)
    const workspaceRootHash = hashApprovalInput({ root: workspaceRoot })
    const customizationHash = hashApprovalInput({ clientName, workspaceName, agentName })
    const actor = actorFor(input)
    const decision = createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'marketplace',
      operation: 'marketplace.install',
      targetKey: installId,
      state: 'allow',
      reasons: ['Trusted gateway operator requested installation of a verified marketplace template.'],
      permissionCategories: ['marketplace', 'workspace-write', 'operator-control-plane'],
      input: {
        installId,
        templateId: template.templateId,
        provenance: template.provenance,
        templateHash,
        workspaceRootHash,
        customizationHash,
      },
      metadata: {
        installId,
        templateId: template.templateId,
        provenance: template.provenance,
        templateHash,
        workspaceRootHash,
        customizationHash,
      },
    })
    this.options.appState.auditEvents.create({
      category: 'marketplace',
      action: 'template.install.authorized',
      actor,
      targetType: 'template',
      targetId: template.templateId,
      metadata: decisionMetadata(decision),
    })

    try {
      const installedFiles = remoteTemplate
        ? this.installRemote({
            template: remoteTemplate,
            workspaceRoot,
          })
        : this.installLocal({
            template: template as LocalMarketplaceTemplateRecord,
            workspaceRoot,
          })
      const topologyMetadata = {
        templateId: template.templateId,
        templateProvenance: template.provenance,
        ...templatePublisherMetadata(template),
      }
      const created = this.options.topology.createClientWorkspace({
        name: clientName,
        workspaceRoot,
        workspaceName,
        metadata: topologyMetadata,
        actor,
      })
      if (!created.workspace) {
        throw new Error('Marketplace install requires a workspace-backed client result.')
      }
      const agent = this.options.topology.createAgentDraft({
        workspaceId: created.workspace.workspaceId,
        name: agentName,
        ...(template.modelId ? { defaultModelId: template.modelId } : {}),
        instructions: template.defaults.instructions,
        outcome: template.defaults.outcome,
        voice: template.defaults.voice,
        approvalMode: consoleApprovalMode(template.approvalMode),
        skills: skillFlagsFromAllowedTools(template.allowedTools),
        metadata: {
          ...topologyMetadata,
          allowedTools: template.allowedTools,
          ...(runtimeProfile ? { runtimeProfile } : {}),
          ...(template.providerId ? { providerId: template.providerId } : {}),
        },
        actor,
      })
      this.options.appState.auditEvents.create({
        category: 'marketplace',
        action: 'template.installed',
        actor,
        targetType: 'template',
        targetId: template.templateId,
        ...(created.session ? { sessionId: created.session.sessionId } : {}),
        metadata: {
          clientId: created.client.clientId,
          workspaceId: created.workspace.workspaceId,
          agentId: agent.agentId,
          installedFiles,
          decisionId: decision.decisionId,
          templateHash,
        },
      })
      return {
        template,
        client: created.client,
        workspace: created.workspace,
        session: created.session,
        agent,
        installedFiles,
      }
    } catch (error) {
      this.options.appState.auditEvents.create({
        category: 'marketplace',
        action: 'template.install.failed',
        actor,
        targetType: 'template',
        targetId: template.templateId,
        metadata: {
          decisionId: decision.decisionId,
          templateHash,
        },
      })
      throw error
    }
  }

  private localTemplate(templateId: string): LocalMarketplaceTemplateRecord {
    const template = listLocalMarketplaceTemplates(this.options.repoRoot).find(
      (candidate) => candidate.templateId === templateId,
    )
    if (!template) throw new Error(`Unknown marketplace template: ${templateId}`)
    return template
  }

  private installLocal(input: {
    template: LocalMarketplaceTemplateRecord
    workspaceRoot: string
  }): string[] {
    if (this.options.installLocalTemplate) {
      return this.options.installLocalTemplate({
        template: input.template,
        workspaceRoot: input.workspaceRoot,
        workspaceBaseRoot: this.options.workspaceBaseRoot,
      })
    }
    return installLocalMarketplaceTemplateRecord({
      repoRoot: this.options.repoRoot,
      template: input.template,
      workspaceRoot: input.workspaceRoot,
      workspaceBaseRoot: this.options.workspaceBaseRoot,
    }).installedFiles
  }

  private installRemote(input: {
    template: VerifiedRemoteMarketplaceTemplate
    workspaceRoot: string
  }): string[] {
    if (this.options.installRemoteTemplate) {
      return this.options.installRemoteTemplate({
        template: input.template,
        workspaceRoot: input.workspaceRoot,
        workspaceBaseRoot: this.options.workspaceBaseRoot,
      })
    }
    return installVerifiedRemoteMarketplaceTemplate({
      template: input.template,
      workspaceRoot: input.workspaceRoot,
      workspaceBaseRoot: this.options.workspaceBaseRoot,
    })
  }
}
