import { createHash } from 'node:crypto'
import { createMainspringRuntimeId } from '#protocol'

export interface ApprovalReceipt {
  approvalId: string
  runId: string
  targetKey: string
  inputHash: string
  actor: string
  scope: string
  expiresAt: string
  policyRule: string
  nonce: string
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeValue(entry)]),
  )
}

export function hashApprovalInput(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(normalizeValue(value) ?? null)).digest('hex')
}

export function createApprovalReceipt(input: {
  approvalId: string
  runId: string
  targetKey: string
  toolInput: unknown
  actor?: string
  scope?: string
  expiresAt?: string
  expiresInMs?: number
  policyRule?: string
  nonce?: string
}): ApprovalReceipt {
  const expiresAt =
    input.expiresAt ??
    new Date(Date.now() + Math.max(1_000, input.expiresInMs ?? 5 * 60 * 1_000)).toISOString()

  return {
    approvalId: input.approvalId,
    runId: input.runId,
    targetKey: input.targetKey,
    inputHash: hashApprovalInput(input.toolInput),
    actor: input.actor ?? 'runtime-approval',
    scope: input.scope ?? `run:${input.runId}`,
    expiresAt,
    policyRule: input.policyRule ?? 'tool approval granted',
    nonce: input.nonce ?? createMainspringRuntimeId('approval_receipt'),
  }
}

export function assertApprovalReceipt(input: {
  receipt: ApprovalReceipt
  runId: string
  targetKey: string
  toolInput: unknown
  usedNonces?: Set<string>
  now?: Date
}): void {
  const now = input.now ?? new Date()
  const { receipt } = input
  if (receipt.runId !== input.runId) {
    throw new Error('Approval receipt run does not match this execution.')
  }
  if (receipt.targetKey !== input.targetKey) {
    throw new Error('Approval receipt target does not match this tool.')
  }
  if (Date.parse(receipt.expiresAt) <= now.getTime()) {
    throw new Error('Approval receipt has expired.')
  }
  if (receipt.inputHash !== hashApprovalInput(input.toolInput)) {
    throw new Error('Approval receipt input does not match this tool call.')
  }
  if (input.usedNonces?.has(receipt.nonce)) {
    throw new Error('Approval receipt has already been used.')
  }
  input.usedNonces?.add(receipt.nonce)
}
