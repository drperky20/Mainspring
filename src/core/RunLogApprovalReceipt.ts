import { createHmac, randomUUID } from 'node:crypto'
import type { RuntimePolicy } from '#protocol'
import { hashApprovalInput, type ApprovalReceipt } from '../policy/ApprovalReceipt.js'
import type {
  AgentSpec,
  RunLogApprovalReceipt,
  RunLogApprovalRequestSnapshot,
  RunRecord,
} from './types.js'
import type { RuntimeTool } from '../tools/ToolRegistry.js'
import { nowIso } from './ids.js'

export const RUNLOG_APPROVAL_RECEIPT_VERSION = 1 as const
export const LOCAL_DEV_APPROVAL_RECEIPT_KEY_ID = 'local-dev'
const LOCAL_DEV_APPROVAL_RECEIPT_KEY = 'mainspring-local-dev-runlog-approval-key'

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => normalizeValue(entry))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeValue(entry)]),
  )
}

export function stableRunLogHash(value: unknown): string {
  return hashApprovalInput(normalizeValue(value))
}

export function resolveRunLogApprovalKey(input?: {
  key?: string
}): { key: string; keyId: string; localDevFallback: boolean } {
  const key = input?.key ?? process.env.MAINSPRING_RUNLOG_APPROVAL_KEY
  if (key && key.trim()) {
    return { key, keyId: 'configured', localDevFallback: false }
  }
  return {
    key: LOCAL_DEV_APPROVAL_RECEIPT_KEY,
    keyId: LOCAL_DEV_APPROVAL_RECEIPT_KEY_ID,
    localDevFallback: true,
  }
}

export function createRunLogApprovalRequestSnapshot(input: {
  approvalId: string
  run: RunRecord
  agent: AgentSpec
  tool: RuntimeTool
  toolCallId: string
  toolInput: unknown
  cwd: string
  policy: RuntimePolicy
  requestedAt?: string
}): RunLogApprovalRequestSnapshot {
  const workspaceId = input.run.workspaceId ?? input.run.runId
  return {
    approvalId: input.approvalId,
    runId: input.run.runId,
    agentId: input.run.agentId,
    sessionId: input.run.sessionId,
    parentRunId: input.run.parentRunId,
    toolCallId: input.toolCallId,
    toolName: input.tool.manifest.key,
    toolInput: input.toolInput,
    toolInputHash: stableRunLogHash(input.toolInput),
    cwd: input.cwd,
    workspaceId,
    workspaceHash: stableRunLogHash({ cwd: input.cwd, workspaceId }),
    policyHash: stableRunLogHash(input.policy),
    toolManifestHash: stableRunLogHash(input.tool.manifest),
    providerContextHash: stableRunLogHash({
      providerId: input.run.providerId ?? input.agent.providerId,
      modelId: input.run.modelId ?? input.agent.modelId,
    }),
    riskSnapshotHash: stableRunLogHash({ mode: 'runtime-policy-guard' }),
    requestedAt: input.requestedAt ?? nowIso(),
  }
}

export function createRunLogApprovalReceipt(input: {
  request: RunLogApprovalRequestSnapshot
  decision: 'approved' | 'denied'
  actor?: string
  decidedAt?: string
  expiresAt?: string
  expiresInMs?: number
  key?: string
  nonce?: string
}): RunLogApprovalReceipt {
  const keyInfo = resolveRunLogApprovalKey({ key: input.key })
  const decidedAt = input.decidedAt ?? nowIso()
  const expiresAt =
    input.expiresAt ??
    new Date(Date.now() + Math.max(1_000, input.expiresInMs ?? 5 * 60 * 1_000)).toISOString()
  const receiptWithoutSignature: Omit<RunLogApprovalReceipt, 'signature'> = {
    version: RUNLOG_APPROVAL_RECEIPT_VERSION,
    receiptId: `rlap_${randomUUID().replaceAll('-', '')}`,
    approvalId: input.request.approvalId,
    runId: input.request.runId,
    agentId: input.request.agentId,
    sessionId: input.request.sessionId,
    parentRunId: input.request.parentRunId,
    toolCallId: input.request.toolCallId,
    toolName: input.request.toolName,
    decision: input.decision,
    actor: input.actor ?? 'local-operator',
    requestedAt: input.request.requestedAt,
    decidedAt,
    expiresAt,
    toolInputHash: input.request.toolInputHash,
    workspaceHash: input.request.workspaceHash,
    policyHash: input.request.policyHash,
    toolManifestHash: input.request.toolManifestHash,
    providerContextHash: input.request.providerContextHash,
    riskSnapshotHash: input.request.riskSnapshotHash,
    nonce: input.nonce ?? `nonce_${randomUUID().replaceAll('-', '')}`,
    idempotencyKey: `approval:${input.request.approvalId}:${input.decision}`,
    keyId: keyInfo.keyId,
  }
  return {
    ...receiptWithoutSignature,
    signature: signRunLogApprovalReceipt(receiptWithoutSignature, keyInfo.key),
  }
}

