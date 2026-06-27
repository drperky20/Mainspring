import { z } from 'zod'
import {
  ApprovalPolicySchema,
  MainspringRuntimeProfileSchema,
  DEFAULT_MAINSPRING_RUNTIME_PROFILE,
  RuntimePolicySchema,
} from '#protocol'
import { TurnEventSchema } from './events.js'
import { TurnInputSchema, TurnSourceSchema } from './turn.js'

// ============================================================
// Mainspring control channel.
// Runtime dials OUT: ws://api/internal/mainspring/:cellId + internal token.
// Down: push commands (no poll). Up: event batches with per-turn seq;
// API ACKs highest seq; runtime journals unACKed and replays on reconnect.
// Seq is the idempotency key.
// ============================================================

export const MAINSPRING_CHANNEL_PROTOCOL_VERSION = 1
export const MAINSPRING_CHANNEL_PATH_PREFIX = '/internal/v1/mainspring/channel'
export const MAINSPRING_CHANNEL_TOKEN_HEADER = 'x-mainspring-internal-token'

export function mainspringChannelPath(cellId: string): string {
  return `${MAINSPRING_CHANNEL_PATH_PREFIX}/${cellId}`
}

export const TurnDispatchSchema = z.object({
  turnId: z.string().min(1),
  sessionId: z.string().min(1),
  ownerId: z.string().min(1),
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  traceId: z.string().min(1),
  source: TurnSourceSchema,
  input: TurnInputSchema,
  systemPrompt: z.string().min(1).optional(),
  approvalPolicy: ApprovalPolicySchema,
  policy: RuntimePolicySchema,
  runtimeProfile: MainspringRuntimeProfileSchema.default(DEFAULT_MAINSPRING_RUNTIME_PROFILE),
  providerChain: z.array(z.string().min(1)).default([]),
  // Highest event seq already persisted by the control plane at dispatch time.
  // Mainspring numbers runtime events from seqBase+1 and is the sole event
  // writer for the turn after dispatch.
  seqBase: z.number().int().nonnegative().default(0),
})
export type TurnDispatch = z.infer<typeof TurnDispatchSchema>

export const PendingApprovalResumeSchema = z.object({
  approvalId: z.string().min(1),
  toolCallId: z.string().nullable().optional(),
  kind: z.string().min(1),
})

// --- downstream: control plane to runtime ----------------------

export const ChannelDownMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello_ack'),
    protocolVersion: z.literal(MAINSPRING_CHANNEL_PROTOCOL_VERSION),
    serverTime: z.string(),
  }),
  z.object({ t: z.literal('dispatch_turn'), turn: TurnDispatchSchema }),
  z.object({ t: z.literal('cancel_turn'), turnId: z.string().min(1), reason: z.string().optional() }),
  z.object({
    t: z.literal('approval_resolved'),
    turnId: z.string().min(1),
    approvalId: z.string().min(1),
    decision: z.enum(['approved', 'denied', 'expired']),
    reason: z.string().optional(),
  }),
  z.object({
    t: z.literal('resume_turn'),
    turn: TurnDispatchSchema,
    lastAckedSeq: z.number().int().nonnegative(),
    pendingApprovals: z.array(PendingApprovalResumeSchema).default([]),
  }),
  z.object({ t: z.literal('event_ack'), turnId: z.string().min(1), seq: z.number().int().nonnegative() }),
  z.object({ t: z.literal('shutdown'), reason: z.string().optional() }),
])
export type ChannelDownMessage = z.infer<typeof ChannelDownMessageSchema>

// --- upstream: runtime to control plane ------------------------

export const RuntimeTurnSnapshotSchema = z.object({
  turnId: z.string().min(1),
  lastSeq: z.number().int().nonnegative(),
  pendingApprovalIds: z.array(z.string().min(1)).default([]),
})

export const ChannelUpMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello'),
    protocolVersion: z.literal(MAINSPRING_CHANNEL_PROTOCOL_VERSION),
    cellId: z.string().min(1),
    runtimeVersion: z.string().optional(),
    activeTurns: z.array(RuntimeTurnSnapshotSchema).default([]),
  }),
  z.object({
    t: z.literal('events'),
    turnId: z.string().min(1),
    events: z.array(TurnEventSchema).min(1),
  }),
  z.object({
    t: z.literal('status'),
    at: z.string(),
    activeTurns: z.array(RuntimeTurnSnapshotSchema).default([]),
  }),
])
export type ChannelUpMessage = z.infer<typeof ChannelUpMessageSchema>

export function parseChannelDownMessage(value: unknown): ChannelDownMessage {
  return ChannelDownMessageSchema.parse(value)
}

export function parseChannelUpMessage(value: unknown): ChannelUpMessage {
  return ChannelUpMessageSchema.parse(value)
}
