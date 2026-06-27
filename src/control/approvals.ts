import { z } from 'zod'
import { ApprovalDecisionSchema, ApprovalKindSchema } from './events.js'

// ============================================================
// First-class approvals (D5).
// One table, one resolution endpoint: POST /v1/approvals/:id/resolve
// ============================================================

export const APPROVAL_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24h, per-policy override

export const ApprovalStatusSchema = z.enum(['pending', 'approved', 'denied', 'expired'])
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>

export const ApprovalSchema = z.object({
  id: z.string().min(1),
  turnId: z.string().min(1),
  cellId: z.string().min(1).nullable().optional(),
  kind: ApprovalKindSchema,
  title: z.string().min(1),
  reason: z.string().nullable().optional(),
  toolCallId: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  status: ApprovalStatusSchema,
  requestedAt: z.string(),
  expiresAt: z.string(),
  resolvedBy: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  traceId: z.string().min(1),
})
export type Approval = z.infer<typeof ApprovalSchema>

export const ResolveApprovalRequestSchema = z.object({
  decision: z.enum(['approved', 'denied']),
  reason: z.string().max(2000).optional(),
})
export type ResolveApprovalRequest = z.infer<typeof ResolveApprovalRequestSchema>

export function approvalStatusForDecision(
  decision: z.infer<typeof ApprovalDecisionSchema>,
): ApprovalStatus {
  return decision
}

export function isApprovalExpired(approval: Pick<Approval, 'status' | 'expiresAt'>, now: Date): boolean {
  if (approval.status !== 'pending') return false
  const expires = Date.parse(approval.expiresAt)
  return Number.isFinite(expires) && expires <= now.getTime()
}
