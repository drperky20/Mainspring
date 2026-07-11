import { hashApprovalInput } from '../policy/ApprovalReceipt.js'
import { createHostDecisionRecord, type DecisionRecord } from '../policy/DecisionRecord.js'
import {
  applyApprovedMemoryReview,
  applyApprovedSkillReview,
  createProvenanceReviewQueue,
  type ProvenanceReviewItem,
  type ProvenanceReviewStatus,
} from '../provenance/ProvenanceReview.js'
import type {
  LocalGatewayAppStateStore,
  LocalGatewayWorkspaceRecord,
} from './AppStateStore.js'

export interface LocalGatewayProvenanceReviewListInput {
  workspaceId: string
  status?: ProvenanceReviewStatus
}

export interface LocalGatewayProvenanceReviewDecisionInput {
  workspaceId: string
  reviewId: string
  decision: Extract<ProvenanceReviewStatus, 'approved' | 'rejected'>
  /** Legacy/local-dev attribution. A trusted actor always takes precedence. */
  reviewer?: string
  reason?: string
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export interface LocalGatewayProvenanceReviewApplyInput {
  workspaceId: string
  reviewId: string
  /** Legacy/local-dev attribution. A trusted actor always takes precedence. */
  reviewer?: string
  /** Trusted gateway identity. HTTP callers cannot set this directly. */
  actor?: string
}

export type LocalGatewayAppliedProvenanceReview =
  | { kind: 'memory'; reviewId: string; memoryId: string; applied: true }
  | { kind: 'skill'; reviewId: string; skillKey: string; action: 'installed' | 'updated'; applied: true }

export interface GatewayProvenanceReviewControlOptions {
  appState: LocalGatewayAppStateStore
  applyMemoryReview?: typeof applyApprovedMemoryReview
  applySkillReview?: typeof applyApprovedSkillReview
}

function decisionMetadata(decision: DecisionRecord): Record<string, unknown> {
  return { decisionRecord: decision }
}

function normalizedText(value: string | undefined): string | undefined {
  const text = value?.trim()
  return text || undefined
}

function reviewHash(item: ProvenanceReviewItem): string {
  return hashApprovalInput({
    reviewId: item.reviewId,
    kind: item.kind,
    source: item.source,
    mutation: item.mutation,
    scan: item.scan,
    createdAt: item.createdAt,
  })
}

/**
 * Owns the mutable provenance-review boundary. The gateway facade delegates
 * here so review decisions and memory/skill applies receive durable,
 * hash-only host authority evidence before a review journal or workspace
 * artifact can change.
 */
export class GatewayProvenanceReviewControl {
  constructor(private readonly options: GatewayProvenanceReviewControlOptions) {}

  list(input: LocalGatewayProvenanceReviewListInput): ProvenanceReviewItem[] {
    const workspace = this.requireWorkspace(input.workspaceId)
    const items = createProvenanceReviewQueue(workspace.root).list()
    return input.status ? items.filter((item) => item.status === input.status) : items
  }

  decide(input: LocalGatewayProvenanceReviewDecisionInput): ProvenanceReviewItem {
    const workspace = this.requireWorkspace(input.workspaceId)
    const reviewId = this.requireReviewId(input.reviewId)
    const queue = createProvenanceReviewQueue(workspace.root)
    const item = this.requireReview(queue.get(reviewId), reviewId)
    this.assertDecisionCanProceed(item, input.decision)
    const actor = this.actor(input)
    const reason = normalizedText(input.reason)
    const itemHash = reviewHash(item)
    const decision = createHostDecisionRecord({
      runId: 'gateway-control-plane',
      surface: 'provenance',
      operation: 'provenance.review.decide',
      targetKey: reviewId,
      state: 'allow',
      reasons: [
        input.decision === 'approved'
          ? 'Trusted gateway operator approved a staged provenance review.'
          : 'Trusted gateway operator rejected a staged provenance review.',
      ],
      permissionCategories: ['provenance', 'workspace-write', 'operator-control-plane'],
      input: {
        workspaceId: workspace.workspaceId,
        reviewId,
        decision: input.decision,
        reviewHash: itemHash,
        ...(reason ? { reasonHash: hashApprovalInput(reason) } : {}),
      },
      metadata: {
        workspaceId: workspace.workspaceId,
        kind: item.kind,
        priorStatus: item.status,
        requestedDecision: input.decision,
        reviewHash: itemHash,
        scanStatus: item.scan.status,
      },
    })
    this.options.appState.auditEvents.create({
      category: 'provenance',
      action: `review.${input.decision}.authorized`,
      actor,
      targetType: 'provenance-review',
      targetId: reviewId,
      metadata: decisionMetadata(decision),
    })
    try {
      const decided = queue.decide({
        reviewId,
        decision: input.decision,
        reviewer: actor,
        ...(reason ? { reason } : {}),
      })
      this.options.appState.auditEvents.create({
        category: 'provenance',
        action: `review.${input.decision}`,
        actor,
        targetType: 'provenance-review',
        targetId: reviewId,
        metadata: {
          workspaceId: workspace.workspaceId,
          kind: decided.kind,
          status: decided.status,
          decisionId: decision.decisionId,
          reviewHash: itemHash,
        },
      })
      return decided
    } catch (error) {
      this.options.appState.auditEvents.create({
        category: 'provenance',
        action: `review.${input.decision}.failed`,
        actor,
        targetType: 'provenance-review',
        targetId: reviewId,
        metadata: {
          workspaceId: workspace.workspaceId,
          kind: item.kind,
          decisionId: decision.decisionId,
          reviewHash: itemHash,
        },
      })
      throw error
    }
  }

