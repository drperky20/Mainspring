import { createMainspringRuntimeId } from '#protocol'
import { hashApprovalInput } from '../policy/ApprovalReceipt.js'
import { createHostDecisionRecord, type DecisionRecord } from '../policy/DecisionRecord.js'
import type {
  CreateLocalGatewayProviderProfileInput,
  LocalGatewayAppStateStore,
  LocalGatewayProviderProfileRecord,
  UpdateLocalGatewayProviderProfileInput,
} from './AppStateStore.js'

export interface CreateLocalGatewayProviderProfileDraftInput {
  providerId: string
  label: string
  secretRef?: string
  secretValue?: string
  defaultModelId?: string
  metadata?: Record<string, unknown>
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface UpdateLocalGatewayProviderProfileDraftInput {
  profileId: string
  providerId?: string
  label?: string
  secretRef?: string
  secretValue?: string
  defaultModelId?: string
  status?: LocalGatewayProviderProfileRecord['status']
  metadata?: Record<string, unknown>
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface GatewayProviderProfileControlOptions {
  appState: LocalGatewayAppStateStore
}

type ProviderProfileMutation = 'create' | 'update'
type CredentialMode = 'managed' | 'reference'

interface NormalizedCredential {
  mode: CredentialMode
  hash: string
  secretRef?: string
  secretValue?: string
  provided: boolean
}

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

function profileStatus(
  value: LocalGatewayProviderProfileRecord['status'] | undefined,
): LocalGatewayProviderProfileRecord['status'] {
  const status = value ?? 'active'
  if (status !== 'active' && status !== 'archived') {
    throw new Error('Provider profile status must be active or archived.')
  }
  return status
}

function normalizedCredential(input: {
  secretRef?: string
  secretValue?: string
  existingSecretRef?: string
}): NormalizedCredential {
  const secretRef = input.secretRef === undefined
    ? undefined
    : requiredText(input.secretRef, 'provider profile secret ref')
  const secretValue = input.secretValue === undefined
    ? undefined
    : requiredText(input.secretValue, 'provider profile managed secret value')
  if (secretValue) {
    return {
      mode: 'managed',
      hash: hashApprovalInput({ mode: 'managed', secretValue }),
      ...(secretRef ? { secretRef } : {}),
      secretValue,
      provided: true,
    }
  }
  if (secretRef) {
    return {
      mode: secretRef.startsWith('managed:') ? 'managed' : 'reference',
      hash: hashApprovalInput({ mode: 'reference', secretRef }),
      secretRef,
      provided: true,
    }
  }
  const existingSecretRef = normalizedText(input.existingSecretRef)
  if (existingSecretRef) {
    return {
      mode: existingSecretRef.startsWith('managed:') ? 'managed' : 'reference',
      hash: hashApprovalInput({ mode: 'existing', secretRef: existingSecretRef }),
      secretRef: existingSecretRef,
      provided: false,
    }
  }
  throw new Error('Provider profile secret ref or managed secret value is required.')
}

function providerProfileBinding(input: {
  profileId: string
  providerId: string
  label: string
  credentialHash: string
  credentialMode: CredentialMode
  defaultModelId?: string
  status: LocalGatewayProviderProfileRecord['status']
  metadata?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    profileId: input.profileId,
    providerId: input.providerId,
    label: input.label,
    credentialHash: input.credentialHash,
    credentialMode: input.credentialMode,
    ...(input.defaultModelId ? { defaultModelId: input.defaultModelId } : {}),
    status: input.status,
    metadataHash: hashApprovalInput(input.metadata),
  }
}

function providerProfileHash(input: Parameters<typeof providerProfileBinding>[0]): string {
  return hashApprovalInput(providerProfileBinding(input))
}

function decisionMetadata(decision: DecisionRecord): Record<string, unknown> {
  return { decisionRecord: decision }
}

/**
 * Owns provider-profile and managed-secret configuration authority. The
 * gateway facade delegates here so a hash-only host decision is durable before
 * provider configuration can change, while secret material remains host-side.
 */
export class GatewayProviderProfileControl {
  constructor(private readonly options: GatewayProviderProfileControlOptions) {}

  create(input: CreateLocalGatewayProviderProfileDraftInput): LocalGatewayProviderProfileRecord {
    const profileId = createMainspringRuntimeId('provider_profile')
    const providerId = requiredText(input.providerId, 'provider id')
    const label = requiredText(input.label, 'provider profile label')
    const credential = normalizedCredential(input)
    const defaultModelId = normalizedText(input.defaultModelId)
    const status = 'active' as const
    const bindingHash = providerProfileHash({
      profileId,
      providerId,
      label,
      credentialHash: credential.hash,
      credentialMode: credential.mode,
      ...(defaultModelId ? { defaultModelId } : {}),
      status,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    })
    const actor = actorFor(input)
    const decision = this.profileDecision({
      profileId,
      bindingHash,
      mutation: 'create',
      credentialMode: credential.mode,
      reason: 'Trusted gateway operator created a provider profile.',
    })
    this.authorize({ action: 'provider-profile.created', actor, profileId, decision })
    try {
      const profile = this.options.appState.providerProfiles.create({
        profileId,
        providerId,
        label,
        ...(credential.secretRef ? { secretRef: credential.secretRef } : {}),
        ...(credential.secretValue ? { secretValue: credential.secretValue } : {}),
        ...(defaultModelId ? { defaultModelId } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      })
      this.recordOutcome({
        action: 'provider-profile.created',
        actor,
        profile,
        decision,
        bindingHash,
        credentialMode: credential.mode,
      })
      return profile
    } catch (error) {
      this.recordFailure({
        action: 'provider-profile.created',
        actor,
        profileId,
        decision,
        bindingHash,
      })
      throw error
    }
  }

  update(input: UpdateLocalGatewayProviderProfileDraftInput): LocalGatewayProviderProfileRecord {
    const existing = this.requireProfile(input.profileId)
    const providerId = input.providerId === undefined
      ? existing.providerId
      : requiredText(input.providerId, 'provider id')
    const label = input.label === undefined
      ? existing.label
      : requiredText(input.label, 'provider profile label')
    const credential = normalizedCredential({
      secretRef: input.secretRef,
      secretValue: input.secretValue,
      existingSecretRef: existing.secretRef,
    })
    const defaultModelId = input.defaultModelId === undefined
      ? existing.defaultModelId
      : requiredText(input.defaultModelId, 'provider profile default model id')
    const status = profileStatus(input.status ?? existing.status)
    const metadata = input.metadata ?? existing.metadata
    const previousHash = providerProfileHash({
      profileId: existing.profileId,
      providerId: existing.providerId,
      label: existing.label,
      credentialHash: hashApprovalInput({ mode: 'existing', secretRef: existing.secretRef }),
      credentialMode: existing.secretRef.startsWith('managed:') ? 'managed' : 'reference',
      ...(existing.defaultModelId ? { defaultModelId: existing.defaultModelId } : {}),
      status: existing.status,
      ...(existing.metadata ? { metadata: existing.metadata } : {}),
    })
    const bindingHash = providerProfileHash({
      profileId: existing.profileId,
      providerId,
      label,
      credentialHash: credential.hash,
      credentialMode: credential.mode,
      ...(defaultModelId ? { defaultModelId } : {}),
      status,
      ...(metadata ? { metadata } : {}),
    })
    const actor = actorFor(input)
    const decision = this.profileDecision({
      profileId: existing.profileId,
      bindingHash,
      previousHash,
      mutation: 'update',
      credentialMode: credential.mode,
      reason: 'Trusted gateway operator updated a provider profile.',
    })
    this.authorize({
      action: 'provider-profile.updated',
      actor,
      profileId: existing.profileId,
      decision,
    })
    try {
      const patch: UpdateLocalGatewayProviderProfileInput = {
        profileId: existing.profileId,
        providerId,
        label,
        ...(credential.provided && credential.secretRef ? { secretRef: credential.secretRef } : {}),
        ...(credential.provided && credential.secretValue ? { secretValue: credential.secretValue } : {}),
        ...(input.defaultModelId === undefined ? {} : { defaultModelId }),
        status,
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      }
      const profile = this.options.appState.providerProfiles.update(patch)
      this.recordOutcome({
        action: 'provider-profile.updated',
        actor,
        profile,
        decision,
        bindingHash,
        credentialMode: credential.mode,
      })
      return profile
    } catch (error) {
      this.recordFailure({
        action: 'provider-profile.updated',
        actor,
        profileId: existing.profileId,
        decision,
        bindingHash,
      })
      throw error
    }
  }

  private requireProfile(profileIdInput: string): LocalGatewayProviderProfileRecord {
    const profileId = requiredText(profileIdInput, 'provider profileId')
    const profile = this.options.appState.providerProfiles.get(profileId)
    if (!profile) throw new Error(`Unknown gateway provider profile: ${profileId}`)
    return profile
  }

  private profileDecision(input: {
    profileId: string
    bindingHash: string
    previousHash?: string
    mutation: ProviderProfileMutation
    credentialMode: CredentialMode
    reason: string
  }): DecisionRecord {
    return createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'provider_config',
      operation: 'provider_config.write',
      targetKey: input.profileId,
      state: 'allow',
      reasons: [input.reason],
      permissionCategories: ['provider-config', 'secrets', 'operator-control-plane'],
      input: {
        profileId: input.profileId,
        mutation: input.mutation,
        providerProfileHash: input.bindingHash,
        ...(input.previousHash ? { previousProviderProfileHash: input.previousHash } : {}),
      },
      metadata: {
        mutation: input.mutation,
        credentialMode: input.credentialMode,
        providerProfileHash: input.bindingHash,
        ...(input.previousHash ? { previousProviderProfileHash: input.previousHash } : {}),
      },
    })
  }

  private authorize(input: {
    action: 'provider-profile.created' | 'provider-profile.updated'
    actor: string
    profileId: string
    decision: DecisionRecord
  }): void {
    this.options.appState.auditEvents.create({
      category: 'gateway',
      action: `${input.action}.authorized`,
      actor: input.actor,
      targetType: 'provider-profile',
      targetId: input.profileId,
      metadata: decisionMetadata(input.decision),
    })
  }

  private recordOutcome(input: {
    action: 'provider-profile.created' | 'provider-profile.updated'
    actor: string
    profile: LocalGatewayProviderProfileRecord
    decision: DecisionRecord
    bindingHash: string
    credentialMode: CredentialMode
  }): void {
    this.options.appState.auditEvents.create({
      category: 'gateway',
      action: input.action,
      actor: input.actor,
      targetType: 'provider-profile',
      targetId: input.profile.profileId,
      metadata: {
        ...decisionMetadata(input.decision),
        decisionId: input.decision.decisionId,
        providerProfileHash: input.bindingHash,
        credentialMode: input.credentialMode,
        status: input.profile.status,
      },
    })
  }

  private recordFailure(input: {
    action: 'provider-profile.created' | 'provider-profile.updated'
    actor: string
    profileId: string
    decision: DecisionRecord
    bindingHash: string
  }): void {
    this.options.appState.auditEvents.create({
      category: 'gateway',
      action: `${input.action}.failed`,
      actor: input.actor,
      targetType: 'provider-profile',
      targetId: input.profileId,
      metadata: {
        decisionId: input.decision.decisionId,
        providerProfileHash: input.bindingHash,
      },
    })
  }
}
