import { z } from 'zod'

// ============================================================
// Session → Turn model (D4)
// Session = conversation with a Mainspring runtime.
// Turn = one ask→answer cycle; may run tools for minutes.
// ============================================================

export const SessionKindSchema = z.enum(['chat', 'api', 'schedule'])
export type SessionKind = z.infer<typeof SessionKindSchema>

export const SessionSchema = z.object({
  id: z.string().min(1),
  computerId: z.string().min(1),
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  userId: z.string().min(1),
  kind: SessionKindSchema,
  title: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Session = z.infer<typeof SessionSchema>

// Single 8-state machine. Transitions ONLY via events through turn-lifecycle.
export const TurnStatusSchema = z.enum([
  'queued',
  'dispatching',
  'running',
  'awaiting_approval',
  'completed',
  'failed',
  'cancelled',
  'timed_out',
])
export type TurnStatus = z.infer<typeof TurnStatusSchema>

export const TurnTerminalStatuses = ['completed', 'failed', 'cancelled', 'timed_out'] as const
export type TurnTerminalStatus = (typeof TurnTerminalStatuses)[number]

export function isTerminalTurnStatus(status: TurnStatus): status is TurnTerminalStatus {
  return (TurnTerminalStatuses as readonly string[]).includes(status)
}

const TURN_TRANSITIONS: Record<TurnStatus, readonly TurnStatus[]> = {
  // queued → running directly is legal: the dispatching marker is advisory
  // and may be skipped when Mainspring picks a turn up immediately.
  queued: ['dispatching', 'running', 'cancelled', 'failed', 'timed_out'],
  dispatching: ['running', 'cancelled', 'failed', 'timed_out'],
  running: ['awaiting_approval', 'completed', 'failed', 'cancelled', 'timed_out'],
  awaiting_approval: ['running', 'completed', 'failed', 'cancelled', 'timed_out'],
  completed: [],
  failed: [],
  cancelled: [],
  timed_out: [],
}

export function isValidTurnTransition(from: TurnStatus, to: TurnStatus): boolean {
  if (from === to) return true
  return TURN_TRANSITIONS[from].includes(to)
}

export function nextTurnStatus(current: TurnStatus, proposed: TurnStatus): TurnStatus {
  return isValidTurnTransition(current, proposed) ? proposed : current
}

export const TurnInputSchema = z.object({
  message: z.string(),
  attachments: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        contentType: z.string().min(1),
        size: z.number().int().nonnegative(),
      }),
    )
    .optional(),
})
export type TurnInput = z.infer<typeof TurnInputSchema>

export const TurnOutputSchema = z.object({
  text: z.string().nullable(),
  error: z.string().nullable().optional(),
})
export type TurnOutput = z.infer<typeof TurnOutputSchema>

export const TurnSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  status: TurnStatusSchema,
  input: TurnInputSchema,
  output: TurnOutputSchema.nullable().optional(),
  agentVersionId: z.string().min(1).nullable().optional(),
  scheduleId: z.string().min(1).nullable().optional(),
  traceId: z.string().min(1),
  tokensIn: z.number().int().nonnegative().nullable().optional(),
  tokensOut: z.number().int().nonnegative().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Turn = z.infer<typeof TurnSchema>

export const TurnSourceSchema = z.enum(['console', 'api', 'schedule', 'automation', 'test'])
export type TurnSource = z.infer<typeof TurnSourceSchema>