export function signRunLogApprovalReceipt(
  receipt: Omit<RunLogApprovalReceipt, 'signature'>,
  key: string,
): string {
  return createHmac('sha256', key)
    .update(JSON.stringify(normalizeValue(receipt)))
    .digest('hex')
}

function receiptSigningPayload(
  receipt: RunLogApprovalReceipt,
): Omit<RunLogApprovalReceipt, 'signature'> {
  const { signature: _signature, ...payload } = receipt
  return payload
}

export function assertRunLogApprovalReceipt(input: {
  receipt: RunLogApprovalReceipt
  request: RunLogApprovalRequestSnapshot
  key?: string
  now?: Date
}): void {
  const { receipt, request } = input
  const keyInfo = resolveRunLogApprovalKey({ key: input.key })
  const expectedSignature = signRunLogApprovalReceipt(receiptSigningPayload(receipt), keyInfo.key)
  if (receipt.version !== RUNLOG_APPROVAL_RECEIPT_VERSION) {
    throw new Error('RunLog approval receipt version is unsupported.')
  }
  if (receipt.signature !== expectedSignature) {
    throw new Error('RunLog approval receipt signature is invalid.')
  }
  if (Date.parse(receipt.expiresAt) <= (input.now ?? new Date()).getTime()) {
    throw new Error('RunLog approval receipt has expired.')
  }
  if (receipt.decision !== 'approved') {
    throw new Error('RunLog approval receipt is not approved.')
  }
  const mismatches = [
    ['approvalId', receipt.approvalId, request.approvalId],
    ['runId', receipt.runId, request.runId],
    ['agentId', receipt.agentId, request.agentId],
    ['sessionId', receipt.sessionId, request.sessionId],
    ['parentRunId', receipt.parentRunId ?? '', request.parentRunId ?? ''],
    ['toolCallId', receipt.toolCallId, request.toolCallId],
    ['toolName', receipt.toolName, request.toolName],
    ['toolInputHash', receipt.toolInputHash, request.toolInputHash],
    ['workspaceHash', receipt.workspaceHash, request.workspaceHash],
    ['policyHash', receipt.policyHash, request.policyHash],
    ['toolManifestHash', receipt.toolManifestHash, request.toolManifestHash],
    ['providerContextHash', receipt.providerContextHash, request.providerContextHash],
    ['riskSnapshotHash', receipt.riskSnapshotHash, request.riskSnapshotHash],
  ].filter(([, left, right]) => left !== right)
  if (mismatches.length > 0) {
    throw new Error(
      `RunLog approval receipt does not match request snapshot: ${mismatches
        .map(([key]) => key)
        .join(', ')}`,
    )
  }
}

export function legacyApprovalReceiptFromRunLog(
  receipt: RunLogApprovalReceipt,
  request: RunLogApprovalRequestSnapshot,
): ApprovalReceipt {
  return {
    approvalId: receipt.approvalId,
    runId: receipt.runId,
    targetKey: receipt.toolName,
    inputHash: request.toolInputHash,
    actor: receipt.actor,
    scope: `run:${receipt.runId}`,
    expiresAt: receipt.expiresAt,
    policyRule: 'RunLog approval receipt validated',
    nonce: receipt.nonce,
  }
}