  apply(input: LocalGatewayProvenanceReviewApplyInput): LocalGatewayAppliedProvenanceReview {
    const workspace = this.requireWorkspace(input.workspaceId)
    const reviewId = this.requireReviewId(input.reviewId)
    const queue = createProvenanceReviewQueue(workspace.root)
    const item = this.requireReview(queue.get(reviewId), reviewId)
    if (item.status !== 'approved' && item.status !== 'applied') {
      throw new Error('Provenance review item must be approved before apply.')
    }
    const actor = this.actor(input)
    const itemHash = reviewHash(item)
    const isReplay = item.status === 'applied'
    const decision = isReplay
      ? undefined
      : createHostDecisionRecord({
          runId: 'gateway-control-plane',
          surface: 'provenance',
          operation: 'provenance.review.apply',
          targetKey: reviewId,
          state: 'allow',
          reasons: ['Trusted gateway operator applied an approved staged provenance mutation.'],
          permissionCategories: [
            'provenance',
            'workspace-write',
            'side-effecting',
            'operator-control-plane',
          ],
          input: {
            workspaceId: workspace.workspaceId,
            reviewId,
            kind: item.kind,
            reviewHash: itemHash,
          },
          metadata: {
            workspaceId: workspace.workspaceId,
            kind: item.kind,
            priorStatus: item.status,
            reviewHash: itemHash,
            scanStatus: item.scan.status,
          },
        })
    if (decision) {
      this.options.appState.auditEvents.create({
        category: 'provenance',
        action: 'review.apply.authorized',
        actor,
        targetType: 'provenance-review',
        targetId: reviewId,
        metadata: decisionMetadata(decision),
      })
    }
    try {
      const applied = item.mutation.kind === 'memory'
        ? {
            kind: 'memory' as const,
            ...(this.options.applyMemoryReview ?? applyApprovedMemoryReview)({
              workspaceRoot: workspace.root,
              reviewId,
              reviewer: actor,
            }),
          }
        : {
            kind: 'skill' as const,
            ...(this.options.applySkillReview ?? applyApprovedSkillReview)({
              workspaceRoot: workspace.root,
              reviewId,
              reviewer: actor,
            }),
          }
      this.options.appState.auditEvents.create({
        category: 'provenance',
        action: isReplay ? 'review.apply.replayed' : 'review.applied',
        actor,
        targetType: 'provenance-review',
        targetId: reviewId,
        metadata: {
          workspaceId: workspace.workspaceId,
          kind: applied.kind,
          ...(decision ? { decisionId: decision.decisionId } : {}),
          reviewHash: itemHash,
        },
      })
      return applied
    } catch (error) {
      if (decision) {
        this.options.appState.auditEvents.create({
          category: 'provenance',
          action: 'review.apply.failed',
          actor,
          targetType: 'provenance-review',
          targetId: reviewId,
          metadata: {
            workspaceId: workspace.workspaceId,
            kind: item.kind,
            decisionId: decision.decisionId,
            reviewHash: itemHash,
          },
        })
      }
      throw error
    }
  }

  private actor(input: { actor?: string; reviewer?: string }): string {
    return normalizedText(input.actor) ?? normalizedText(input.reviewer) ?? 'operator'
  }

  private requireWorkspace(workspaceIdInput: string): LocalGatewayWorkspaceRecord {
    const workspaceId = workspaceIdInput.trim()
    if (!workspaceId) throw new Error('Provenance workspaceId is required.')
    const workspace = this.options.appState.workspaces.get(workspaceId)
    if (!workspace) throw new Error('Unknown gateway workspace.')
    return workspace
  }

  private requireReviewId(reviewIdInput: string): string {
    const reviewId = reviewIdInput.trim()
    if (!reviewId) throw new Error('Provenance reviewId is required.')
    return reviewId
  }

  private requireReview(item: ProvenanceReviewItem | undefined, reviewId: string): ProvenanceReviewItem {
    if (!item) throw new Error(`Unknown provenance review item: ${reviewId}`)
    return item
  }

  private assertDecisionCanProceed(
    item: ProvenanceReviewItem,
    decision: Extract<ProvenanceReviewStatus, 'approved' | 'rejected'>,
  ): void {
    if (item.status === 'rejected') {
      throw new Error('Rejected provenance review items cannot be changed.')
    }
    if (item.status === 'applied') {
      throw new Error(`Applied provenance review items cannot be ${decision}.`)
    }
  }
}
